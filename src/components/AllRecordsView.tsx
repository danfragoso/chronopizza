import type { WALOperation } from '../lib/types'

interface Props {
  ops:              WALOperation[]
  position:         number
  onJumpToPosition: (pos: number) => void
}

const HEAD    = 3
const TAIL    = 3
const CONTEXT = 4   // ops before and after current

const KEY_TYPE_STYLES: Record<string, string> = {
  schema:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  data:    'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  sys:     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  index:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  indexes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  idx:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  raw:     'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

function describeOp(op: WALOperation): string {
  const { keyType, keyParts, op: opType, key } = op
  const verb = opType === 'W' ? 'Write' : 'Delete'
  switch (keyType) {
    case 'schema': {
      const table = keyParts[1] ?? '?'
      return opType === 'W' ? `Write schema for "${table}"` : `Drop table "${table}"`
    }
    case 'data': {
      const table = keyParts[1] ?? '?'
      const rowId = keyParts[2] ?? '?'
      return opType === 'W' ? `Write row ${rowId} in "${table}"` : `Delete row ${rowId} from "${table}"`
    }
    case 'sys':
      return `${verb} system key "${keyParts[1] ?? '?'}"`
    case 'index':
    case 'indexes':
    case 'idx':
      return `${verb} index "${keyParts[1] ?? '?'}"`
    default:
      return `${verb} key "${key}"`
  }
}

function OpRow({ op, isCurrent, onClick }: { op: WALOperation; isCurrent: boolean; onClick: () => void }) {
  const typeStyle = KEY_TYPE_STYLES[op.keyType] ?? KEY_TYPE_STYLES.raw
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 h-9 border-b border-border cursor-pointer select-none transition-colors
        ${isCurrent
          ? 'bg-orange-500/10 border-l-2 border-l-orange-500'
          : 'hover:bg-muted/50'
        }`}
    >
      <span className={`font-mono text-xs w-12 shrink-0 text-right ${isCurrent ? 'text-orange-500 font-semibold' : 'text-muted-foreground'}`}>
        {op.index}
      </span>
      <span className={`font-mono text-xs font-bold w-4 shrink-0
        ${op.op === 'W' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
        {op.op}
      </span>
      <span className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${typeStyle}`}>
        {op.keyType}
      </span>
      <span className={`text-sm truncate ${isCurrent ? 'text-orange-500 font-medium' : 'text-foreground'}`}>
        {describeOp(op)}
      </span>
      <span className="text-xs text-muted-foreground shrink-0 ml-auto font-mono hidden md:block">
        {op.dbName}
      </span>
    </div>
  )
}

function Ellipsis({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3 px-4 h-7 border-b border-border select-none">
      <span className="font-mono text-xs w-12 shrink-0 text-right text-muted-foreground/40">···</span>
      <span className="text-xs text-muted-foreground/40 font-mono">{count.toLocaleString()} ops</span>
    </div>
  )
}

export default function AllRecordsView({ ops, position, onJumpToPosition }: Props) {
  if (ops.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No operations loaded</p>
      </div>
    )
  }

  const n = ops.length

  // Build the set of visible indices: head + context window + tail (merged, no dups)
  const headEnd    = Math.min(HEAD, n)
  const ctxStart   = Math.max(0, position - CONTEXT)
  const ctxEnd     = Math.min(n, position + CONTEXT + 1)
  const tailStart  = Math.max(0, n - TAIL)

  // Collect indices in order, deduplicated
  const indexSet = new Set<number>()
  for (let i = 0; i < headEnd; i++)    indexSet.add(i)
  for (let i = ctxStart; i < ctxEnd; i++) indexSet.add(i)
  for (let i = tailStart; i < n; i++)  indexSet.add(i)

  const indices = Array.from(indexSet).sort((a, b) => a - b)

  // Build segments separated by gaps
  type Segment = { type: 'ops'; items: WALOperation[] } | { type: 'gap'; count: number }
  const segments: Segment[] = []
  let i = 0
  while (i < indices.length) {
    const start = i
    // Walk consecutive run
    while (i < indices.length - 1 && indices[i + 1] === indices[i] + 1) i++
    const run = indices.slice(start, i + 1).map(idx => ops[idx])
    segments.push({ type: 'ops', items: run })
    i++
    // Gap?
    if (i < indices.length) {
      const gapCount = indices[i] - indices[i - 1] - 1
      if (gapCount > 0) segments.push({ type: 'gap', count: gapCount })
    }
  }

  return (
    <div className="h-full overflow-auto">
      {segments.map((seg, si) =>
        seg.type === 'gap'
          ? <Ellipsis key={`gap-${si}`} count={seg.count} />
          : seg.items.map(op => (
              <OpRow
                key={op.index}
                op={op}
                isCurrent={op.index === position}
                onClick={() => onJumpToPosition(op.index)}
              />
            ))
      )}
    </div>
  )
}
