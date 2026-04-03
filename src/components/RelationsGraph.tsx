import { useMemo, useState } from 'react'
import type { DBState, Relation, TableSchema } from '../lib/types'

interface Props {
  dbState:       DBState | null
  onSelectTable: (name: string) => void
}

// ── FK heuristics ─────────────────────────────────────────────────────────────
function detectRelations(schemas: Record<string, TableSchema>): Relation[] {
  const relations: Relation[] = []
  const tableNames = Object.keys(schemas)

  for (const [tableName, schema] of Object.entries(schemas)) {
    for (const col of schema.columns) {
      if (col.primary_key) continue
      const name = col.name.toLowerCase()
      for (const other of tableNames) {
        if (other === tableName) continue
        const lo = other.toLowerCase()
        const matchesFull   = name === `${lo}_id` || name === `${lo}id`
        const matchesPlural =
          (lo.endsWith('s') && (name === `${lo.slice(0, -1)}_id` || name === `${lo.slice(0, -1)}id`)) ||
          (!lo.endsWith('s') && (name === `${lo}s_id` || name === `${lo}sid`))
        if (matchesFull || matchesPlural) {
          relations.push({
            fromTable:  tableName,
            fromColumn: col.name,
            toTable:    other,
            toColumn:   schemas[other]?.primary_key ?? 'id',
          })
          break
        }
      }
    }
  }
  return relations
}

// ── Layout ────────────────────────────────────────────────────────────────────
const CARD_W  = 200
const CARD_H  = 130
const GAP_X   = 100
const GAP_Y   = 80
const COLS    = 3
const PAD     = 24
const ARROW_HEAD = 8   // arrowhead tip length in px

function gridLayout(names: string[]): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {}
  names.forEach((n, i) => {
    out[n] = {
      x: (i % COLS) * (CARD_W + GAP_X) + PAD,
      y: Math.floor(i / COLS) * (CARD_H + GAP_Y) + PAD,
    }
  })
  return out
}

// ── Edge-to-edge arrow routing ────────────────────────────────────────────────
interface Pt { x: number; y: number }

function edgePorts(
  from: Pt,
  to:   Pt
): { src: Pt; dst: Pt; cp1: Pt; cp2: Pt } {
  const fcx = from.x + CARD_W / 2
  const fcy = from.y + CARD_H / 2
  const tcx = to.x   + CARD_W / 2
  const tcy = to.y   + CARD_H / 2

  const dx = tcx - fcx
  const dy = tcy - fcy

  let src: Pt, dst: Pt

  if (Math.abs(dy) >= Math.abs(dx)) {
    // vertical: connect bottom↔top
    if (dy >= 0) {
      src = { x: fcx, y: from.y + CARD_H }
      dst = { x: tcx, y: to.y - ARROW_HEAD }  // stop before card edge for arrowhead
    } else {
      src = { x: fcx, y: from.y }
      dst = { x: tcx, y: to.y + CARD_H + ARROW_HEAD }
    }
    // control points curve outward vertically
    const bend = Math.min(80, Math.abs(dy) * 0.5)
    cp1 = { x: src.x, y: src.y + (dy >= 0 ? bend : -bend) }
    cp2 = { x: dst.x, y: dst.y + (dy >= 0 ? -bend : bend) }
  } else {
    // horizontal: connect right↔left
    if (dx >= 0) {
      src = { x: from.x + CARD_W, y: fcy }
      dst = { x: to.x - ARROW_HEAD,   y: tcy }
    } else {
      src = { x: from.x,   y: fcy }
      dst = { x: to.x + CARD_W + ARROW_HEAD, y: tcy }
    }
    const bend = Math.min(80, Math.abs(dx) * 0.5)
    cp1 = { x: src.x + (dx >= 0 ? bend : -bend), y: src.y }
    cp2 = { x: dst.x + (dx >= 0 ? -bend : bend), y: dst.y }
  }

  return { src, dst, cp1, cp2 }
}

