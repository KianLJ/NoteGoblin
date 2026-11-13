import { useEffect, useState } from 'react'

// Your own profile picture, shared by every place that shows it; fetched from the relay once.
let mine: string | null = null
let loaded = false
const listeners = new Set<(v: string | null) => void>()

function publish(v: string | null): void {
  mine = v
  for (const l of listeners) l(v)
}

export function useMyAvatar(): string | null {
  const [value, setValue] = useState(mine)
  useEffect(() => {
    listeners.add(setValue)
    if (!loaded) {
      loaded = true
      void window.goblin.relay
        .getAvatar()
        .then(publish)
        .catch(() => (loaded = false))
    }
    return () => void listeners.delete(setValue)
  }, [])
  return value
}

/** Saves (or with null, removes) your picture; resolves to an error message, or null when it worked. */
export async function saveMyAvatar(avatar: string | null): Promise<string | null> {
  const result = await window.goblin.relay.setAvatar(avatar)
  if (!result.ok) return result.error
  publish(avatar)
  return null
}

const SIZE = 96

/** Crops the middle square of an image file and shrinks it to a small JPEG data URL. */
export function readAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file isn’t a picture this app can read.'))
    }
    img.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas unavailable.'))
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = url
  })
}

/** Your relay user id (null until known, or signed out): what hidden blocks and scenes name you by. */
export function useMyUserId(): string | null {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void window.goblin.relay.myUserId().then((v) => live && setId(v))
    return () => {
      live = false
    }
  }, [])
  return id
}
