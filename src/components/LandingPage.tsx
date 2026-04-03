import { Moon, Sun, Database, FileText, Clock, BarChart3, GitBranch, Search, Download, Palette } from 'lucide-react'
import FileUpload from './FileUpload'

interface Props {
  onFile:        (file: File) => void
  dark:          boolean
  onToggleDark:  () => void
}

// ── WAL timeline diagram ───────────────────────────────────────────────────────
function TimelineDiagram() {
  const ops = [
    { type: 'schema', label: 'CREATE TABLE users' },
    { type: 'data',   label: 'INSERT user #1' },
    { type: 'data',   label: 'INSERT user #2' },
    { type: 'schema', label: 'CREATE TABLE posts' },
    { type: 'data',   label: 'INSERT post #1' },
    { type: 'data',   label: 'INSERT user #3' },
    { type: 'data',   label: 'UPDATE user #1' },
    { type: 'delete', label: 'DELETE post #1' },
    { type: 'data',   label: 'INSERT post #2' },
    { type: 'schema', label: 'ALTER TABLE users' },
    { type: 'data',   label: 'INSERT user #4' },
    { type: 'data',   label: 'INSERT post #3' },
  ]

  const cursorIndex = 6 // "UPDATE user #1"

  const getOpColor = (type: string) => {
    if (type === 'schema') return 'hsl(75 60% 44%)'
    if (type === 'delete') return 'hsl(0 55% 52%)'
    return 'hsl(200 80% 50%)'
  }

  return (
    <div className="flex flex-col gap-8 items-center w-full max-w-4xl mx-auto">
      {/* Timeline */}
      <div className="w-full overflow-x-auto scrollbar-hide pb-4">
        <div className="flex gap-6 px-4 min-w-max">
          {ops.map((op, i) => {
            const isPast = i <= cursorIndex
            const isCurrent = i === cursorIndex
            
            return (
              <div key={i} className="flex flex-col items-center gap-3 min-w-[100px]">
                {/* Label */}
                <div className="h-14 flex items-end">
                  <span 
                    className={`text-xs font-mono text-center leading-tight ${isPast ? 'text-foreground' : 'text-muted-foreground/50'} transition-colors`}
                    style={{ opacity: isPast ? 0.9 : 0.5 }}
                  >
                    {op.label}
                  </span>
                </div>
                
                {/* Dot with connecting line */}
                <div className="flex items-center w-full">
                  {i > 0 && (
                    <div 
                      className="flex-1 h-0.5 transition-colors"
                      style={{ 
                        backgroundColor: isPast ? 'var(--primary)' : 'var(--border)',
                        opacity: isPast ? 0.3 : 1
                      }}
                    />
                  )}
                  <div 
                    className="w-3 h-3 rounded-full border-2 border-background transition-all shadow-sm shrink-0"
                    style={{ 
                      backgroundColor: isPast ? getOpColor(op.type) : 'var(--border)',
                      opacity: isPast ? 1 : 0.4
                    }}
                  />
                  {i < ops.length - 1 && (
                    <div 
                      className="flex-1 h-0.5 transition-colors"
                      style={{ 
                        backgroundColor: isPast && i < cursorIndex ? 'var(--primary)' : 'var(--border)',
                        opacity: isPast && i < cursorIndex ? 0.3 : 1
                      }}
                    />
                  )}
                </div>
                
                {/* Current indicator */}
                {isCurrent && (
                  <div className="mt-2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap shadow-lg">
                    you are here
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-6 flex-wrap justify-center">
        {[
          { color: 'hsl(75 60% 44%)',  label: 'schema change' },
          { color: 'hsl(200 80% 50%)', label: 'row write' },
          { color: 'hsl(0 55% 52%)',   label: 'row delete' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-2.5 text-muted-foreground" style={{ fontSize: 14 }}>
            <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
            <span className="font-medium">{label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── WAL format diagram ─────────────────────────────────────────────────────────
function WALDiagram() {
  const lines = [
    { op: 'W', key: 'shop_db:_schema:users',    val: '{"name":"users","columns":[…],"next_rowid":0}' },
    { op: 'W', key: 'shop_db:_sys:tables',       val: '["users"]' },
    { op: 'W', key: 'shop_db:_data:users:0',     val: '{"id":"abc1","email":"alice@…","role":"admin"}' },
    { op: 'W', key: 'shop_db:_schema:users',     val: '{"name":"users","columns":[…],"next_rowid":2}' },
    { op: 'W', key: 'shop_db:_data:users:1',     val: '{"id":"abc2","email":"bob@…","role":"member"}' },
    { op: 'D', key: 'shop_db:_data:users:0',     val: '' },
  ]

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* header */}
      <div className="bg-muted px-4 py-2.5 flex items-center gap-2 border-b border-border">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-400/60" />
          <span className="w-3 h-3 rounded-full bg-amber-400/60" />
          <span className="w-3 h-3 rounded-full bg-emerald-400/60" />
        </div>
        <span className="font-mono text-muted-foreground" style={{ fontSize: 13 }}>shop.db — pizzakv WAL</span>
      </div>
      <div className="bg-card overflow-x-auto">
        <table className="w-full" style={{ fontSize: 13 }}>
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-mono text-muted-foreground font-normal" style={{ fontSize: 11, width: 40 }}>op</th>
              <th className="text-left px-3 py-2 font-mono text-muted-foreground font-normal" style={{ fontSize: 11 }}>key</th>
              <th className="text-left px-3 py-2 font-mono text-muted-foreground font-normal" style={{ fontSize: 11 }}>value</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                <td className="px-3 py-1.5">
                  <span className={`font-mono font-semibold ${line.op === 'W' ? 'text-sky-600' : 'text-destructive'}`}>
                    {line.op}
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono text-primary whitespace-nowrap">{line.key}</td>
                <td className="px-3 py-1.5 font-mono text-muted-foreground truncate max-w-xs">{line.val || <span className="italic opacity-50">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-2 text-muted-foreground border-t border-border" style={{ fontSize: 12 }}>
          Records separated by <span className="font-mono bg-muted rounded px-1">{'\\r'}</span> — the WAL grows forever until compacted
        </p>
      </div>
    </div>
  )
}

// ── Pipeline diagram ───────────────────────────────────────────────────────────
function PipelineDiagram() {
  const steps = [
    {
      icon: Database,
      emoji: null,
      title: 'pizzasql',
      body: 'Your SQL layer executes queries — INSERT, UPDATE, DELETE — against pizzakv as its storage backend.',
    },
    {
      icon: FileText,
      emoji: null,
      title: 'pizzakv WAL',
      body: 'Every operation is appended as W or D records to the .db file. Nothing is ever overwritten — it\'s a pure append-only log.',
    },
    {
      icon: null,
      emoji: '🍕',
      title: 'chronopizza',
      body: 'Parses the entire WAL in a Web Worker, builds an index, then lets you materialize any moment in history instantly.',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 sm:gap-0">
      {steps.map((step, i) => (
        <div key={i} className="flex sm:flex-col items-start sm:items-center gap-4 sm:gap-3">
          {/* card */}
          <div className="card flex-1 sm:w-full p-5 sm:text-center">
            <div className="mb-3">
              {step.icon ? <step.icon className="w-8 h-8 text-primary mx-auto" /> : <span className="text-3xl">{step.emoji}</span>}
            </div>
            <h3 className="font-mono font-semibold text-foreground mb-2" style={{ fontSize: 16 }}>{step.title}</h3>
            <p className="text-muted-foreground leading-relaxed" style={{ fontSize: 14 }}>{step.body}</p>
          </div>

          {/* arrow between steps */}
          {i < steps.length - 1 && (
            <div className="shrink-0 flex sm:hidden flex-col items-center self-center text-border" style={{ fontSize: 22 }}>↓</div>
          )}
          {i < steps.length - 1 && (
            <div className="hidden sm:flex justify-center mt-4 text-border" style={{ fontSize: 22 }}>→</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Feature grid ───────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Clock,
    title: 'Timeline scrubber',
    body: 'Slide through every single WAL operation. Step one at a time, jump to the next schema change, or scrub hundreds of thousands of ops in seconds.',
  },
  {
    icon: BarChart3,
    title: 'Live table view',
    body: 'Tables materialize exactly as they existed at that moment — row counts, column types, primary keys. Virtually scrolls 60k+ rows without a hiccup.',
  },
  {
    icon: GitBranch,
    title: 'Relations graph',
    body: 'Auto-detects foreign keys from column naming conventions and draws an SVG ERD. Click any table box to drill in.',
  },
  {
    icon: Search,
    title: 'Full-text search',
    body: 'Search across every row and column in the current DB snapshot. ⌘K opens it instantly. Results grouped by table with matched fields highlighted.',
  },
  {
    icon: Download,
    title: 'Snapshot export',
    body: 'Export the database — or a single table — at any point in time as JSON, SQL INSERT statements, or CSV. The worker builds it off the main thread.',
  },
  {
    icon: Palette,
    title: 'Multi-DB + dark mode',
    body: 'A single WAL can contain multiple pizzasql databases. Switch between them freely. System-aware dark mode with manual override.',
  },
]

// ── Main landing page ──────────────────────────────────────────────────────────
export default function LandingPage({ onFile, dark, onToggleDark }: Props) {
  return (
    <div className="bg-background" style={{ minHeight: '100dvh' }}>

      {/* ── Sticky nav ── */}
      <nav className="sticky top-0 z-20 h-14 flex items-center px-4 sm:px-8 border-b border-border bg-card/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-xl">🍕</span>
          <span className="font-semibold text-foreground" style={{ fontSize: 16 }}>chronopizza</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={onToggleDark}
          className="btn btn-icon btn-ghost"
          title={dark ? 'Light mode' : 'Dark mode'}
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </nav>

      {/* ── Hero ── */}
      <section className="px-4 sm:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28 max-w-5xl mx-auto text-center">

        <h1
          className="font-semibold text-foreground tracking-tight leading-tight mb-6"
          style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}
        >
          Travel back in time<br />
          through your <span className="text-primary">database history</span>
        </h1>

        <p
          className="text-muted-foreground leading-relaxed mb-10 max-w-2xl mx-auto"
          style={{ fontSize: 'clamp(1rem, 2.5vw, 1.125rem)' }}
        >
          chronopizza reads your pizzakv/pizzasql WAL file and lets you step through every write
          and delete — watching tables appear, rows mutate, and data evolve in real time.
          Scrub forward and backward across the <b>entire</b> history of your database.
        </p>

        {/* Upload area */}
        <div className="max-w-xl mx-auto">
          <FileUpload onFile={onFile} />
        </div>

        <p className="text-muted-foreground mt-5" style={{ fontSize: 13 }}>
          Files are processed entirely in your browser — nothing is ever uploaded.
        </p>

        {/* Timeline diagram teaser */}
        <div className="mt-14 max-w-2xl mx-auto card p-6">
          <p className="font-medium text-foreground mb-6" style={{ fontSize: 14 }}>Scrub through every operation</p>
          <TimelineDiagram />
        </div>
      </section>

      {/* ── WAL format ── */}
      <section className="px-4 sm:px-8 py-20 border-t border-border">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="font-mono text-primary mb-3" style={{ fontSize: 13 }}>the format</p>
            <h2 className="font-semibold text-foreground mb-4" style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)' }}>
              A WAL is a perfect<br />time-travel machine
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4" style={{ fontSize: 15 }}>
              pizzakv never overwrites. Every write (<code className="font-mono bg-muted rounded px-1.5 py-0.5">W</code>)
              and every delete (<code className="font-mono bg-muted rounded px-1.5 py-0.5">D</code>) is appended to
              the log.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4" style={{ fontSize: 15 }}>
              That means the file is literally the complete history of your database.
              chronopizza parses the entire thing in a background thread, builds a
              per-key index, then materializes any point in time using binary search —
              no replay from scratch required.
            </p>
            <div className="flex flex-wrap gap-3">
              {['913K ops in ~1s', '1GB+ files', 'Multi-DB WAL', 'Fully Local'].map(tag => (
                <span key={tag} className="badge badge-muted font-mono" style={{ fontSize: 13 }}>{tag}</span>
              ))}
            </div>
          </div>
          <div>
            <WALDiagram />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="px-4 sm:px-8 py-20 border-t border-border bg-card/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="font-mono text-primary mb-3" style={{ fontSize: 13 }}>features</p>
            <h2 className="font-semibold text-foreground" style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)' }}>
              Everything you need to<br className="hidden sm:block" /> understand your data's past
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div key={f.title} className="card p-5 hover:border-primary/40 transition-colors duration-150">
                <f.icon className="w-7 h-7 text-primary mb-3" />
                <h3 className="font-semibold text-foreground mb-2" style={{ fontSize: 16 }}>{f.title}</h3>
                <p className="text-muted-foreground leading-relaxed" style={{ fontSize: 14 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Key numbers ── */}
      <section className="py-20 border-t border-border overflow-hidden">
        <div className="max-w-5xl mx-auto">
          {/* Mobile carousel */}
          <div className="sm:hidden overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex gap-4 px-4 min-w-max">
              {[
                { value: '913K',  label: 'operations parsed',    sub: 'in ~1 second' },
                { value: '1GB+', label: 'WAL file size',         sub: 'handled in browser' },
                { value: '60K+',  label: 'rows per table',        sub: 'virtually scrolled' },
                { value: '0',     label: 'bytes uploaded',        sub: 'fully client-side' },
              ].map(stat => (
                <div key={stat.value} className="card shrink-0 w-[280px] p-6 text-center space-y-1">
                  <p className="font-semibold text-primary" style={{ fontSize: '2.25rem' }}>{stat.value}</p>
                  <p className="font-medium text-foreground" style={{ fontSize: 14 }}>{stat.label}</p>
                  <p className="text-muted-foreground" style={{ fontSize: 13 }}>{stat.sub}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Desktop grid */}
          <div className="hidden sm:block px-4 sm:px-8">
            <div className="grid grid-cols-4 gap-6 text-center">
              {[
                { value: '913K',  label: 'operations parsed',    sub: 'in ~1 second' },
                { value: '1GB+', label: 'WAL file size',         sub: 'handled in browser' },
                { value: '60K+',  label: 'rows per table',        sub: 'virtually scrolled' },
                { value: '0',     label: 'bytes uploaded',        sub: 'fully client-side' },
              ].map(stat => (
                <div key={stat.value} className="space-y-1">
                  <p className="font-semibold text-primary" style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)' }}>{stat.value}</p>
                  <p className="font-medium text-foreground" style={{ fontSize: 14 }}>{stat.label}</p>
                  <p className="text-muted-foreground" style={{ fontSize: 13 }}>{stat.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-4 sm:px-8 py-20 border-t border-border bg-card/40">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="font-semibold text-foreground mb-3" style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)' }}>
            Ready to explore?
          </h2>
          <p className="text-muted-foreground mb-10" style={{ fontSize: 15 }}>
            Drop any pizzakv <code className="font-mono bg-muted rounded px-1.5 py-0.5">.db</code> file below,
            or use the built-in example to see the tool in action.
          </p>
          <FileUpload onFile={onFile} />
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-4 sm:px-8 py-8 border-t border-border">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🍕</span>
            <span className="font-semibold text-foreground" style={{ fontSize: 15 }}>chronopizza</span>
          </div>
          <p className="text-muted-foreground" style={{ fontSize: 13 }}>
            Built for the pizzakv + pizzasql ecosystem. Runs entirely in your browser.
          </p>
        </div>
      </footer>

    </div>
  )
}