// eslint-disable-next-line prefer-const
let cp1: Pt = { x: 0, y: 0 }
// eslint-disable-next-line prefer-const
let cp2: Pt = { x: 0, y: 0 }

// ── Component ─────────────────────────────────────────────────────────────────
export default function RelationsGraph({ dbState, onSelectTable }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)

  const { schemas, relations, layout, svgW, svgH } = useMemo(() => {
    if (!dbState) return { schemas: {}, relations: [], layout: {}, svgW: 600, svgH: 400 }

    const sch: Record<string, TableSchema> = {}
    for (const [name, t] of Object.entries(dbState.tables)) {
      if (t.schema) sch[name] = t.schema
    }

    const names = Object.keys(sch).sort()
    const lay   = gridLayout(names)
    const rels  = detectRelations(sch)

    const cols = Math.min(names.length, COLS)
    const rows = Math.ceil(names.length / COLS)

    return {
      schemas:   sch,
      relations: rels,
      layout:    lay,
      svgW:      cols * (CARD_W + GAP_X) - GAP_X + PAD * 2,
      svgH:      rows * (CARD_H + GAP_Y) - GAP_Y + PAD * 2,
    }
  }, [dbState])

  if (!dbState || Object.keys(schemas).length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No tables at this point in time</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-4 bg-background">
      {relations.length > 0 && (
        <p className="text-xs text-muted-foreground mb-3">
          {relations.length} relation{relations.length !== 1 ? 's' : ''} detected — heuristic FK matching
        </p>
      )}

      <svg width={svgW} height={svgH} style={{ minWidth: svgW, minHeight: svgH, display: 'block' }}>
        <defs>
          {/* Use userSpaceOnUse so arrowhead size is absolute px, not strokeWidth-relative */}
          <marker
            id="arrow"
            markerUnits="userSpaceOnUse"
            markerWidth="10"
            markerHeight="8"
            refX="10"
            refY="4"
            orient="auto"
          >
            <polygon points="0 0, 10 4, 0 8" fill="var(--primary)" opacity="0.8" />
          </marker>
          <marker
            id="arrow-active"
            markerUnits="userSpaceOnUse"
            markerWidth="10"
            markerHeight="8"
            refX="10"
            refY="4"
            orient="auto"
          >
            <polygon points="0 0, 10 4, 0 8" fill="var(--primary)" />
          </marker>
        </defs>

        {/* ── Arrows drawn FIRST so cards paint on top ── */}
        {relations.map((rel, i) => {
          const fp = layout[rel.fromTable]
          const tp = layout[rel.toTable]
          if (!fp || !tp) return null

          const isActive = hovered === rel.fromTable || hovered === rel.toTable
          const { src, dst, cp1: c1, cp2: c2 } = edgePorts(fp, tp)

          const d = `M ${src.x} ${src.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${dst.x} ${dst.y}`

          // midpoint for label
          const mx = (src.x + dst.x) / 2
          const my = (src.y + dst.y) / 2

          return (
            <g key={i}>
              {/* wider invisible hit area */}
              <path d={d} stroke="transparent" strokeWidth="12" fill="none" />
              <path
                d={d}
                stroke="var(--primary)"
                strokeWidth={isActive ? 2 : 1.5}
                strokeOpacity={isActive ? 0.9 : 0.4}
                fill="none"
                markerEnd={isActive ? 'url(#arrow-active)' : 'url(#arrow)'}
                style={{ transition: 'stroke-opacity 150ms, stroke-width 150ms' }}
              />
              {isActive && (
                <g>
                  <rect
                    x={mx - 44}
                    y={my - 10}
                    width="88"
                    height="18"
                    rx="4"
                    fill="var(--card)"
                    stroke="var(--border)"
                    strokeWidth="1"
                  />
                  <text
                    x={mx}
                    y={my + 4}
                    fontSize="9"
                    fill="var(--muted-foreground)"
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                  >
                    {rel.fromColumn} → {rel.toColumn}
                  </text>
                </g>
              )}
            </g>
          )
        })}

        {/* ── Cards drawn SECOND (on top of arrows) ── */}
        {Object.entries(schemas).map(([name, schema]) => {
          const pos = layout[name]
          if (!pos) return null

          const isHov   = hovered === name
          const cols    = schema.columns.slice(0, 5)
          const hasMore = schema.columns.length > 5
          const rowCount = dbState.tables[name]?.rowCount ?? 0

          return (
            <g
              key={name}
              transform={`translate(${pos.x},${pos.y})`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(name)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelectTable(name)}
            >
              {/* drop shadow */}
              <rect x="2" y="3" width={CARD_W} height={CARD_H} rx="10"
                fill="black" fillOpacity="0.06" />

              {/* card background — solid so it covers arrows */}
              <rect
                width={CARD_W}
                height={CARD_H}
                rx="10"
                fill="var(--card)"
                stroke={isHov ? 'var(--primary)' : 'var(--border)'}
                strokeWidth={isHov ? 1.5 : 1}
                style={{ transition: 'stroke 150ms' }}
              />

              {/* header band */}
              <clipPath id={`clip-header-${name}`}>
                <rect width={CARD_W} height="30" rx="10" />
                <rect y="10" width={CARD_W} height="20" />
              </clipPath>
              <rect
                width={CARD_W}
                height="30"
                clipPath={`url(#clip-header-${name})`}
                fill={isHov ? 'var(--primary)' : 'var(--muted)'}
                style={{ transition: 'fill 150ms' }}
              />

              {/* table name */}
              <text x="10" y="20" fontSize="11" fontWeight="600"
                fontFamily="var(--font-mono)"
                fill={isHov ? 'var(--primary-foreground)' : 'var(--foreground)'}
                style={{ transition: 'fill 150ms' }}
              >
                {name.length > 24 ? name.slice(0, 22) + '…' : name}
              </text>

              {/* row count */}
              <text x={CARD_W - 8} y="20" fontSize="9" textAnchor="end"
                fontFamily="var(--font-mono)"
                fill={isHov ? 'var(--primary-foreground)' : 'var(--muted-foreground)'}
                style={{ transition: 'fill 150ms' }}
              >
                {rowCount.toLocaleString()} rows
              </text>

              {/* divider */}
              <line x1="0" y1="30" x2={CARD_W} y2="30"
                stroke={isHov ? 'var(--primary)' : 'var(--border)'}
                strokeOpacity="0.4"
                style={{ transition: 'stroke 150ms' }}
              />

              {/* columns */}
              {cols.map((col, ci) => (
                <g key={col.name} transform={`translate(0,${36 + ci * 18})`}>
                  {col.primary_key && (
                    <text x="8" y="11" fontSize="9" fill="rgb(245 158 11)">⚿</text>
                  )}
                  <text
                    x={col.primary_key ? 20 : 10}
                    y="11"
                    fontSize="10"
                    fontFamily="var(--font-mono)"
                    fill="var(--foreground)"
                  >
                    {col.name.length > 17 ? col.name.slice(0, 15) + '…' : col.name}
                  </text>
                  <text
                    x={CARD_W - 8}
                    y="11"
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                    textAnchor="end"
                    fill={
                      col.type === 'INTEGER' ? 'rgb(14 165 233)' :
                      col.type === 'TEXT'    ? 'rgb(16 185 129)' :
                      col.type === 'REAL'    ? 'rgb(245 158 11)' :
                                               'var(--muted-foreground)'
                    }
                  >
                    {col.type}
                  </text>
                </g>
              ))}

              {hasMore && (
                <text x="10" y={36 + cols.length * 18 + 4}
                  fontSize="9" fill="var(--muted-foreground)"
                  fontFamily="var(--font-sans)"
                >
                  +{schema.columns.length - 5} more
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
