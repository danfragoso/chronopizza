import { ArrowLeft, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { RecordHistoryEntry } from '../lib/types'

interface Props {
  tableName: string
  rowId: string
  history: RecordHistoryEntry[]
  onBack: () => void
  onJumpToPosition: (position: number) => void
  currentPosition: number
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

const MAX_VALUE_LENGTH = 100

export default function RecordHistory({ tableName, rowId, history, onBack, onJumpToPosition, currentPosition }: Props) {
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())
  return (
    <div className="h-full flex flex-col overflow-hidden fade-in">
      {/* header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <button className="btn btn-icon btn-ghost btn-sm" onClick={onBack} title="Back to table">
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <h2 className="font-mono font-semibold text-foreground truncate" style={{ fontSize: 15 }}>
            Record History: {tableName}
          </h2>
          <span className="badge badge-muted shrink-0" style={{ fontSize: 12 }}>ID: {rowId}</span>
        </div>

        <span className="text-sm text-muted-foreground shrink-0">
          {history.length} {history.length === 1 ? 'change' : 'changes'}
        </span>
      </div>

      {/* history timeline */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {history.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">No history found for this record</p>
          </div>
        ) : (
          history.map((entry, idx) => {
            const isDelete = entry.operation.op === 'D'
            const isCreate = entry.before === null && entry.after !== null
            const isCurrent = entry.position === currentPosition
            const isExpanded = expandedCards.has(idx)

            // Check if any values are long enough to need expansion
            const hasLongValues = (() => {
              if (isDelete) return false
              const values = entry.after ? Object.values(entry.after) : []
              return values.some(v => formatValue(v).length > MAX_VALUE_LENGTH)
            })()

            const toggleExpand = () => {
              setExpandedCards(prev => {
                const next = new Set(prev)
                if (next.has(idx)) {
                  next.delete(idx)
                } else {
                  next.add(idx)
                }
                return next
              })
            }

            return (
              <div
                key={idx}
                className={`card p-4 transition-all ${isCurrent ? 'ring-2 ring-primary' : ''}`}
              >
                {/* header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`badge ${isDelete ? 'badge-delete' : 'badge-write'} shrink-0`}>
                    {isDelete ? 'DELETE' : isCreate ? 'INSERT' : 'UPDATE'}
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">
                    Position {entry.position.toLocaleString()}
                  </span>
                  {hasLongValues && (
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={toggleExpand}
                      title={isExpanded ? 'Show less' : 'Show more'}
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  )}
                  {!isCurrent && (
                    <button
                      className="btn btn-xs btn-ghost ml-auto"
                      onClick={() => onJumpToPosition(entry.position)}
                    >
                      Jump to
                    </button>
                  )}
                  {isCurrent && (
                    <span className="ml-auto text-xs font-semibold text-primary">
                      ← You are here
                    </span>
                  )}
                </div>

                {/* changes */}
                <div className="space-y-2">
                  {isCreate ? (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Record created with:</span>
                      <div className="mt-2 space-y-1">
                        {entry.after && Object.entries(entry.after).map(([key, value]) => {
                          const formatted = formatValue(value)
                          const isTruncated = !isExpanded && formatted.length > MAX_VALUE_LENGTH
                          const displayValue = isTruncated ? formatted.slice(0, MAX_VALUE_LENGTH) + '...' : formatted

                          return (
                            <div key={key} className="flex gap-2 font-mono text-xs">
                              <span className="text-muted-foreground min-w-[100px] shrink-0">{key}:</span>
                              <span className="text-emerald-600 font-semibold break-words">{displayValue}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : isDelete ? (
                    <div className="text-sm">
                      <span className="text-destructive">Record deleted</span>
                    </div>
                  ) : (
                    <div className="text-sm">
                      <span className="text-muted-foreground mb-2 block">Changes:</span>
                      <div className="space-y-2">
                        {entry.before && entry.after && Object.keys(entry.after).map(key => {
                          const oldVal = entry.before?.[key]
                          const newVal = entry.after?.[key]
                          const oldFormatted = formatValue(oldVal)
                          const newFormatted = formatValue(newVal)
                          
                          if (oldFormatted === newFormatted) return null

                          const oldTruncated = !isExpanded && oldFormatted.length > MAX_VALUE_LENGTH
                          const newTruncated = !isExpanded && newFormatted.length > MAX_VALUE_LENGTH
                          const oldDisplay = oldTruncated ? oldFormatted.slice(0, MAX_VALUE_LENGTH) + '...' : oldFormatted
                          const newDisplay = newTruncated ? newFormatted.slice(0, MAX_VALUE_LENGTH) + '...' : newFormatted

                          return (
                            <div key={key} className="flex flex-col gap-1 font-mono text-xs">
                              <span className="text-muted-foreground font-semibold">{key}:</span>
                              <div className="flex flex-col gap-1 pl-4">
                                <span className="text-rose-600 line-through break-words">{oldDisplay}</span>
                                <div className="flex items-start gap-2">
                                  <span className="text-muted-foreground shrink-0">→</span>
                                  <span className="text-emerald-600 font-semibold break-words">{newDisplay}</span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
