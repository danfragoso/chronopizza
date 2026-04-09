/**
 * Chronopizza WAL Parser Web Worker
 *
 * Performance strategy:
 *  - Parse the entire file as Uint8Array — never decode the full 220 MB to a JS string
 *  - For each key, store a sorted list of op indices (the keyTimeline)
 *  - Values are NOT decoded at parse time; only the byte range is stored
 *  - buildStateAt() uses binary search per key → O(K · log M) per scrub step
 *  - Only the keys whose last op is ≤ position are decoded on demand
 */

import type {
  WALOperation,
  AppDBState,
  DBState,
  TableState,
  TableSchema,
  IndexDef,
  ToWorker,
  FromWorker,
  RecordHistoryEntry,
} from '../lib/types'

// ── Constants ────────────────────────────────────────────────────────────────
const CR   = 0x0d // '\r'  — record separator
const PIPE = 0x7c // '|'
const W    = 0x57 // 'W'
const D    = 0x44 // 'D'

// ── State held inside the worker ─────────────────────────────────────────────
let buffer:      Uint8Array = new Uint8Array(0)
let operations:  WALOperation[] = []
let keyTimeline: Map<string, number[]> = new Map()
let totalOps  = 0
let dbNamesArr: string[] = []
let milestones: number[] = []

// Pre-allocated TextDecoder (reused across calls)
const decoder = new TextDecoder('utf-8')

// ── WAL parsing ──────────────────────────────────────────────────────────────

function classifyKey(parts: string[]): string {
  if (parts.length === 0) return 'raw'
  switch (parts[0]) {
    case '_schema': return 'schema'
    case '_data':   return 'data'
    case '_sys':    return 'sys'
    case 'index':   return 'index'
    case 'indexes': return 'indexes'
    case 'idx':     return 'idx'
    default:        return 'raw'
  }
}

function parseWAL(buf: Uint8Array): void {
  operations  = []
  keyTimeline = new Map()
  const dbNamesSet = new Set<string>()

  const len = buf.length
  let pos = 0
  const PROGRESS_CHUNK = Math.max(1, Math.floor(len / 200)) // report ~200 times

  while (pos < len) {
    // skip leading CRs
    while (pos < len && buf[pos] === CR) pos++
    if (pos >= len) break

    const recStart = pos

    // find record end
    let recEnd = pos
    while (recEnd < len && buf[recEnd] !== CR) recEnd++

    if (recEnd > recStart) {
      const op = buf[recStart]
      if ((op === W || op === D) && buf[recStart + 1] === PIPE) {
        // key starts after "W|" or "D|"
        const keyStart = recStart + 2

        // find second pipe (end of key)
        let keyEnd = keyStart
        while (keyEnd < recEnd && buf[keyEnd] !== PIPE) keyEnd++

        // decode key (ASCII range, no alloc tricks needed for keys)
        const key = decoder.decode(buf.subarray(keyStart, keyEnd))

        const valueStart = keyEnd + 1
        const valueEnd   = recEnd

        // derive dbName and keyParts
        const colonIdx = key.indexOf(':')
        const dbName   = colonIdx !== -1 ? key.substring(0, colonIdx) : key
        const rest     = colonIdx !== -1 ? key.substring(colonIdx + 1) : ''
        const keyParts = rest.split(':')
        const keyType  = classifyKey(keyParts)

        dbNamesSet.add(dbName)

        const opObj: WALOperation = {
          index: operations.length,
          op: op === W ? 'W' : 'D',
          key,
          dbName,
          keyType,
          keyParts,
          valueStart,
          valueEnd,
        }

        operations.push(opObj)

        let kl = keyTimeline.get(key)
        if (!kl) { kl = []; keyTimeline.set(key, kl) }
        kl.push(operations.length - 1)

        // milestone: schema writes, delete ops, and _sys:tables changes
        if (
          op === D ||
          keyType === 'schema' ||
          (keyType === 'sys' && keyParts[1] === 'tables')
        ) {
          milestones.push(operations.length - 1)
        }
      }
    }

    pos = recEnd + 1

    // report progress periodically
    if (pos % PROGRESS_CHUNK < 2) {
      const pct = Math.floor((pos / len) * 100)
      postMessage({ type: 'progress', percent: pct, opsProcessed: operations.length } satisfies FromWorker)
    }
  }

  totalOps   = operations.length
  dbNamesArr = [...dbNamesSet].sort()
}

