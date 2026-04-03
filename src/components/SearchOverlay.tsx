import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Table2 } from 'lucide-react'
import type { DBState } from '../lib/types'

interface SearchResult {
  tableName: string
  row:       Record<string, unknown>
  rowIndex:  number
  matchedKeys: string[]
}

interface Props {
  dbState:       DBState | null
  onSelectTable: (name: string) => void
  onClose:       () => void
}

const MAX_RESULTS = 100

function searchDB(db: DBState, query: string): SearchResult[] {
  if (!query.trim()) return []
  const q       = query.toLowerCase()
  const results: SearchResult[] = []

  for (const [tableName, table] of Object.entries(db.tables)) {
    const rowsArr = Object.values(table.rows)
    for (let i = 0; i < rowsArr.length && results.length < MAX_RESULTS; i++) {
      const row     = rowsArr[i] as Record<string, unknown>
      const matched: string[] = []

      for (const [k, v] of Object.entries(row)) {
        const str = v === null || v === undefined ? '' : String(v)
        if (str.toLowerCase().includes(q) || k.toLowerCase().includes(q)) {
          matched.push(k)
        }
      }

      if (matched.length > 0) {
        results.push({ tableName, row, rowIndex: i, matchedKeys: matched })
      }
    }

    if (results.length >= MAX_RESULTS) break
  }

  return results
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/30 text-foreground rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function SearchOverlay({ dbState, onSelectTable, onClose }: Props) {
  const [query,   setQuery]   = useState('')
  const [active,  setActive]  = useState(0)
  const inputRef              = useRef<HTMLInputElement>(null)
  const listRef               = useRef<HTMLDivElement>(null)

  // debounced search
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 120)
    return () => clearTimeout(t)
  }, [query])

  const results = useMemo(
    () => dbState ? searchDB(dbState, debouncedQuery) : [],
    [dbState, debouncedQuery]
  )

  useEffect(() => { setActive(0) }, [results])

  // focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive(a => Math.min(a + 1, results.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(a => Math.max(a - 1, 0))
      }
      if (e.key === 'Enter' && results[active]) {
        onSelectTable(results[active].tableName)
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [results, active, onSelectTable, onClose])

  // scroll active result into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // group results by table
  const grouped = useMemo(() => {
    const map: Record<string, SearchResult[]> = {}
    for (const r of results) {
      if (!map[r.tableName]) map[r.tableName] = []
      map[r.tableName].push(r)
    }
    return map
  }, [results])

  return (
    <div
      className="dialog-overlay"
      style={{ alignItems: 'flex-start', paddingTop: '5vh', padding: '5vh 1rem 1rem' }}
      onClick={onClose}
    >
      <div
        className="dialog-content"
        style={{ maxWidth: 640, padding: 0, overflow: 'hidden', width: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        {/* search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search across all tables…"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button className="btn btn-icon btn-ghost btn-sm" onClick={() => setQuery('')}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono">esc</kbd>
        </div>

        {/* results */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {!debouncedQuery && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Type to search across all rows and columns
            </p>
          )}

          {debouncedQuery && results.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              No results for <span className="font-mono text-foreground">"{debouncedQuery}"</span>
            </p>
          )}

          {Object.entries(grouped).map(([tableName, rows]) => {
            const flatStart = results.findIndex(r => r.tableName === tableName)
            return (
              <div key={tableName}>
                {/* table group header */}
                <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/50 border-b border-border sticky top-0">
                  <Table2 className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-mono font-medium text-foreground">{tableName}</span>
                  <span className="text-xs text-muted-foreground">{rows.length} match{rows.length !== 1 ? 'es' : ''}</span>
                </div>

                {rows.map((result, ri) => {
                  const idx     = flatStart + ri
                  const isActive = idx === active
                  // show the matched key:value pairs
                  const preview = result.matchedKeys.slice(0, 3).map(k => {
                    const v = String(result.row[k] ?? '')
                    const truncated = v.length > 40 ? v.slice(0, 38) + '…' : v
                    return { k, v: truncated }
                  })

                  return (
                    <button
                      key={ri}
                      data-idx={idx}
                      className={`w-full text-left px-4 py-2.5 border-b border-border transition-colors ${
                        isActive ? 'bg-muted' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => { onSelectTable(tableName); onClose() }}
                      onMouseEnter={() => setActive(idx)}
                    >
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {preview.map(({ k, v }) => (
                          <span key={k} className="text-xs font-mono">
                            <span className="text-muted-foreground">{k}: </span>
                            <span className="text-foreground">{highlight(v, debouncedQuery)}</span>
                          </span>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}

          {results.length >= MAX_RESULTS && (
            <p className="text-xs text-muted-foreground text-center py-3 border-t border-border">
              Showing first {MAX_RESULTS} results — refine your query
            </p>
          )}
        </div>

        {/* footer */}
        {results.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-muted/30">
            <span className="text-xs text-muted-foreground">{results.length} result{results.length !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-1 ml-auto text-xs text-muted-foreground">
              <kbd className="border border-border rounded px-1 py-0.5 font-mono">↑↓</kbd>
              <span>navigate</span>
              <kbd className="border border-border rounded px-1 py-0.5 font-mono ml-1">↵</kbd>
              <span>open table</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
