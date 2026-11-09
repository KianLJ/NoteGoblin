// Your own names for the built-in songs and sounds, kept on this machine.
// (Your added songs and sounds are renamed where they're stored instead — see customMusicStore.)

// shortcut: built-in ids are by position in their folder, so a release that adds files to one can move a name onto a neighbour; key by file name if that starts happening.
const KEY = 'gb-audio-names'
const listeners = new Set<() => void>()

function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

let names = read()

/** What a built-in song or sound is called: your name for it, else its own. */
export function audioName(id: string, original: string): string {
  return names[id] ?? original
}

export function isRenamed(id: string): boolean {
  return id in names
}

/** Names it; an empty name (or `null`) goes back to its own. */
export function setAudioName(id: string, name: string | null): void {
  const next = { ...names }
  if (name?.trim()) next[id] = name.trim()
  else delete next[id]
  names = next
  try {
    localStorage.setItem(KEY, JSON.stringify(names))
  } catch {
    /* kept for this run only */
  }
  for (const l of listeners) l()
}

export function subscribeAudioNames(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
