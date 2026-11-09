// Your own music moods and sound board categories: just their names, kept on this machine.
// Their songs and sounds are stored like any you add (see customMusicStore), under the group's id.

export type GroupKind = 'mood' | 'sfx'

export interface AudioGroup {
  id: string
  label: string
}

const KEY = 'gb-audio-groups'
const listeners = new Set<() => void>()

function read(): Record<GroupKind, AudioGroup[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<GroupKind, AudioGroup[]>>
    return { mood: raw.mood ?? [], sfx: raw.sfx ?? [] }
  } catch {
    return { mood: [], sfx: [] }
  }
}

let groups = read()

function write(next: Record<GroupKind, AudioGroup[]>): void {
  groups = next
  try {
    localStorage.setItem(KEY, JSON.stringify(groups))
  } catch {
    /* kept for this run only */
  }
  for (const l of listeners) l()
}

export function audioGroups(kind: GroupKind): AudioGroup[] {
  return groups[kind]
}

export function createAudioGroup(kind: GroupKind, label: string): AudioGroup {
  const group = { id: `${kind}-${crypto.randomUUID()}`, label }
  write({ ...groups, [kind]: [...groups[kind], group] })
  return group
}

export function renameAudioGroup(kind: GroupKind, id: string, label: string): void {
  write({ ...groups, [kind]: groups[kind].map((g) => (g.id === id ? { ...g, label } : g)) })
}

/** Forgets the group. Its songs or sounds are the caller's to remove first. */
export function deleteAudioGroup(kind: GroupKind, id: string): void {
  write({ ...groups, [kind]: groups[kind].filter((g) => g.id !== id) })
}

export function subscribeAudioGroups(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Where your own sounds in a sound board category are kept (a built-in category or one of yours). */
export function sfxGroupFor(categoryId: string): string {
  return `sfx:${categoryId}`
}
