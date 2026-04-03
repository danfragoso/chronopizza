import { useCallback, useRef, useState } from 'react'
import { Sparkles, Upload } from 'lucide-react'
import { generateExampleDB } from '../lib/exampleDB'

interface Props {
  onFile: (file: File) => void
}

export default function FileUpload({ onFile }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragging(false), [])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
  }, [onFile])

  const handleExample = useCallback(() => {
    const bytes  = generateExampleDB()
    // Copy into a plain ArrayBuffer to satisfy TypeScript's BlobPart constraint
    const ab     = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const file   = new File([ab], 'demo.db', { type: 'application/octet-stream' })
    onFile(file)
  }, [onFile])

  return (
    <div className="space-y-3">
      <div
        className={`drop-zone flex flex-col items-center justify-center gap-4 p-12 cursor-pointer select-none ${dragging ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleChange}
        />

        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
          <Upload className="w-6 h-6 text-muted-foreground" />
        </div>

        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-foreground">
            Drop your <span className="font-mono">.db</span> WAL file here
          </p>
          <p className="text-xs text-muted-foreground">
            or click to browse — large files supported
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        className="btn btn-outline w-full flex items-center justify-center gap-2"
        onClick={handleExample}
      >
        <Sparkles className="w-4 h-4 text-primary" />
        Use example database
      </button>
    </div>
  )
}