// ── State builder ─────────────────────────────────────────────────────────────

function binarySearchLast(arr: number[], target: number): number {
  let lo = 0, hi = arr.length - 1, found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] <= target) { found = mid; lo = mid + 1 }
    else hi = mid - 1
  }
  return found
}

function buildStateAt(position: number): AppDBState {
  const dbs: Record<string, DBState> = {}

  const ensureDB = (name: string): DBState => {
    if (!dbs[name]) dbs[name] = { tables: {}, indexes: [], rawKeys: {} }
    return dbs[name]
  }

  const ensureTable = (db: DBState, name: string): TableState => {
    if (!db.tables[name]) db.tables[name] = { schema: null, rows: {}, rowCount: 0, exists: false }
    return db.tables[name]
  }

  for (const [key, opIndices] of keyTimeline) {
    const found = binarySearchLast(opIndices, position)
    if (found === -1) continue

    const opIdx = opIndices[found]
    const op    = operations[opIdx]

    const db = ensureDB(op.dbName)

    if (op.op === 'D') {
      // deletion: remove row or mark table gone
      if (op.keyType === 'data') {
        const [, tableName, rowid] = op.keyParts
        if (db.tables[tableName]) {
          delete db.tables[tableName].rows[rowid]
        }
      } else if (op.keyType === 'schema') {
        const tableName = op.keyParts[1]
        if (db.tables[tableName]) db.tables[tableName].exists = false
      }
      continue
    }

    // W operation — decode value only now
    const rawValue = decoder.decode(buffer.subarray(op.valueStart, op.valueEnd))

    switch (op.keyType) {
      case 'sys': {
        // _sys:tables → JSON array of table names that currently exist
        if (op.keyParts[1] === 'tables') {
          try {
            const names: string[] = JSON.parse(rawValue)
            for (const n of names) {
              const t = ensureTable(db, n)
              t.exists = true
            }
          } catch { /* malformed */ }
        }
        break
      }

      case 'schema': {
        const tableName = op.keyParts[1]
        const t = ensureTable(db, tableName)
        try {
          t.schema = JSON.parse(rawValue) as TableSchema
          t.exists = true
        } catch { /* malformed */ }
        break
      }

      case 'data': {
        const [, tableName, rowid] = op.keyParts
        const t = ensureTable(db, tableName)
        t.exists = true
        try {
          t.rows[rowid] = JSON.parse(rawValue) as Record<string, unknown>
        } catch { /* malformed */ }
        break
      }

      case 'index': {
        try {
          const idx = JSON.parse(rawValue) as IndexDef
          // deduplicate by name
          const existing = db.indexes.findIndex(i => i.name === idx.name)
          if (existing !== -1) db.indexes[existing] = idx
          else db.indexes.push(idx)
        } catch { /* malformed */ }
        break
      }

      case 'raw':
      case 'indexes':
      case 'idx':
      default: {
        // only store raw keys for non-idx entries to keep memory lean
        if (op.keyType !== 'idx') {
          db.rawKeys[key] = rawValue
        }
        break
      }
    }
  }

  // compute row counts; filter tables that don't exist
  for (const db of Object.values(dbs)) {
    for (const [name, t] of Object.entries(db.tables)) {
      if (!t.exists) { delete db.tables[name]; continue }
      t.rowCount = Object.keys(t.rows).length
    }
  }

  const currentOp = position >= 0 && position < totalOps
    ? operations[position]
    : null

  return { databases: dbs, dbNames: dbNamesArr, currentOp }
}

