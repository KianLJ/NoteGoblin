import { useEffect, useState } from 'react'
import { getCanvasImage } from './canvasImages'

export interface CanvasImage {
  kind: 'image'
  id: string
  name: string
}

/** An image on the canvas, fitted inside its box (resize the box to resize it). */
export function ImageBox({ image }: { image: CanvasImage }): JSX.Element {
  const [src, setSrc] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    getCanvasImage(image.id)
      .then((url) => live && setSrc(url ?? null))
      .catch(() => live && setSrc(null))
    return () => {
      live = false
    }
  }, [image.id])
  if (src === undefined) return <div />
  if (src === null) return <div className="gb-canvas-image-missing">This image isn’t on this computer any more.</div>
  return (
    <div className="gb-canvas-image">
      <img src={src} alt={image.name} draggable={false} />
    </div>
  )
}

/** The size to open an image's box at: its own proportions, no bigger than 480 across or 420 down (plus the title bar). */
export function imageBoxSize(width: number, height: number): { w: number; h: number } {
  const scale = Math.min(1, 480 / width, 420 / height)
  return { w: Math.max(160, Math.round(width * scale)), h: Math.max(96, Math.round(height * scale) + 32) }
}
