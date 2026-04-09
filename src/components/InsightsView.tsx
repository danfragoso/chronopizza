import { useMemo } from 'react'
import type { AppDBState, WALOperation } from '../lib/types'

interface Props {
  dbState: AppDBState | null
  allOps:  WALOperation[]
}

// ── Primitives ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-4 flex flex-col gap-1 min-w-0">
      <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</span>
      <span className="text-2xl font-bold text-foreground tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

function HorizBar({ label, sub, value, max, color, suffix = '' }: {
  label: string; sub?: string; value: number; max: number; color: string; suffix?: string
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 1 : 0) : 0
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex flex-col min-w-0 w-28 shrink-0">
        <span className="text-xs font-mono truncate text-foreground">{label}</span>
        {sub && <span className="text-xs text-muted-foreground truncate">{sub}</span>}
      </div>
      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono w-16 text-right shrink-0 text-foreground tabular-nums">
        {value.toLocaleString()}{suffix}
      </span>
    </div>
  )
}

function SegmentedBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return <div className="h-5 bg-muted rounded-full" />
  return (
    <div className="h-5 flex rounded-full overflow-hidden gap-px">
      {segments.filter(s => s.value > 0).map(seg => (
        <div
          key={seg.label}
          className={`h-full transition-all duration-300 ${seg.color}`}
          style={{ width: `${(seg.value / total) * 100}%` }}
          title={`${seg.label}: ${seg.value.toLocaleString()} (${((seg.value / total) * 100).toFixed(1)}%)`}
        />
      ))}
    </div>
  )
}

