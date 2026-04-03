import { Key, Rows3, Columns3 } from 'lucide-react'
import type { TableState } from '../lib/types'

interface Props {
  name:     string
  table:    TableState
  onClick:  () => void
  onExport: (format: 'json' | 'sql' | 'csv') => void
}

const TYPE_COLORS: Record<string, string> = {
  INTEGER: 'text-sky-600 dark:text-sky-400',
  TEXT:    'text-emerald-600 dark:text-emerald-400',
  REAL:    'text-amber-600 dark:text-amber-400',
  BLOB:    'text-purple-600 dark:text-purple-400',
  BOOLEAN: 'text-rose-600 dark:text-rose-400',
  NUMERIC: 'text-sky-600 dark:text-sky-400',
}

function typeColor(t: string) {
  return TYPE_COLORS[t.toUpperCase()] ?? 'text-muted-foreground'
}

export default function TableCard({ name, table, onClick, onExport }: Props) {
  const cols = table.schema?.columns ?? []
  const pk   = table.schema?.primary_key

  return (
    <div
      className="card flex flex-col gap-3 p-4 cursor-pointer hover:border-primary/40 transition-all duration-150 fade-in group"
      onClick={onClick}
    >
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-mono font-semibold text-sm text-foreground truncate">{name}</h3>
        <div
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          onClick={e => e.stopPropagation()}
        >
          {(['json', 'sql', 'csv'] as const).map(fmt => (
            <button
              key={fmt}
              className="btn btn-sm btn-ghost text-xs px-1.5 py-0.5"
              onClick={() => onExport(fmt)}
              title={`Export as ${fmt.toUpperCase()}`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Rows3 className="w-3.5 h-3.5" />
          <span className="tabular-nums font-medium text-foreground">{table.rowCount.toLocaleString()}</span>
          <span>rows</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Columns3 className="w-3.5 h-3.5" />
          <span className="tabular-nums font-medium text-foreground">{cols.length}</span>
          <span>cols</span>
        </div>
        {pk && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Key className="w-3 h-3 text-amber-500" />
            <span className="font-mono">{pk}</span>
          </div>
        )}
      </div>

      {/* column preview */}
      {cols.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cols.slice(0, 6).map(col => (
            <span
              key={col.name}
              className="inline-flex items-center gap-1 font-mono text-xs bg-muted rounded px-1.5 py-0.5"
            >
              {col.primary_key && <Key className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
              <span className="text-foreground">{col.name}</span>
              <span className={`${typeColor(col.type)} text-[10px]`}>{col.type}</span>
            </span>
          ))}
          {cols.length > 6 && (
            <span className="text-xs text-muted-foreground self-center">
              +{cols.length - 6} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}
