import { useCallback } from 'react'
import {
  ChevronFirst, ChevronLast, ChevronLeft, ChevronRight,
  SkipBack, SkipForward, Loader2
} from 'lucide-react'
import type { WALOperation } from '../lib/types'

interface Props {
  position:         number
  totalOps:         number
  currentOp:        WALOperation | null
  milestones:       number[]
  loading:          boolean
  onPositionChange: (pos: number) => void
  onStep:           (delta: number) => void
  onJumpMilestone:  (dir: 'prev' | 'next') => void
}

function fmtNum(n: number) { return n.toLocaleString() }

function opBadgeClass(op: WALOperation | null) {
  if (!op) return 'badge-muted'
  return op.op === 'W' ? 'badge-write' : 'badge-delete'
}

function keyTypeLabel(op: WALOperation | null): string {
  if (!op) return ''
  const t = op.keyType
  if (t === 'data')    return 'row'
  if (t === 'schema')  return 'schema'
  if (t === 'sys')     return 'sys'
  if (t === 'index')   return 'index'
  if (t === 'indexes') return 'indexes'
  return t
}

export default function Timeline({
  position, totalOps, currentOp, loading,
  onPositionChange, onStep, onJumpMilestone,
}: Props) {
  const pct = totalOps > 1 ? (position / (totalOps - 1)) * 100 : 0

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onPositionChange(parseInt(e.target.value, 10))
  }, [onPositionChange])

  // Shorten key to fit available space depending on viewport
  const shortKey = currentOp
    ? currentOp.key.length > 36
      ? '…' + currentOp.key.slice(-36)
      : currentOp.key
    : '—'

  return (
    <div className="shrink-0 border-b border-border bg-card px-3 sm:px-4 py-2 space-y-1">
      {/* slider row */}
      <div className="flex items-center gap-1 sm:gap-2">

        {/* jump start — hidden on mobile */}
        <button
          className="btn btn-icon btn-ghost btn-sm hidden sm:flex"
          onClick={() => onStep(-position)}
          disabled={position === 0}
          title="Jump to start"
        >
          <ChevronFirst className="w-4 h-4" />
        </button>

        {/* prev milestone — hidden on mobile */}
        <button
          className="btn btn-icon btn-ghost btn-sm hidden sm:flex"
          onClick={() => onJumpMilestone('prev')}
          disabled={position === 0}
          title="Previous schema change"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        {/* prev step — always visible */}
        <button
          className="btn btn-icon btn-ghost btn-sm"
          onClick={() => onStep(-1)}
          disabled={position === 0}
          title="Step back"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* slider */}
        <div className="flex-1 relative flex items-center">
          <div className="absolute inset-0 flex items-center pointer-events-none">
            <div className="w-full h-1.5 bg-border/40 rounded-full" />
          </div>
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-primary pointer-events-none"
            style={{ width: `${pct}%` }}
          />
          <input
            type="range"
            min={0}
            max={Math.max(0, totalOps - 1)}
            value={position}
            onChange={handleSlider}
            className="timeline-slider relative w-full"
          />
        </div>

        {/* next step — always visible */}
        <button
          className="btn btn-icon btn-ghost btn-sm"
          onClick={() => onStep(1)}
          disabled={position >= totalOps - 1}
          title="Step forward"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* next milestone — hidden on mobile */}
        <button
          className="btn btn-icon btn-ghost btn-sm hidden sm:flex"
          onClick={() => onJumpMilestone('next')}
          disabled={position >= totalOps - 1}
          title="Next schema change"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        {/* jump end — hidden on mobile */}
        <button
          className="btn btn-icon btn-ghost btn-sm hidden sm:flex"
          onClick={() => onStep(totalOps - 1 - position)}
          disabled={position >= totalOps - 1}
          title="Jump to end"
        >
          <ChevronLast className="w-4 h-4" />
        </button>
      </div>

      {/* info row */}
      <div className="flex items-center gap-2 text-muted-foreground overflow-hidden" style={{ fontSize: 13 }}>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />}

        <span className="font-mono tabular-nums shrink-0">
          {fmtNum(position + 1)}&thinsp;/&thinsp;{fmtNum(totalOps)}
        </span>

        {currentOp && (
          <>
            <div className="h-3 w-px bg-border shrink-0" />
            <span className={`badge shrink-0 ${opBadgeClass(currentOp)}`} style={{ fontSize: 11 }}>
              {currentOp.op}
            </span>
            <span className="badge badge-muted shrink-0" style={{ fontSize: 11 }}>{keyTypeLabel(currentOp)}</span>
            {/* key — hidden below sm */}
            <span className="font-mono truncate hidden sm:block">{shortKey}</span>
          </>
        )}
      </div>
    </div>
  )
}
