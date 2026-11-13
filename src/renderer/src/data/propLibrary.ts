const MAX_SIDE = 512

/** Reads a picture file as a prop: at most 512px on its longest side, as WebP so transparency survives. */
export function readPropFile(file: File): Promise<{ name: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`${file.name} isn’t a picture this app can read.`))
    }
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas unavailable.'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve({ name: file.name.replace(/\.[^.]+$/, ''), dataUrl: canvas.toDataURL('image/webp', 0.9) })
    }
    img.src = url
  })
}

/** A picture's size in pixels, from its data URL. */
export function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 })
    img.onerror = () => reject(new Error('Couldn’t read that picture.'))
    img.src = src
  })
}
