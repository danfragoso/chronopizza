// ── WAL operation ─────────────────────────────────────────────────────────────

export interface WALOperation {
  index: number
  op: 'W' | 'D'
  key: string
  dbName: string
  /** 'schema' | 'data' | 'sys' | 'index' | 'indexes' | 'idx' | 'raw' */
  keyType: string
  /** key parts after the dbName prefix, split by ':' */
  keyParts: string[]
  /** byte offset in the source buffer where the value starts */
  valueStart: number
  /** byte offset where the value ends (exclusive) */
  valueEnd: number
}

// ── Parsed schema types ───────────────────────────────────────────────────────

export interface Column {
  name: string
  type: string
  nullable: boolean
  primary_key: boolean
}

export interface TableSchema {
  name: string
  columns: Column[]
  primary_key: string
  created_at: string
  next_rowid: number
  autoincrement: boolean
}

export interface IndexDef {
  name: string
  table: string
  columns: Array<{ name: string; desc: boolean }>
  unique?: boolean
}

// ── DB state at a given timeline position ────────────────────────────────────

export interface TableState {
  schema: TableSchema | null
  /** rowid string → parsed row object */
  rows: Record<string, Record<string, unknown>>
  rowCount: number
  /** tracks whether table exists at this point (might have been dropped) */
  exists: boolean
}

export interface DBState {
  tables: Record<string, TableState>
  indexes: IndexDef[]
  /** raw non-pizzasql keys (sessions, api keys, etc.) */
  rawKeys: Record<string, string>
}

export interface AppDBState {
  databases: Record<string, DBState>
  dbNames: string[]
  /** operation at current position */
  currentOp: WALOperation | null
}

// ── Worker message protocol ───────────────────────────────────────────────────

export type ToWorker =
  | { type: 'parse'; file: File }
  | { type: 'getState'; position: number }
  | { type: 'getOperation'; index: number }
  | { type: 'exportDB'; dbName: string; position: number; format: 'json' | 'sql' }
  | { type: 'exportTable'; dbName: string; tableName: string; position: number; format: 'json' | 'sql' | 'csv' }
  | { type: 'getRecordHistory'; dbName: string; tableName: string; rowId: string; maxPosition: number }
  | { type: 'getRelevantPositions'; dbName: string; tableName: string; rowId?: string }

export type FromWorker =
  | { type: 'progress'; percent: number; opsProcessed: number }
  | { type: 'parsed'; totalOps: number; dbNames: string[]; milestones: number[] }
  | { type: 'state'; data: AppDBState }
  | { type: 'export'; data: string; filename: string }
  | { type: 'recordHistory'; history: RecordHistoryEntry[] }
  | { type: 'relevantPositions'; positions: number[]; firstPosition: number }
  | { type: 'error'; message: string }

// ── UI state ──────────────────────────────────────────────────────────────────

export type AppView = 'upload' | 'loading' | 'explorer'
export type ExplorerTab = 'tables' | 'relations' | 'raw'

// Detected FK relation between two tables
export interface Relation {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
}

// ── Breakpoints & Record History ─────────────────────────────────────────────

export interface Breakpoint {
  id: string // unique id for the breakpoint
  dbName: string
  tableName: string
  rowId?: string // if present, record-level breakpoint; otherwise table-level
}

export interface RecordHistoryEntry {
  position: number
  operation: WALOperation
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}
