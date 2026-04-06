import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppDBState, AppView, Breakpoint, ExplorerTab, FromWorker, RecordHistoryEntry, ToWorker } from './lib/types'
import FileUpload from './components/FileUpload'
import LandingPage from './components/LandingPage'
import Timeline from './components/Timeline'
import TablesView from './components/TablesView'
import RelationsGraph from './components/RelationsGraph'
import ExportDialog from './components/ExportDialog'
import SearchOverlay from './components/SearchOverlay'
import RecordHistory from './components/RecordHistory'
import { Database, GitBranch, Moon, Network, Search, Sun, Table2 } from 'lucide-react'
import ParserWorker from './workers/parser.worker?worker'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString()
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    )
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return [dark, setDark] as const
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [dark, setDark] = useTheme()

  // worker ref
  const workerRef = useRef<Worker | null>(null)

  // app view state
  const [view, setView]               = useState<AppView>('upload')
  const [parseProgress, setProgress]  = useState(0)
  const [opsProcessed, setOpsProcessed] = useState(0)
  const [fileName, setFileName]       = useState('')
  const [totalOps, setTotalOps]       = useState(0)
  const [milestones, setMilestones]   = useState<number[]>([])
  const [dbNames, setDbNames]         = useState<string[]>([])

  // explorer state
  const [tab, setTab]                 = useState<ExplorerTab>('tables')
  const [position, setPosition]       = useState(0)
  const [dbState, setDbState]         = useState<AppDBState | null>(null)
  const [selectedDB, setSelectedDB]   = useState('')
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [stateLoading, setStateLoading] = useState(false)

  // export dialog
  const [exportOpen, setExportOpen]   = useState(false)
  // search overlay
  const [searchOpen, setSearchOpen]   = useState(false)

  // breakpoints & record history
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPlayingBackward, setIsPlayingBackward] = useState(false)
  const [recordHistory, setRecordHistory] = useState<{ tableName: string; rowId: string; history: RecordHistoryEntry[] } | null>(null)
  
  // Timeline filtering
  const [filteredTable, setFilteredTable] = useState<{ dbName: string; tableName: string; rowId?: string } | null>(null)
  const [relevantPositions, setRelevantPositions] = useState<number[]>([])
  const [filteredStartPosition, setFilteredStartPosition] = useState<number | null>(null)
  
  // Track position when play started to skip current breakpoint
  const playStartPosition = useRef<number | null>(null)

  // Cmd/Ctrl+K → open search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // pending state request (debounce)
  const pendingPos = useRef<number | null>(null)
  const stateReqTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Worker setup ────────────────────────────────────────────────────────────

  const initWorker = useCallback(() => {
    if (workerRef.current) workerRef.current.terminate()
    const w = new ParserWorker()
    workerRef.current = w

    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data

      if (msg.type === 'progress') {
        setProgress(msg.percent)
        setOpsProcessed(msg.opsProcessed)
        return
      }

      if (msg.type === 'parsed') {
        setTotalOps(msg.totalOps)
        setDbNames(msg.dbNames)
        setMilestones(msg.milestones)
        // auto-select first non-session db
        const firstDB =
          msg.dbNames.find(n => !n.startsWith('session') && !n.startsWith('apikey')) ??
          msg.dbNames[0] ??
          ''
        setSelectedDB(firstDB)
        // request state at position 0
        setPosition(0)
        requestState(0)
        setView('explorer')
        return
      }

      if (msg.type === 'state') {
        setDbState(msg.data)
        setStateLoading(false)
        return
      }

      if (msg.type === 'export') {
        const blob = new Blob([msg.data], { type: 'text/plain' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = msg.filename
        a.click()
        URL.revokeObjectURL(url)
        return
      }

      if (msg.type === 'recordHistory') {
        // Handler will be set when requesting history
        return
      }

      if (msg.type === 'relevantPositions') {
        // Handler will be set when requesting relevant positions
        return
      }

      if (msg.type === 'error') {
        console.error('[worker]', msg.message)
        setView('upload')
      }
    }

    return w
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  function requestState(pos: number) {
    if (!workerRef.current) return
    setStateLoading(true)
    const msg: ToWorker = { type: 'getState', position: pos }
    workerRef.current.postMessage(msg)
  }

  // Debounced position change
  const handlePositionChange = useCallback((pos: number) => {
    setPosition(pos)
    pendingPos.current = pos
    if (stateReqTimer.current) clearTimeout(stateReqTimer.current)
    stateReqTimer.current = setTimeout(() => {
      if (pendingPos.current !== null) {
        requestState(pendingPos.current)
        pendingPos.current = null
      }
    }, 60)
  }, [])

  // Step buttons
  const stepBy = useCallback((delta: number) => {
    setPosition(prev => {
      const next = Math.max(0, Math.min(totalOps - 1, prev + delta))
      requestState(next)
      return next
    })
  }, [totalOps])

  const jumpToMilestone = useCallback((dir: 'prev' | 'next') => {
    setPosition(prev => {
      let target = prev
      if (dir === 'next') {
        const m = milestones.find(m => m > prev)
        if (m !== undefined) target = m
      } else {
        const candidates = milestones.filter(m => m < prev)
        if (candidates.length) target = candidates[candidates.length - 1]
      }
      if (target !== prev) requestState(target)
      return target
    })
  }, [milestones])

  // ── Breakpoints ─────────────────────────────────────────────────────────────

  const toggleBreakpoint = useCallback((dbName: string, tableName: string, rowId?: string) => {
    setBreakpoints(prev => {
      const id = `${dbName}::${tableName}${rowId ? `::${rowId}` : ''}`
      const existing = prev.find(bp => bp.id === id)
      if (existing) {
        // Removing breakpoint - clear filter if it matches
        if (filteredTable?.dbName === dbName && 
            filteredTable?.tableName === tableName && 
            filteredTable?.rowId === rowId) {
          setFilteredTable(null)
          setRelevantPositions([])
          setFilteredStartPosition(null)
        }
        return prev.filter(bp => bp.id !== id)
      } else {
        // Adding breakpoint - activate filter if it's a record-level breakpoint
        if (rowId && workerRef.current) {
          setFilteredTable({ dbName, tableName, rowId })
          
          // Request relevant positions
          const msg: ToWorker = {
            type: 'getRelevantPositions',
            dbName,
            tableName,
            rowId,
          }
          workerRef.current.postMessage(msg)
          
          // Set up handler for response
          const currentWorker = workerRef.current
          const originalOnMessage = currentWorker.onmessage
          currentWorker.onmessage = (e: MessageEvent<FromWorker>) => {
            const msgData = e.data
            if (msgData.type === 'relevantPositions') {
              setRelevantPositions(msgData.positions)
              setFilteredStartPosition(msgData.firstPosition)
              // Jump to creation of the record
              if (msgData.firstPosition >= 0) {
                setPosition(msgData.firstPosition)
                requestState(msgData.firstPosition)
              }
              currentWorker.onmessage = originalOnMessage
            } else if (originalOnMessage) {
              originalOnMessage.call(currentWorker, e)
            }
          }
        }
        return [...prev, { id, dbName, tableName, rowId }]
      }
    })
  }, [filteredTable])

  const clearFilter = useCallback(() => {
    setFilteredTable(null)
    setRelevantPositions([])
    setFilteredStartPosition(null)
  }, [])

  const hasBreakpoint = useCallback((dbName: string, tableName: string, rowId?: string) => {
    const id = `${dbName}::${tableName}${rowId ? `::${rowId}` : ''}`
    return breakpoints.some(bp => bp.id === id)
  }, [breakpoints])

  const checkBreakpoint = useCallback((op: WALOperation | null): boolean => {
    if (!op || breakpoints.length === 0) return false
    
    // Check if operation matches any breakpoint
    for (const bp of breakpoints) {
      if (op.dbName !== bp.dbName) continue
      
      // For data operations, check table and optionally rowId
      if (op.keyType === 'data') {
        const [, tableName, rowId] = op.keyParts
        if (tableName === bp.tableName) {
          // If breakpoint has rowId, match it; otherwise match any row in the table
          if (!bp.rowId || bp.rowId === rowId) {
            return true
          }
        }
      }
      // Schema changes on the table
      else if (op.keyType === 'schema') {
        const tableName = op.keyParts[1]
        if (tableName === bp.tableName && !bp.rowId) {
          return true
        }
      }
    }
    return false
  }, [breakpoints])

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => {
      if (!prev) {
        setIsPlayingBackward(false)
        playStartPosition.current = position
      } else {
        playStartPosition.current = null
      }
      return !prev
    })
  }, [position])

  const togglePlayBackward = useCallback(() => {
    setIsPlayingBackward(prev => {
      if (!prev) {
        setIsPlaying(false)
        playStartPosition.current = position
      } else {
        playStartPosition.current = null
      }
      return !prev
    })
  }, [position])

  // Auto-advance when playing
  useEffect(() => {
    if (!isPlaying) return

    const interval = setInterval(() => {
      setPosition(prev => {
        if (prev >= totalOps - 1) {
          setIsPlaying(false)
          return prev
        }

        const next = prev + 1
        requestState(next)
        return next
      })
    }, 13)

    return () => clearInterval(interval)
  }, [isPlaying, totalOps])

  // Auto-rewind when playing backward
  useEffect(() => {
    if (!isPlayingBackward) return

    const interval = setInterval(() => {
      setPosition(prev => {
        if (prev <= 0) {
          setIsPlayingBackward(false)
          return prev
        }

        const next = prev - 1
        requestState(next)
        return next
      })
    }, 13)

    return () => clearInterval(interval)
  }, [isPlayingBackward])

  // Check for breakpoint after state loads
  useEffect(() => {
    if (!isPlaying) return
    if (!dbState?.currentOp) return

    const shouldPause = playStartPosition.current !== null &&
                        position > playStartPosition.current &&
                        checkBreakpoint(dbState.currentOp)

    if (shouldPause) {
      setIsPlaying(false)
      playStartPosition.current = null
    }
  }, [isPlaying, position, dbState, checkBreakpoint])

  // Check for breakpoint when playing backward
  useEffect(() => {
    if (!isPlayingBackward) return
    if (!dbState?.currentOp) return

    const shouldPause = playStartPosition.current !== null &&
                        position < playStartPosition.current &&
                        checkBreakpoint(dbState.currentOp)

    if (shouldPause) {
      setIsPlayingBackward(false)
      playStartPosition.current = null
    }
  }, [isPlayingBackward, position, dbState, checkBreakpoint])

  // ── Record History ──────────────────────────────────────────────────────────

  const viewRecordHistory = useCallback((tableName: string, rowId: string) => {
    if (!workerRef.current || !selectedDB) return
    
    const msg: ToWorker = {
      type: 'getRecordHistory',
      dbName: selectedDB,
      tableName,
      rowId,
      maxPosition: position,
    }
    workerRef.current.postMessage(msg)
    
    // Set up a one-time handler for the response
    const currentWorker = workerRef.current
    const originalOnMessage = currentWorker.onmessage
    currentWorker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msgData = e.data
      if (msgData.type === 'recordHistory') {
        setRecordHistory({
          tableName,
          rowId,
          history: msgData.history,
        })
        // Restore original handler
        currentWorker.onmessage = originalOnMessage
      } else if (originalOnMessage) {
        originalOnMessage.call(currentWorker, e)
      }
    }
  }, [selectedDB, position])

  const closeRecordHistory = useCallback(() => {
    setRecordHistory(null)
  }, [])

  // ── File upload ─────────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    setFileName(file.name)
    setView('loading')
    setProgress(0)
    setOpsProcessed(0)
    setDbState(null)
    setSelectedTable(null)

    const w = initWorker()
    const msg: ToWorker = { type: 'parse', file }
    w.postMessage(msg)
  }, [initWorker])

  // ── Export ───────────────────────────────────────────────────────────────────

  const handleExport = useCallback((
    scope: 'db' | 'table',
    format: 'json' | 'sql' | 'csv',
    tableName?: string
  ) => {
    if (!workerRef.current) return
    if (scope === 'db') {
      const msg: ToWorker = { type: 'exportDB', dbName: selectedDB, position, format: format as 'json' | 'sql' }
      workerRef.current.postMessage(msg)
    } else if (tableName) {
      const msg: ToWorker = { type: 'exportTable', dbName: selectedDB, tableName, position, format }
      workerRef.current.postMessage(msg)
    }
  }, [selectedDB, position])

  // ── Render: Upload ───────────────────────────────────────────────────────────

  if (view === 'upload') {
    return <LandingPage onFile={handleFile} dark={dark} onToggleDark={() => setDark(d => !d)} />
  }

  // ── Render: Loading ──────────────────────────────────────────────────────────

  if (view === 'loading') {
    return (
      <div style={{ minHeight: '100dvh' }} className="bg-background flex flex-col items-center justify-center p-8 space-y-6">
        <div className="text-4xl">🍕</div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Parsing {fileName}</h2>
          <p className="text-sm text-muted-foreground">
            {fmtNum(opsProcessed)} operations indexed…
          </p>
        </div>

        {/* progress bar */}
        <div className="w-full max-w-sm">
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full progress-shine transition-all duration-300"
              style={{ width: `${parseProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">{parseProgress}%</p>
        </div>
      </div>
    )
  }

  // ── Render: Explorer ─────────────────────────────────────────────────────────

  const currentDB  = dbState?.databases[selectedDB]
  const tableCount = currentDB ? Object.keys(currentDB.tables).length : 0

  return (
    <div style={{ height: '100dvh' }} className="flex flex-col overflow-hidden bg-background">
      {/* ── Navbar ── */}
      <header className="h-14 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 border-b border-border bg-card/80 backdrop-blur shrink-0 z-10">
        {/* Logo */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xl">🍕</span>
          <span className="font-semibold text-foreground hidden sm:inline" style={{ fontSize: 15 }}>chronopizza</span>
        </div>

        {/* File name — hidden on mobile */}
        <span className="font-mono text-muted-foreground truncate max-w-36 hidden md:block" style={{ fontSize: 13 }}>{fileName}</span>

        <div className="h-4 w-px bg-border hidden md:block" />

        {/* DB selector */}
        <div className="flex items-center gap-1 min-w-0">
          <Database className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            value={selectedDB}
            onChange={e => { setSelectedDB(e.target.value); setSelectedTable(null) }}
            className="bg-transparent text-foreground font-mono cursor-pointer outline-none min-w-0 truncate"
            style={{ fontSize: 14, maxWidth: '9rem' }}
          >
            {dbNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* View tabs */}
        <nav className="flex items-center gap-0.5">
          {([
            { id: 'tables',    icon: Table2,    label: 'Tables' },
            { id: 'relations', icon: Network,   label: 'Relations' },
            { id: 'raw',       icon: GitBranch, label: 'Raw KV' },
          ] as { id: ExplorerTab; icon: typeof Table2; label: string }[]).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`btn btn-sm btn-ghost flex items-center gap-1.5 ${tab === id ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Stats — desktop only */}
        <span className="text-muted-foreground hidden lg:block" style={{ fontSize: 13 }}>
          {tableCount} {tableCount === 1 ? 'table' : 'tables'}
        </span>

        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="btn btn-sm btn-outline flex items-center gap-1.5"
          title="Search (⌘K)"
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden lg:inline text-muted-foreground border border-border rounded px-1 font-mono" style={{ fontSize: 11 }}>⌘K</kbd>
        </button>

        {/* Export */}
        <button
          onClick={() => setExportOpen(true)}
          className="btn btn-sm btn-outline"
        >
          <span className="hidden sm:inline">Export</span>
          <span className="sm:hidden">↓</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setDark(d => !d)}
          className="btn btn-icon btn-ghost shrink-0"
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {/* ── Timeline bar ── */}
      <Timeline
        position={position}
        totalOps={totalOps}
        currentOp={dbState?.currentOp ?? null}
        milestones={milestones}
        loading={stateLoading}
        isPlaying={isPlaying}
        isPlayingBackward={isPlayingBackward}
        hasBreakpoints={breakpoints.length > 0}
        filteredTable={filteredTable}
        relevantPositions={relevantPositions}
        onPositionChange={handlePositionChange}
        onStep={stepBy}
        onJumpMilestone={jumpToMilestone}
        onTogglePlay={togglePlay}
        onTogglePlayBackward={togglePlayBackward}
        onClearFilter={clearFilter}
      />

      {/* ── Main content ── */}
      <main className="flex-1 overflow-hidden">
        {recordHistory ? (
          <RecordHistory
            tableName={recordHistory.tableName}
            rowId={recordHistory.rowId}
            history={recordHistory.history}
            onBack={closeRecordHistory}
            onJumpToPosition={(pos) => {
              closeRecordHistory()
              setPosition(pos)
              requestState(pos)
            }}
            currentPosition={position}
          />
        ) : tab === 'tables' ? (
          <TablesView
            dbState={currentDB ?? null}
            selectedTable={selectedTable}
            onSelectTable={setSelectedTable}
            onExport={(tableName, format) => handleExport('table', format, tableName)}
            loading={stateLoading}
            position={position}
            totalOps={totalOps}
            dbName={selectedDB}
            onToggleBreakpoint={toggleBreakpoint}
            onHasBreakpoint={hasBreakpoint}
            onViewRecordHistory={viewRecordHistory}
          />
        ) : tab === 'relations' ? (
          <RelationsGraph
            dbState={currentDB ?? null}
            onSelectTable={t => { setTab('tables'); setSelectedTable(t) }}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-muted-foreground">Raw KV view coming soon</p>
          </div>
        )}

        {tab === 'raw' && (
          <RawKVView db={currentDB ?? null} />
        )}
      </main>

      {/* ── Search overlay ── */}
      {searchOpen && (
        <SearchOverlay
          dbState={currentDB ?? null}
          onSelectTable={name => { setTab('tables'); setSelectedTable(name) }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* ── Export dialog ── */}
      {exportOpen && (
        <ExportDialog
          dbName={selectedDB}
          tables={currentDB ? Object.keys(currentDB.tables) : []}
          position={position}
          onExport={handleExport}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  )
}

// ── Raw KV view ───────────────────────────────────────────────────────────────

function RawKVView({ db }: { db: { rawKeys: Record<string, string> } | null }) {
  if (!db) return <EmptyState message="No database selected" />
  const entries = Object.entries(db.rawKeys)
  if (!entries.length) return <EmptyState message="No raw KV entries at this position" />

  return (
    <div className="h-full overflow-auto p-4">
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, val]) => (
              <tr key={key}>
                <td className="font-mono text-xs max-w-64">{key}</td>
                <td className="font-mono text-xs text-muted-foreground">{val.slice(0, 200)}{val.length > 200 ? '…' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
