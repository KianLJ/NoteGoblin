import { useRef, useState, type DragEvent } from 'react'

/**
 * Dropping audio files from your computer onto a panel. `dragging` is true
 * while files are held over it (not notes or boxes being dragged around the
 * app); `onFiles` gets them on drop, with the element they landed on.
 */
export function useAudioDrop(onFiles: (files: File[], target: HTMLElement) => void): {
  dragging: boolean
  handlers: {
    onDragEnter: (e: DragEvent) => void
    onDragOver: (e: DragEvent) => void
    onDragLeave: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
  }
} {
  const [dragging, setDragging] = useState(false)
  // Entering a child fires enter/leave pairs; only the outermost leave counts.
  const depth = useRef(0)
  const hasFiles = (e: DragEvent): boolean => e.dataTransfer.types.includes('Files')
  return {
    dragging,
    handlers: {
      onDragEnter: (e) => {
        if (!hasFiles(e)) return
        depth.current++
        setDragging(true)
      },
      onDragOver: (e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      },
      onDragLeave: (e) => {
        if (!hasFiles(e)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      },
      onDrop: (e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        onFiles([...e.dataTransfer.files], e.target as HTMLElement)
      }
    }
  }
}