// ── Export helpers ────────────────────────────────────────────────────────────

function exportDBAsJSON(dbName: string, position: number): string {
  const state = buildStateAt(position)
  const db    = state.databases[dbName]
  if (!db) return '{}'
  return JSON.stringify(db.tables, null, 2)
}

function exportTableAsJSON(dbName: string, tableName: string, position: number): string {
  const state = buildStateAt(position)
  const table = state.databases[dbName]?.tables[tableName]
  if (!table) return '[]'
  return JSON.stringify(Object.values(table.rows), null, 2)
}

function exportTableAsCSV(dbName: string, tableName: string, position: number): string {
  const state = buildStateAt(position)
  const table = state.databases[dbName]?.tables[tableName]
  if (!table || !table.schema) return ''

  const cols    = table.schema.columns.map(c => c.name)
  const rows    = Object.values(table.rows)
  const csvRows = [
    cols.map(c => JSON.stringify(c)).join(','),
    ...rows.map(row =>
      cols.map(c => {
        const v = (row as Record<string, unknown>)[c]
        return v === null || v === undefined ? '' : JSON.stringify(v)
      }).join(',')
    ),
  ]
  return csvRows.join('\r\n')
}

function exportTableAsSQL(dbName: string, tableName: string, position: number): string {
  const state = buildStateAt(position)
  const table = state.databases[dbName]?.tables[tableName]
  if (!table || !table.schema) return ''

  const schema = table.schema
  const colDefs = schema.columns.map(c => {
    const parts = [`  ${c.name} ${c.type}`]
    if (!c.nullable) parts.push('NOT NULL')
    if (c.primary_key) parts.push('PRIMARY KEY')
    return parts.join(' ')
  })

  let sql = `CREATE TABLE ${tableName} (\n${colDefs.join(',\n')}\n);\n\n`

  const cols = schema.columns.map(c => c.name)
  for (const row of Object.values(table.rows)) {
    const vals = cols.map(c => {
      const v = (row as Record<string, unknown>)[c]
      if (v === null || v === undefined) return 'NULL'
      if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
      return String(v)
    })
    sql += `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`
  }

  return sql
}

function getRecordHistory(dbName: string, tableName: string, rowId: string, maxPosition: number) {
  const recordKey = `${dbName}:_data:${tableName}:${rowId}`
  const opIndices = keyTimeline.get(recordKey)
  
  if (!opIndices) {
    return []
  }

  const history: {
    position: number
    operation: WALOperation
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
  }[] = []

  // Filter operations up to maxPosition
  const relevantOps = opIndices.filter(idx => idx <= maxPosition)

  for (let i = 0; i < relevantOps.length; i++) {
    const opIdx = relevantOps[i]
    const op = operations[opIdx]

    // Build state before this operation
    const beforePosition = i > 0 ? relevantOps[i - 1] : -1
    let before: Record<string, unknown> | null = null
    
    if (beforePosition >= 0) {
      const beforeOp = operations[beforePosition]
      if (beforeOp.op === 'W') {
        try {
          const rawValue = decoder.decode(buffer.subarray(beforeOp.valueStart, beforeOp.valueEnd))
          before = JSON.parse(rawValue) as Record<string, unknown>
        } catch { /* malformed */ }
      }
    }

    // Build state after this operation
    let after: Record<string, unknown> | null = null
    if (op.op === 'W') {
      try {
        const rawValue = decoder.decode(buffer.subarray(op.valueStart, op.valueEnd))
        after = JSON.parse(rawValue) as Record<string, unknown>
      } catch { /* malformed */ }
    }

    history.push({
      position: opIdx,
      operation: op,
      before,
      after,
    })
  }

  return history
}

