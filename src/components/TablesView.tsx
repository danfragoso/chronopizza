import { useMemo } from 'react'
import { Database, Hash, Key, Rows3, Table2, Zap } from 'lucide-react'
import type { DBState } from '../lib/types'
import TableCard from './TableCard'
import TableDetail from './TableDetail'

interface Props {
  dbState:       DBState | null
  selectedTable: string | null
  onSelectTable: (name: string | null) => void
  onExport:      (tableName: string, format: 'json' | 'sql' | 'csv') => void
  loading:       boolean
  position:      number
  totalOps:      number
}

interface MetricCardProps {
  icon:    React.ReactNode
  label:   string
  value:   string
  sub?:    string
  color:   string
}

function MetricCard({ icon, label, value, sub, color }: MetricCardProps) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3 bg-muted/50 w-[240px] shrink-0">
      <div className={`shrink-0 rounded-lg p-2 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-none mb-1">{label}</p>
        <p className="text-base font-semibold text-foreground leading-none">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
      </div>
    </div>
  )
}

export default function TablesView({ dbState, selectedTable, onSelectTable, onExport, loading, position, totalOps }: Props) {
  const metrics = useMemo(() => {
    if (!dbState) return null
    const tables    = Object.entries(dbState.tables)
    const totalRows = tables.reduce((s, [, t]) => s + t.rowCount, 0)
    const biggest   = tables.reduce<[string, number] | null>((best, [name, t]) =>
      !best || t.rowCount > best[1] ? [name, t.rowCount] : best, null)
    const pct       = totalOps > 0 ? Math.round((position / (totalOps - 1)) * 100) : 0
    return {
      tableCount: tables.length,
      totalRows,
      indexCount: dbState.indexes.length,
      biggest,
      pct,
    }
  }, [dbState, position, totalOps])

  if (!dbState) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No database loaded</p>
      </div>
    )
  }

  const tables = Object.entries(dbState.tables)

  if (tables.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-foreground">No tables at this point</p>
          <p className="text-xs text-muted-foreground">Move the timeline forward to see tables appear</p>
        </div>
      </div>
    )
  }

  // detail view — no metrics strip here
  if (selectedTable && dbState.tables[selectedTable]) {
    return (
      <TableDetail
        name={selectedTable}
        table={dbState.tables[selectedTable]}
        onBack={() => onSelectTable(null)}
        onExport={fmt => onExport(selectedTable, fmt)}
      />
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── metrics bar ── */}
      {metrics && (
        <div className="shrink-0 border-b border-border overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-3 p-4 min-w-max lg:min-w-0 lg:grid lg:grid-cols-5">
            <MetricCard
              icon={<Table2 className="w-4 h-4 text-purple-600" />}
              label="Tables"
              value={metrics.tableCount.toLocaleString()}
              color="bg-purple-500/10"
            />
            <MetricCard
              icon={<Rows3 className="w-4 h-4 text-sky-600" />}
              label="Total rows"
              value={metrics.totalRows.toLocaleString()}
              sub={metrics.biggest ? `largest: ${metrics.biggest[0]}` : undefined}
              color="bg-sky-500/10"
            />
            <MetricCard
              icon={<Key className="w-4 h-4 text-amber-600" />}
              label="Indexes"
              value={metrics.indexCount.toLocaleString()}
              color="bg-amber-500/10"
            />
            <MetricCard
              icon={<Zap className="w-4 h-4 text-emerald-600" />}
              label="Timeline"
              value={`${metrics.pct}%`}
              sub={`op ${position.toLocaleString()} of ${totalOps.toLocaleString()}`}
              color="bg-emerald-500/10"
            />
            <MetricCard
              icon={<Hash className="w-4 h-4 text-rose-600" />}
              label="Biggest table"
              value={metrics.biggest ? metrics.biggest[1].toLocaleString() : '—'}
              sub={metrics.biggest?.[0]}
              color="bg-rose-500/10"
            />
          </div>
        </div>
      )}

      {/* ── table grid ── */}
      <div className="flex-1 overflow-auto p-4">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {tables.map(([name, table]) => (
            <TableCard
              key={name}
              name={name}
              table={table}
              onClick={() => onSelectTable(name)}
              onExport={fmt => onExport(name, fmt)}
            />
          ))}
        </div>
      </div>

      {loading && (
        <div className="fixed bottom-4 right-4 bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs text-muted-foreground">
          Updating…
        </div>
      )}
    </div>
  )
}
