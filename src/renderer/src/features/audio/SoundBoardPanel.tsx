import { useEffect, useMemo, useState } from 'react'
import { SFX_LIBRARY } from '../../data/sfxLibrary'
import { playSfxCue, rememberRecentSfx } from './sfxBoardEngine'
import { getStoredSfxBoardBroadcastEnabled, setSfxBoardBroadcastEnabled } from './soundSettings'
import { addCustomFiles, addCustomTrack, ensureCustomMusicLoaded, getCustomTracks, removeCustomTrack, renameCustomTrack, subscribeCustomMusic, YOUR_SOUNDS_GROUP } from './customMusicStore'
import { useAudioDrop } from './useAudioDrop'
import { audioName, isRenamed, setAudioName, subscribeAudioNames } from './audioNames'
import { audioGroups, createAudioGroup, deleteAudioGroup, renameAudioGroup, sfxGroupFor, subscribeAudioGroups } from './audioGroups'
import { PlusSmallIcon, RenameField, XSmallIcon } from './MusicPanel'
import { ContextMenu, type ContextMenuState } from '../../ui/ContextMenu'
import './audio.css'

interface SoundBoardPanelProps {
  /** The DM's hosted session id — null while not hosting, in which case a cue always plays locally-only regardless of the broadcast toggle below (nobody's connected to receive it anyway). */
  sessionId: string | null
}

const YOURS = 'yours'

interface Category {
  id: string
  label: string
  /** Where your own sounds in it are kept. */
  group: string
  /** Built-in sounds in it. */
  cues: { id: string; label: string }[]
  /** One you made: can be renamed or deleted. */
  own?: boolean
}

interface Pad {
  id: string
  label: string
  sub?: string
  /** Set for your own sounds: the group they're kept in. */
  group?: string
}