function getRelevantPositions(dbName: string, tableName: string, rowId?: string) {
  const positions: number[] = []
  let firstPosition = -1

  if (rowId) {
    // Get positions for specific record
    const recordKey = `${dbName}:_data:${tableName}:${rowId}`
    const opIndices = keyTimeline.get(recordKey)
    
    if (opIndices && opIndices.length > 0) {
      positions.push(...opIndices)
      firstPosition = opIndices[0]
    }
    
    // Also include schema changes for this table
    const schemaKey = `${dbName}:_schema:${tableName}`
    const schemaIndices = keyTimeline.get(schemaKey)
    if (schemaIndices) {
      positions.push(...schemaIndices)
    }
  } else {
    // Get all positions for table (schema + all data operations)
    const schemaKey = `${dbName}:_schema:${tableName}`
    const schemaIndices = keyTimeline.get(schemaKey)
    if (schemaIndices) {
      positions.push(...schemaIndices)
      if (firstPosition === -1 || (schemaIndices[0] < firstPosition)) {
        firstPosition = schemaIndices[0]
      }
    }
    
    // Get all data operations for this table
    for (const [key, opIndices] of keyTimeline) {
      if (key.startsWith(`${dbName}:_data:${tableName}:`)) {
        positions.push(...opIndices)
        if (firstPosition === -1 || (opIndices[0] < firstPosition)) {
          firstPosition = opIndices[0]
        }
      }
    }
  }

  // Sort and deduplicate
  return {
    positions: [...new Set(positions)].sort((a, b) => a - b),
    firstPosition,
  }
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data

  if (msg.type === 'parse') {
    try {
      const ab = await msg.file.arrayBuffer()
      buffer   = new Uint8Array(ab)

      postMessage({ type: 'progress', percent: 0, opsProcessed: 0 } satisfies FromWorker)
      parseWAL(buffer)
      postMessage({
        type: 'parsed',
        totalOps,
        dbNames: dbNamesArr,
        milestones,
      } satisfies FromWorker)
    } catch (err) {
      postMessage({ type: 'error', message: String(err) } satisfies FromWorker)
    }
    return
  }

  if (msg.type === 'getState') {
    try {
      const data = buildStateAt(msg.position)
      postMessage({ type: 'state', data } satisfies FromWorker)
    } catch (err) {
      postMessage({ type: 'error', message: String(err) } satisfies FromWorker)
    }
    return
  }

  if (msg.type === 'exportDB') {
    const data = exportDBAsJSON(msg.dbName, msg.position)
    postMessage({
      type: 'export',
      data,
      filename: `${msg.dbName}_pos${msg.position}.json`,
    } satisfies FromWorker)
    return
  }

  if (msg.type === 'exportTable') {
    let data: string
    let ext: string
    if (msg.format === 'csv') {
      data = exportTableAsCSV(msg.dbName, msg.tableName, msg.position)
      ext  = 'csv'
    } else if (msg.format === 'sql') {
      data = exportTableAsSQL(msg.dbName, msg.tableName, msg.position)
      ext  = 'sql'
    } else {
      data = exportTableAsJSON(msg.dbName, msg.tableName, msg.position)
      ext  = 'json'
    }
    postMessage({
      type: 'export',
      data,
      filename: `${msg.tableName}_pos${msg.position}.${ext}`,
    } satisfies FromWorker)
    return
  }

  if (msg.type === 'getRecordHistory') {
    try {
      const history = getRecordHistory(msg.dbName, msg.tableName, msg.rowId, msg.maxPosition)
      postMessage({
        type: 'recordHistory',
        history,
      } satisfies FromWorker)
    } catch (err) {
      postMessage({ type: 'error', message: String(err) } satisfies FromWorker)
    }
    return
  }

  if (msg.type === 'getRelevantPositions') {
    try {
      const { positions, firstPosition } = getRelevantPositions(msg.dbName, msg.tableName, msg.rowId)
      postMessage({
        type: 'relevantPositions',
        positions,
        firstPosition,
      } satisfies FromWorker)
    } catch (err) {
      postMessage({ type: 'error', message: String(err) } satisfies FromWorker)
    }
    return
  }

  if (msg.type === 'getOperations') {
    postMessage({ type: 'operations', ops: operations } satisfies FromWorker)
    return
  }
}
