import { useState } from 'react'
import { Download, X } from 'lucide-react'

interface Props {
  dbName:   string
  tables:   string[]
  position: number
  onExport: (scope: 'db' | 'table', format: 'json' | 'sql' | 'csv', tableName?: string) => void
  onClose:  () => void
}

type Scope  = 'db' | 'table'
type Format = 'json' | 'sql' | 'csv'

export default function ExportDialog({ dbName, tables, position, onExport, onClose }: Props) {
  const [scope,  setScope]  = useState<Scope>('db')
  const [format, setFormat] = useState<Format>('json')
  const [table,  setTable]  = useState(tables[0] ?? '')

  const dbFormats:    Format[] = ['json']
  const tableFormats: Format[] = ['json', 'sql', 'csv']
  const formats = scope === 'db' ? dbFormats : tableFormats

  function handleExport() {
    onExport(scope, format, scope === 'table' ? table : undefined)
    onClose()
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">Export</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Snapshot at operation {position.toLocaleString()}
            </p>
          </div>
          <button className="btn btn-icon btn-ghost btn-sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* scope */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
              Scope
            </label>
            <div className="flex gap-2">
              {(['db', 'table'] as Scope[]).map(s => (
                <button
                  key={s}
                  onClick={() => {
                    setScope(s)
                    if (s === 'db') setFormat('json')
                  }}
                  className={`btn btn-sm flex-1 ${scope === s ? 'btn-primary' : 'btn-outline'}`}
                >
                  {s === 'db' ? `Database (${dbName})` : 'Single table'}
                </button>
              ))}
            </div>
          </div>

          {/* table selector */}
          {scope === 'table' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                Table
              </label>
              <select
                value={table}
                onChange={e => setTable(e.target.value)}
                className="w-full text-sm font-mono bg-muted border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-[var(--ring)]"
              >
                {tables.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {/* format */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
              Format
            </label>
            <div className="flex gap-2">
              {formats.map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`btn btn-sm flex-1 font-mono ${format === f ? 'btn-primary' : 'btn-outline'}`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* info */}
          <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p>Database: <span className="font-mono text-foreground">{dbName}</span></p>
            {scope === 'table' && <p>Table: <span className="font-mono text-foreground">{table}</span></p>}
            <p>Format: <span className="font-mono text-foreground">{format.toUpperCase()}</span></p>
          </div>

          {/* actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleExport}>
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