/** DM-only — one-shot sounds as pads, by category. Add your own to any category (or a category of your own) by button or by dropping files; right-click to rename. Hitting a pad plays it here and, with "Players hear" on, for everyone in the session. */
export function SoundBoardPanel({ sessionId }: SoundBoardPanelProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [broadcastEnabled, setBroadcastEnabledState] = useState(() => getStoredSfxBoardBroadcastEnabled())
  const [, setTick] = useState(0)
  const [hit, setHit] = useState<{ id: string; n: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  // A pad or a category chip being renamed, by id.
  const [renaming, setRenaming] = useState<string | null>(null)
  useEffect(() => {
    const bump = (): void => setTick((t) => t + 1)
    const offs = [subscribeCustomMusic(bump), subscribeAudioNames(bump), subscribeAudioGroups(bump)]
    void ensureCustomMusicLoaded()
    return () => offs.forEach((off) => off())
  }, [])

  const builtIn = useMemo(() => SFX_LIBRARY.map((c) => ({ id: c.id, label: c.label, cues: c.cues.map((cue) => ({ id: cue.id, label: cue.label })) })), [])
  const categories: Category[] = [
    { id: YOURS, label: 'Yours', group: YOUR_SOUNDS_GROUP, cues: [] },
    ...audioGroups('sfx').map((g) => ({ id: g.id, label: g.label, group: sfxGroupFor(g.id), cues: [], own: true })),
    // Built-in categories with nothing in them yet (built-in or yours) stay out of the way.
    ...builtIn.map((c) => ({ ...c, group: sfxGroupFor(c.id) })).filter((c) => c.cues.length > 0 || getCustomTracks(c.group).length > 0)
  ]
  const [categoryId, setCategoryId] = useState<string>(() => (getCustomTracks(YOUR_SOUNDS_GROUP).length > 0 ? YOURS : (builtIn.find((c) => c.cues.length > 0)?.id ?? YOURS)))
  const category = categories.find((c) => c.id === categoryId) ?? categories[0]

  const padsOf = (c: Category, withSub = false): Pad[] => [
    ...c.cues.map((cue) => ({ id: cue.id, label: audioName(cue.id, cue.label), sub: withSub ? c.label : undefined })),
    ...getCustomTracks(c.group).map((t) => ({ id: t.id, label: t.title, sub: withSub ? c.label : undefined, group: c.group }))
  ]

  function flash(message: string): void {
    setToast(message)
    setTimeout(() => setToast((t) => (t === message ? null : t)), 3000)
  }
  // A save that fails (the app not restarted since an update, a file gone) says so instead of quietly doing nothing.
  const failed =
    (what: string) =>
    (e: unknown): void =>
      flash(`Couldn't ${what}: ${e instanceof Error ? e.message : String(e)}`)

  async function addSounds(files?: File[]): Promise<void> {
    const target = category
    try {
      const n = files ? await addCustomFiles(target.group, files) : await addCustomTrack(target.group)
      if (files && n === 0) flash("Those weren't audio files (mp3, wav, ogg, m4a or flac)")
      else if (n > 0) flash(`Added ${n} ${n === 1 ? 'sound' : 'sounds'} to ${target.label}`)
      setQuery('')
    } catch (e) {
      failed('add those')(e)
    }
  }
  const drop = useAudioDrop((files) => void addSounds(files))

  function newCategory(): void {
    const group = createAudioGroup('sfx', 'New category')
    setCategoryId(group.id)
    setQuery('')
    setRenaming(group.id)
  }

  async function deleteCategory(c: Category): Promise<void> {
    try {
      for (const t of getCustomTracks(c.group)) await removeCustomTrack(c.group, t.id)
      deleteAudioGroup('sfx', c.id)
      if (categoryId === c.id) setCategoryId(YOURS)
    } catch (e) {
      failed('delete it')(e)
    }
  }

  const q = query.trim().toLowerCase()
  const pads: Pad[] = q ? categories.flatMap((c) => padsOf(c, true)).filter((p) => p.label.toLowerCase().includes(q)) : padsOf(category)

  function play(id: string): void {
    playSfxCue(id, sessionId)
    rememberRecentSfx(id)
    // A new key each time restarts the flash, even on the same pad.
    setHit((h) => ({ id, n: (h?.n ?? 0) + 1 }))
  }

  return (
    <div className="ab-panel" {...drop.handlers}>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sounds…" className="gb-input ab-search" aria-label="Search sounds" />

      <label className="ab-switch" title="On: everyone in your session hears the sounds you play. Off: they only play here, for a table in one room.">
        <input
          type="checkbox"
          checked={broadcastEnabled}
          onChange={(e) => {
            setSfxBoardBroadcastEnabled(e.target.checked)
            setBroadcastEnabledState(e.target.checked)
          }}
        />
        <span className="ab-switch-track" />
        Players hear the sounds
      </label>

      {!q && (
        <div className="ab-chips" role="tablist" aria-label="Sound categories">
          {categories.map((c) =>
            renaming === c.id ? (
              <RenameField
                key={c.id}
                value={c.label}
                className="ab-chip-rename"
                onDone={(label) => {
                  setRenaming(null)
                  if (label) renameAudioGroup('sfx', c.id, label)
                }}
              />
            ) : (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={category.id === c.id}
                className={`ab-chip${category.id === c.id ? ' ab-chip--on' : ''}`}
                onClick={() => setCategoryId(c.id)}
                onContextMenu={(e) => {
                  if (!c.own) return
                  e.preventDefault()
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                      { label: 'Rename', onSelect: () => setRenaming(c.id) },
                      { label: 'Delete category and its sounds', danger: true, onSelect: () => void deleteCategory(c) }
                    ]
                  })
                }}
                title={c.own ? `${c.label} (right-click to rename or delete)` : c.label}
              >
                {c.label}
              </button>
            )
          )}
          <button type="button" className="ab-chip ab-chip--new" onClick={newCategory} title="Make a category for your own sounds">
            <PlusSmallIcon />
            New
          </button>
        </div>
      )}

      {q && pads.length === 0 ? (
        <div className="ab-empty">No sounds match “{query}”</div>
      ) : (
        <div className="ab-pads">
          {pads.map((pad) => (
            <div
              key={pad.id}
              className="ab-pad-wrap"
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({
                  x: e.clientX,
                  y: e.clientY,
                  items: [
                    { label: 'Rename', onSelect: () => setRenaming(pad.id) },
                    ...(pad.group
                      ? [{ label: 'Remove', danger: true, onSelect: () => void removeCustomTrack(pad.group!, pad.id).catch(failed('remove it')) }]
                      : isRenamed(pad.id)
                        ? [{ label: 'Use its original name', onSelect: () => setAudioName(pad.id, null) }]
                        : [])
                  ]
                })
              }}
            >
              {renaming === pad.id ? (
                <RenameField
                  value={pad.label}
                  onDone={(title) => {
                    setRenaming(null)
                    if (!title) return
                    if (pad.group) void renameCustomTrack(pad.group, pad.id, title).catch(failed('rename it'))
                    else setAudioName(pad.id, title)
                  }}
                />
              ) : (
                <button
                  key={hit?.id === pad.id ? hit.n : 0}
                  type="button"
                  className={['ab-pad', pad.group && 'ab-pad--mine', hit?.id === pad.id && 'ab-pad--hit'].filter(Boolean).join(' ')}
                  onClick={() => play(pad.id)}
                  title={`Play ${pad.label} (right-click to rename)`}
                >
                  <span className="ab-pad-label">{pad.label}</span>
                  {pad.sub && <span className="ab-pad-sub">{pad.sub}</span>}
                </button>
              )}
              {pad.group && renaming !== pad.id && (
                <button
                  type="button"
                  className="ab-x"
                  aria-label={`Remove ${pad.label}`}
                  title={`Remove ${pad.label}`}
                  onClick={() => void removeCustomTrack(pad.group!, pad.id).catch(failed('remove it'))}
                >
                  <XSmallIcon />
                </button>
              )}
            </div>
          ))}
          {!q && (
            <button type="button" className="ab-pad ab-pad--add" onClick={() => void addSounds()}>
              <PlusSmallIcon />
              Add sounds
            </button>
          )}
        </div>
      )}
      {!q && <span className="ab-hint">Add your own to {category.label}, or drop audio files anywhere here. Players hear them too.</span>}

      {drop.dragging && <div className="ab-drop">Drop to add to {category.label}</div>}
      {toast && (
        <div className="ab-toast" role="status">
          {toast}
        </div>
      )}
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  )
}

/** A 2x2 grid of pads — reads as "soundboard" the way a music note reads as "music." */
export function SoundBoardIcon(): JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.85" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.55" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.55" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.85" />
    </svg>
  )
}
