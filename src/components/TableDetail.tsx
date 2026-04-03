import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, Download, Key } from 'lucide-react'
import type { TableState } from '../lib/types'

interface Props {
  name:     string
  table:    TableState
  onBack:   () => void
  onExport: (format: 'json' | 'sql' | 'csv') => void
}

const TYPE_COLORS: Record<string, string> = {
  INTEGER: 'text-sky-600',
  TEXT:    'text-emerald-600',
  REAL:    'text-amber-600',
  BLOB:    'text-purple-600',
  BOOLEAN: 'text-rose-600',
  NUMERIC: 'text-sky-600',
}
function typeColor(t: string) { return TYPE_COLORS[t.toUpperCase()] ?? 'text-muted-foreground' }

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

// px height of each data row — must match the CSS padding in data-table td
const ROW_H    = 33
// extra rows to render above/below the visible window
const OVERSCAN = 8

export default function TableDetail({ name, table, onBack, onExport }: Props) {
  const schema     = table.schema
  const cols       = schema?.columns ?? []

  // Memoize row array — Object.values on 60k entries is expensive on every render
  const rows = useMemo(() => Object.values(table.rows), [table.rows])

  // Virtual scroll state
  const scrollRef  = useRef<HTMLDivElement>(null)
  const rafRef     = useRef<number | null>(null)
  const [range, setRange] = useState({ start: 0, end: 60 })

  const recompute = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const viewH  = el.clientHeight
    const scrollY = el.scrollTop
    const start  = Math.max(0, Math.floor(scrollY / ROW_H) - OVERSCAN)
    const end    = Math.min(rows.length, Math.ceil((scrollY + viewH) / ROW_H) + OVERSCAN)
    setRange({ start, end })
  }, [rows.length])

  // Recompute on mount and whenever rows change
  useEffect(() => { recompute() }, [recompute])

  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      recompute()
    })
  }, [recompute])

  // Recalculate when container size changes (e.g. window resize)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [recompute])

  const { start, end }   = range
  const topPad           = start * ROW_H
  const bottomPad        = Math.max(0, (rows.length - end) * ROW_H)
  const visibleRows      = rows.slice(start, end)

  // Copy row to clipboard
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const copyRow = useCallback((row: Record<string, unknown>, idx: number) => {
    navigator.clipboard.writeText(JSON.stringify(row, null, 2)).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(prev => prev === idx ? null : prev), 1500)
    })
  }, [])

  // Derive col keys for rows without a schema
  const fallbackKeys = useMemo(
    () => rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [],
    [rows]
  )
  const colKeys = cols.length > 0 ? cols.map(c => c.name) : fallbackKeys

  return (
    <div className="h-full flex flex-col overflow-hidden fade-in">
      {/* header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <button className="btn btn-icon btn-ghost btn-sm" onClick={onBack} title="Back to tables">
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h2 className="font-mono font-semibold text-foreground truncate" style={{ fontSize: 15 }}>{name}</h2>
          <span className="badge badge-muted shrink-0" style={{ fontSize: 12 }}>{rows.length.toLocaleString()} rows</span>
          {schema?.primary_key && (
            <span className="hidden sm:flex items-center gap-1 text-muted-foreground shrink-0" style={{ fontSize: 13 }}>
              <Key className="w-3 h-3 text-amber-500" />
              <span className="font-mono">{schema.primary_key}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(['json', 'sql', 'csv'] as const).map(fmt => (
            <button
              key={fmt}
              className="btn btn-sm btn-outline flex items-center gap-1"
              onClick={() => onExport(fmt)}
              title={`Export as ${fmt.toUpperCase()}`}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{fmt.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </div>

      {/* schema strip */}
      {cols.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50 overflow-x-auto">
          {cols.map(col => (
            <div
              key={col.name}
              className="flex items-center gap-1 text-xs bg-card border border-border rounded px-2 py-1 whitespace-nowrap"
            >
              {col.primary_key && <Key className="w-3 h-3 text-amber-500" />}
              <span className="font-mono font-medium text-foreground">{col.name}</span>
              <span className={`font-mono ${typeColor(col.type)}`}>{col.type}</span>
              {!col.nullable && <span className="text-destructive text-[10px]">NOT NULL</span>}
            </div>
          ))}
        </div>
      )}

      {/* data table */}
      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No rows at this point in time</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto"
          onScroll={handleScroll}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32, padding: '0.5rem 0.25rem' }} />
                {cols.length > 0
                  ? cols.map(col => (
                      <th key={col.name}>
                        <span className="flex items-center gap-1">
                          {col.primary_key && <Key className="w-3 h-3 text-amber-500" />}
                          <span>{col.name}</span>
                          <span className={`${typeColor(col.type)} font-mono normal-case tracking-normal`}>
                            {col.type}
                          </span>
                        </span>
                      </th>
                    ))
                  : fallbackKeys.map(k => <th key={k}>{k}</th>)
                }
              </tr>
            </thead>
            <tbody>
              {/* top spacer */}
              {topPad > 0 && (
                <tr aria-hidden><td colSpan={colKeys.length} style={{ height: topPad, padding: 0, border: 'none' }} /></tr>
              )}

              {visibleRows.map((row, i) => {
                const r = row as Record<string, unknown>
                return (
                  <tr key={start + i} className="group/row">
                    {/* copy button cell */}
                    <td style={{ padding: '0 0.25rem', width: 32, borderBottom: '1px solid var(--border)' }}>
                      <button
                        className="btn btn-icon btn-ghost btn-sm opacity-0 group-hover/row:opacity-100 transition-opacity"
                        style={{ padding: '2px', width: 22, height: 22 }}
                        onClick={() => copyRow(r, start + i)}
                        title="Copy row as JSON"
                      >
                        {copiedIdx === start + i
                          ? <Check className="w-3 h-3 text-primary" />
                          : <Copy className="w-3 h-3" />
                        }
                      </button>
                    </td>
                    {colKeys.map((key, j) => {
                      const cell = r[key]
                      return (
                        <td
                          key={j}
                          className={cell === null || cell === undefined ? 'text-muted-foreground italic' : ''}
                          title={formatCell(cell)}
                        >
                          {formatCell(cell)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {/* bottom spacer */}
              {bottomPad > 0 && (
                <tr aria-hidden><td colSpan={colKeys.length} style={{ height: bottomPad, padding: 0, border: 'none' }} /></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