function Legend({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
      {items.filter(i => i.value > 0).map(item => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className={`w-2.5 h-2.5 rounded-sm shrink-0 ${item.color}`} />
          <span className="text-xs text-muted-foreground">
            {item.label}
            <span className="font-mono ml-1 text-foreground">{item.value.toLocaleString()}</span>
            {total > 0 && (
              <span className="ml-1 text-muted-foreground/60">({((item.value / total) * 100).toFixed(1)}%)</span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 flex flex-col gap-3 min-w-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  )
}

function Empty({ message }: { message: string }) {
  return <p className="text-xs text-muted-foreground py-4 text-center">{message}</p>
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InsightsView({ dbState, allOps }: Props) {
  const hasOps = allOps.length > 0

  // ── Derived: db-level state metrics ──────────────────────────────────────
  const dbMetrics = useMemo(() => {
    if (!dbState) return []
    return Object.entries(dbState.databases).map(([name, db]) => {
      const tables   = Object.values(db.tables).filter(t => t.exists)
      const totalRows = tables.reduce((s, t) => s + t.rowCount, 0)
      return {
        name,
        totalRows,
        tableCount:   tables.length,
        indexCount:   db.indexes.length,
        rawKeyCount:  Object.keys(db.rawKeys).length,
      }
    }).sort((a, b) => b.totalRows - a.totalRows)
  }, [dbState])

  // ── Derived: top tables across all DBs ───────────────────────────────────
  const topTables = useMemo(() => {
    if (!dbState) return []
    const all: { dbName: string; tableName: string; rowCount: number }[] = []
    for (const [dbName, db] of Object.entries(dbState.databases)) {
      for (const [tableName, table] of Object.entries(db.tables)) {
        if (table.exists && table.rowCount > 0) {
          all.push({ dbName, tableName, rowCount: table.rowCount })
        }
      }
    }
    return all.sort((a, b) => b.rowCount - a.rowCount).slice(0, 8)
  }, [dbState])

  // ── Derived: operation breakdowns from allOps ─────────────────────────────
  const { globalTypeCounts, dbOpStats } = useMemo(() => {
    const globalTypeCounts: Record<string, number> = {}
    const dbOpStats: Record<string, {
      writes: number; deletes: number
      dataOps: number; indexOps: number; schemaOps: number; sysOps: number
    }> = {}

    for (const op of allOps) {
      globalTypeCounts[op.keyType] = (globalTypeCounts[op.keyType] ?? 0) + 1

      if (!dbOpStats[op.dbName]) {
        dbOpStats[op.dbName] = { writes: 0, deletes: 0, dataOps: 0, indexOps: 0, schemaOps: 0, sysOps: 0 }
      }
      const s = dbOpStats[op.dbName]
      if (op.op === 'W') s.writes++; else s.deletes++
      if      (op.keyType === 'data')                                    s.dataOps++
      else if (['index', 'indexes', 'idx'].includes(op.keyType))         s.indexOps++
      else if (op.keyType === 'schema')                                  s.schemaOps++
      else if (op.keyType === 'sys')                                     s.sysOps++
    }

    return { globalTypeCounts, dbOpStats }
  }, [allOps])

  // ── Summary totals ────────────────────────────────────────────────────────
  const totalRows  = dbMetrics.reduce((s, d) => s + d.totalRows, 0)
  const totalTables = dbMetrics.reduce((s, d) => s + d.tableCount, 0)

  const opTypeSegments = [
    { label: 'data',    value: globalTypeCounts['data']    ?? 0, color: 'bg-sky-500' },
    { label: 'schema',  value: globalTypeCounts['schema']  ?? 0, color: 'bg-purple-500' },
    { label: 'sys',     value: globalTypeCounts['sys']     ?? 0, color: 'bg-amber-500' },
    { label: 'index',   value: (globalTypeCounts['index'] ?? 0) + (globalTypeCounts['indexes'] ?? 0) + (globalTypeCounts['idx'] ?? 0), color: 'bg-emerald-500' },
    { label: 'raw',     value: globalTypeCounts['raw']     ?? 0, color: 'bg-zinc-400' },
  ]

  const maxRows    = Math.max(...dbMetrics.map(d => d.totalRows), 1)
  const maxTopRows = Math.max(...topTables.map(t => t.rowCount), 1)

  // Index maintenance: index ops / data ops ratio per db
  const indexRatios = dbMetrics
    .map(d => {
      const ops = dbOpStats[d.name]
      if (!ops || ops.dataOps === 0) return null
      const ratio = (ops.indexOps / ops.dataOps) * 100
      return { name: d.name, ratio, indexOps: ops.indexOps, dataOps: ops.dataOps }
    })
    .filter(Boolean) as { name: string; ratio: number; indexOps: number; dataOps: number }[]
  const maxRatio = Math.max(...indexRatios.map(r => r.ratio), 1)

  // Write/delete per db
  const writeDeletes = dbMetrics
    .map(d => {
      const ops = dbOpStats[d.name]
      if (!ops) return null
      return { name: d.name, writes: ops.writes, deletes: ops.deletes }
    })
    .filter(Boolean) as { name: string; writes: number; deletes: number }[]
  const maxWD = Math.max(...writeDeletes.flatMap(d => [d.writes, d.deletes]), 1)

  if (!dbState) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No database selected</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-4">

      {/* ── Summary stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Databases"  value={dbMetrics.length} />
        <StatCard label="Tables"     value={totalTables} sub="at current position" />
        <StatCard label="Total Rows" value={totalRows}   sub="at current position" />
        <StatCard label="Total Ops"  value={allOps.length} sub={hasOps ? 'all time' : 'not loaded yet'} />
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Records per Database */}
        <ChartCard title="Records per Database">
          {dbMetrics.length === 0
            ? <Empty message="No databases" />
            : <div className="space-y-2">
                {dbMetrics.map(d => (
                  <HorizBar
                    key={d.name}
                    label={d.name}
                    sub={`${d.tableCount} table${d.tableCount !== 1 ? 's' : ''}`}
                    value={d.totalRows}
                    max={maxRows}
                    color="bg-primary"
                  />
                ))}
              </div>
          }
        </ChartCard>

        {/* Top Tables */}
        <ChartCard title="Top Tables by Row Count">
          {topTables.length === 0
            ? <Empty message="No rows in any table" />
            : <div className="space-y-2">
                {topTables.map(t => (
                  <HorizBar
                    key={`${t.dbName}/${t.tableName}`}
                    label={t.tableName}
                    sub={t.dbName}
                    value={t.rowCount}
                    max={maxTopRows}
                    color="bg-sky-500"
                  />
                ))}
              </div>
          }
        </ChartCard>

        {/* Operations by type — full width */}
        <div className="md:col-span-2">
          <ChartCard title="Operations by Type">
            {!hasOps
              ? <Empty message="Open the All Records tab to load operation data" />
              : <>
                  <SegmentedBar segments={opTypeSegments} />
                  <Legend items={opTypeSegments} />
                </>
            }
          </ChartCard>
        </div>

        {/* Writes vs Deletes per DB */}
        <ChartCard title="Writes vs Deletes per Database">
          {!hasOps
            ? <Empty message="Open the All Records tab to load operation data" />
            : writeDeletes.length === 0
              ? <Empty message="No operations" />
              : <div className="space-y-3">
                  {writeDeletes.map(d => (
                    <div key={d.name} className="space-y-1">
                      <span className="text-xs font-mono text-muted-foreground">{d.name}</span>
                      <div className="flex gap-1.5">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(d.writes / maxWD) * 100}%` }} />
                            </div>
                            <span className="text-xs font-mono w-14 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">{d.writes.toLocaleString()} W</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-rose-500 rounded-full" style={{ width: `${(d.deletes / maxWD) * 100}%` }} />
                            </div>
                            <span className="text-xs font-mono w-14 text-right text-rose-600 dark:text-rose-400 tabular-nums">{d.deletes.toLocaleString()} D</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
          }
        </ChartCard>

        {/* Index maintenance ratio */}
        <ChartCard title="Index Maintenance Ratio">
          {!hasOps
            ? <Empty message="Open the All Records tab to load operation data" />
            : indexRatios.length === 0
              ? <Empty message="No index operations found" />
              : <>
                  <p className="text-xs text-muted-foreground -mt-1">Index writes as % of data writes</p>
                  <div className="space-y-2">
                    {indexRatios.map(r => (
                      <HorizBar
                        key={r.name}
                        label={r.name}
                        sub={`${r.indexOps.toLocaleString()} idx / ${r.dataOps.toLocaleString()} data`}
                        value={Math.round(r.ratio)}
                        max={Math.ceil(maxRatio)}
                        color="bg-amber-500"
                        suffix="%"
                      />
                    ))}
                  </div>
                </>
          }
        </ChartCard>

      </div>
    </div>
  )
}
