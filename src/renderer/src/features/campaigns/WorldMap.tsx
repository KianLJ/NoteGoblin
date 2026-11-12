import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  coverAt,
  moveParty,
  PIN_COLORS,
  placeParty,
  trailLines,
  distanceBetween,
  formatDistance,
  parseAmount,
  trailDistance,
  orbitThrough,
  pinPositionsAt,
  routeWidths,
  niceLength,
  type MapScale,
  EMPTY_WORLD_MAP,
  type CampaignMaps,
  type MapPin,
  type MapPoint,
  type PinKind,
  type WorldMapDoc
} from '@shared/worldMap'
import type { Quest } from '@shared/quests'
import type { RepEntry } from '@shared/reputation'
import { absoluteDayNumber, parseTimeOfDay, type CalendarConfig } from '@shared/calendar'
import { useCalendar } from './useCalendar'
import { offerUndo } from '../../ui/undo'
import { GoblinLoader } from '../../ui/GoblinLoader'
import { ContextMenu, type ContextMenuState } from '../../ui/ContextMenu'
import { PencilIcon, XIcon } from '../../ui/icons'
import './worldMap.css'

/** Pictures already fetched this run, by map and fingerprint — reopening the box doesn't fetch them again. */
const pictures = new Map<string, string>()

/**
 * A map and pin to bring into view (the Ctrl+K search asks for one, then opens the box). Whichever World Map box is
 * showing that campaign takes it.
 */
let focus: { mapId: string; pinId: string | null } | null = null
const focusListeners = new Set<() => void>()
export function focusMapPin(mapId: string, pinId: string | null): void {
  focus = { mapId, pinId }
  focusListeners.forEach((l) => l())
}
function useMapFocus(): typeof focus {
  return useSyncExternalStore(
    (l) => {
      focusListeners.add(l)
      return () => focusListeners.delete(l)
    },
    () => focus
  )
}

type Tool = 'move' | 'pin' | 'walk' | 'measure' | 'reveal' | 'hide'

const TOOLS: Array<{ tool: Tool; label: string; hint: string; icon: ReactNode; fog?: boolean }> = [
  { tool: 'move', label: 'Move', icon: <HandGlyph />, hint: 'Drag the map to look around and scroll to zoom. Drag a pin or the party’s flag to move it; click a pin to open it. Right-click for more.' },
  { tool: 'pin', label: 'Add pin', icon: <PinToolGlyph />, hint: 'Click where the pin goes, then name it and choose what it opens.' },
  { tool: 'walk', label: 'Walk party', icon: <FlagToolGlyph />, hint: 'Click where the party walks to: their trail follows them, measured if the map has a scale. Drag their flag to move them without a trail; Esc to stop walking.' },
  { tool: 'measure', label: 'Measure', icon: <RulerGlyph />, hint: 'Drag from one place to another to measure between them, without moving the party. Type in how far that really is to set the map’s scale from it. Esc clears it.' },
  { tool: 'reveal', label: 'Reveal', icon: <SunGlyph />, hint: 'Brush over the fog to show the party what they’ve explored.', fog: true },
  { tool: 'hide', label: 'Hide', icon: <CloudGlyph />, hint: 'Brush over revealed parts to hide them again.', fog: true }
]

const PIN_KIND_LABEL: Record<PinKind, string> = { place: 'A place', note: 'A note', quest: 'A quest', rep: 'Someone (reputation)' }

const LAST_MAP = 'gb-map-current'

/**
 * The World Map box (shared/worldMap.ts): the campaign's maps — the world, a region, a city — each with pins linked to
 * notes, quests and people, the party's flag and the trail they've walked, and fog the DM reveals as the party
 * explores. Scroll to zoom (the map, never the canvas) and drag to look around. A player sees the maps shown to the
 * party, through the fog, with the shown pins.
 */
export function WorldMap({
  sessionId,
  campaignId,
  readOnly,
  noteTitles,
  onOpenNote,
  onOpenTool
}: {
  sessionId: string | null
  campaignId: string | null
  readOnly: boolean
  noteTitles?: string[]
  onOpenNote?: (title: string) => void
  onOpenTool?: (tool: 'quests' | 'reputation') => void
}): JSX.Element {
  const [doc, setDoc] = useState<CampaignMaps | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(doc)
  latest.current = doc
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try {
      return campaignId ? localStorage.getItem(`${LAST_MAP}:${campaignId}`) : null
    } catch {
      return null
    }
  })
  const choose = (id: string): void => {
    setCurrentId(id)
    try {
      if (campaignId) localStorage.setItem(`${LAST_MAP}:${campaignId}`, id)
    } catch {
      /* not remembered */
    }
  }

  useEffect(() => {
    if (!campaignId) return setDoc(null)
    const read = (): void => {
      void window.goblin.worldMap.get(campaignId, sessionId ?? undefined).then((r) => {
        if (r.ok) setDoc(r.data)
        else setError(r.error)
      })
    }
    read()
    return window.goblin.campaigns.onChanged((e) => {
      if (e.campaignId === campaignId) read()
    })
  }, [campaignId, sessionId])

  // The search asking for a map (and a pin on it).
  const wanted = useMapFocus()
  useEffect(() => {
    if (wanted && doc?.maps.some((m) => m.id === wanted.mapId)) choose(wanted.mapId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, doc])

  // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) step back and forward through the DM's edits, while they're working in this box.
  // Changes within half a second of each other (a brush stroke, a drag) undo together.
  const past = useRef<CampaignMaps[]>([])
  const future = useRef<CampaignMaps[]>([])
  const lastEdit = useRef(0)
  const root = useRef<HTMLDivElement>(null)
  const inHere = useRef(false)
  useEffect(() => {
    past.current = []
    future.current = []
  }, [campaignId])
  useEffect(() => {
    if (readOnly) return
    const onDown = (e: PointerEvent): void => {
      inHere.current = !!root.current?.contains(e.target as Node)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (!inHere.current || !(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const key = e.key.toLowerCase()
      const back = key === 'z' && !e.shiftKey
      if (!back && !(key === 'y' || (key === 'z' && e.shiftKey))) return
      const from = back ? past.current : future.current
      const to = back ? future.current : past.current
      const now = latest.current
      const step = from.pop()
      if (!step || !now) return
      e.preventDefault()
      e.stopPropagation()
      to.push(now)
      lastEdit.current = 0
      save(step, false)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, campaignId])

  function save(next: CampaignMaps, record = true): void {
    if (!campaignId || readOnly) return
    const before = latest.current
    if (record && before) {
      const t = Date.now()
      if (t - lastEdit.current > 500) {
        past.current.push(before)
        if (past.current.length > 100) past.current.shift()
      }
      lastEdit.current = t
      future.current = []
    }
    setDoc(next)
    void window.goblin.worldMap.save(campaignId, next).then((r) => {
      if (!r.ok) setError(r.error)
    })
  }
  const changeMap = (id: string, f: (m: WorldMapDoc) => WorldMapDoc): void => {
    const now = latest.current
    if (now) save({ maps: now.maps.map((m) => (m.id === id ? f(m) : m)) })
  }

  const maps = doc?.maps ?? []
  const map = maps.find((m) => m.id === currentId) ?? maps[0] ?? null

  function newMap(): void {
    const created: WorldMapDoc = { ...EMPTY_WORLD_MAP, id: crypto.randomUUID(), name: maps.length ? `Map ${maps.length + 1}` : 'The World' }
    save({ maps: [...maps, created] })
    choose(created.id)
  }

  function removeMap(m: WorldMapDoc): void {
    const before = maps
    save({ maps: maps.filter((x) => x.id !== m.id) })
    offerUndo(`Deleted the map ${m.name}`, () => save({ maps: before }))
  }

  const [loading, setLoading] = useState(false)
  async function loadPicture(m: WorldMapDoc): Promise<void> {
    if (!campaignId) return
    const picked = await window.goblin.files.pickImage({ big: true })
    if (!picked.ok) {
      if (picked.error !== 'Cancelled.') setError(picked.error)
      return
    }
    setError(null)
    setLoading(true)
    try {
      const fitted = await fitMapPicture(picked.data.dataUrl)
      if (!fitted) return setError('That picture couldn’t be read. Try saving it as a PNG or JPEG.')
      const set = await window.goblin.worldMap.setImage(campaignId, m.id, fitted.dataUrl)
      if (!set.ok) return setError(set.error)
      if (set.data) pictures.set(`${m.id}:${set.data}`, fitted.dataUrl)
      changeMap(m.id, (x) => ({ ...x, imageId: set.data, aspect: fitted.width / fitted.height }))
    } finally {
      setLoading(false)
    }
  }

  if (!campaignId) return <p className="gb-stash-empty gb-wmap-pad">Open a campaign to see its maps.</p>
  if (loading) return <GoblinLoader label="Unrolling the map" />
  if (!doc) return <GoblinLoader label="Unrolling the map" />
  if (!map)
    return (
      <div className="gb-wmap-empty">
        <MapGlyph />
        {readOnly ? (
          <p>The DM hasn’t shown the party a map yet.</p>
        ) : (
          <>
            <p>Make a map of your world, a region or a city: pin places, notes, quests and people on it, track where the party goes, and reveal it as they explore.</p>
            <button type="button" className="gb-quest-form-save" onClick={newMap}>
              New map
            </button>
          </>
        )}
        {error && <p className="gb-quests-error">{error}</p>}
      </div>
    )

  return (
    <div className="gb-wmap" ref={root}>
      <MapBar
        maps={maps}
        map={map}
        readOnly={readOnly}
        onChoose={choose}
        onNew={newMap}
        onRename={(name) => changeMap(map.id, (m) => ({ ...m, name }))}
        onShare={(shared) => changeMap(map.id, (m) => ({ ...m, shared }))}
        onScale={(scale) => changeMap(map.id, (m) => ({ ...m, scale }))}
        onPicture={() => void loadPicture(map)}
        onDelete={() => removeMap(map)}
      />
      {map.imageId ? (
        <MapView
          key={map.id}
          map={map}
          readOnly={readOnly}
          sessionId={sessionId}
          campaignId={campaignId}
          noteTitles={noteTitles}
          focusPin={wanted?.mapId === map.id ? wanted.pinId : null}
          onChange={(f) => changeMap(map.id, f)}
          onOpenNote={onOpenNote}
          onOpenTool={onOpenTool}
        />
      ) : readOnly ? (
        // Under fog, the DM's app is still making the copy players get.
        <GoblinLoader label="Unrolling the map" />
      ) : (
        <div className="gb-wmap-empty">
          <MapGlyph />
          <p>Give “{map.name}” a picture: a map you’ve drawn, found or generated.</p>
          <button type="button" className="gb-quest-form-save" onClick={() => void loadPicture(map)}>
            Choose a picture…
          </button>
        </div>
      )}
      {error && <p className="gb-quests-error gb-wmap-pad">{error}</p>}
    </div>
  )
}

const UNIT_IDEAS = ['mi', 'km', 'm', 'ft', 'leagues', 'yd', 'days on foot', 'hexes']

/** The map's scale: "N units across" — any unit at all. Without one, nothing is measured. */
function ScaleControl({ scale, onChange }: { scale: MapScale | undefined; onChange: (scale: MapScale | undefined) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const asText = (a: number | undefined): string => (a === undefined ? '' : a >= 1e6 ? formatDistance(a, '').trim() : String(a))
  const [across, setAcross] = useState(asText(scale?.across))
  const [unit, setUnit] = useState(scale?.unit ?? 'mi')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    setAcross(asText(scale?.across))
    setUnit(scale?.unit ?? 'mi')
    const away = (e: PointerEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const n = parseAmount(across) ?? 0
  return (
    <div className="gb-wmap-scale" ref={box}>
      <button type="button" className="gb-wmap-tool" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="How far the map reaches, for measuring the party’s travels">
        {scale ? `${formatDistance(scale.across, scale.unit)} across` : 'Set a scale'}
      </button>
      {open && (
        <form
          className="gb-wmap-scale-pop"
          onSubmit={(e) => {
            e.preventDefault()
            if (n > 0 && unit.trim()) onChange({ across: n, unit: unit.trim() })
            setOpen(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              setOpen(false)
            }
          }}
        >
          <span className="gb-quest-form-label">Left edge to right edge is</span>
          <div className="gb-wmap-scale-row">
            <input className="gb-input" autoFocus value={across} placeholder="300, or 18.6 trillion" aria-label="How far across" maxLength={40} onChange={(e) => setAcross(e.target.value)} />
            <input className="gb-input" value={unit} list="gb-wmap-units" placeholder="mi" aria-label="In what unit" maxLength={24} onChange={(e) => setUnit(e.target.value)} />
            <datalist id="gb-wmap-units">
              {UNIT_IDEAS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
          <span className="gb-stash-hint">
            {n > 0 && unit.trim() ? `That’s ${formatDistance(n, unit.trim())} across.` : 'Any size (“18.6 trillion”, “2.5k”, “1.86e13”) and any unit: km, m, mi, leagues…'}
          </span>
          <div className="gb-quest-form-actions">
            {scale && (
              <button type="button" className="gb-quest-form-cancel" onClick={() => (onChange(undefined), setOpen(false))}>
                No scale
              </button>
            )}
            <button type="submit" className="gb-quest-form-save" disabled={!(n > 0) || !unit.trim()}>
              Set
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

/** The Measure tool's route as a ruler: "this route is N units", and the map's scale is set to match. */
function ScaleFromRoute({ widths, unit, onSet }: { widths: number; unit: string; onSet: (scale: MapScale) => void }): JSX.Element {
  const [length, setLength] = useState('')
  const [u, setU] = useState(unit || 'mi')
  const n = parseAmount(length)
  return (
    <form
      className="gb-wmap-fromroute"
      onSubmit={(e) => {
        e.preventDefault()
        if (n && u.trim() && widths > 0) onSet({ across: n / widths, unit: u.trim() })
        setLength('')
      }}
      title="Measure between two things you know the distance between, then type it here to set the map's scale from it"
    >
      <span>That’s really</span>
      <input className="gb-input" value={length} placeholder="93 million" aria-label="How long the route really is" onChange={(e) => setLength(e.target.value.slice(0, 24))} />
      <input className="gb-input" value={u} list="gb-wmap-units" aria-label="In what unit" maxLength={24} onChange={(e) => setU(e.target.value)} />
      <button type="submit" className="gb-wmap-tool" disabled={!n || !u.trim()}>
        Set scale
      </button>
    </form>
  )
}

/** Which map, and (the DM's) naming it, showing it to the party, its picture, and deleting it. */
function MapBar({
  maps,
  map,
  readOnly,
  onChoose,
  onNew,
  onRename,
  onShare,
  onScale,
  onPicture,
  onDelete
}: {
  maps: WorldMapDoc[]
  map: WorldMapDoc
  readOnly: boolean
  onChoose: (id: string) => void
  onNew: () => void
  onRename: (name: string) => void
  onShare: (shared: boolean) => void
  onScale: (scale: MapScale | undefined) => void
  onPicture: () => void
  onDelete: () => void
}): JSX.Element {
  const [renaming, setRenaming] = useState(false)
  return (
    <div className="gb-wmap-bar">
      {renaming ? (
        <input
          className="gb-input gb-wmap-name"
          autoFocus
          defaultValue={map.name}
          aria-label="Map name"
          maxLength={80}
          onBlur={(e) => {
            if (e.target.value.trim()) onRename(e.target.value.trim())
            setRenaming(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setRenaming(false)
          }}
        />
      ) : (
        <select className="gb-input gb-wmap-name" value={map.id} aria-label="Which map" onChange={(e) => onChoose(e.target.value)}>
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {!readOnly && !m.shared ? ' (secret)' : ''}
            </option>
          ))}
        </select>
      )}
      {!readOnly && (
        <>
          <button type="button" className="gb-switcher-icon" onClick={() => setRenaming(true)} title="Rename this map" aria-label="Rename this map">
            <PencilIcon size={12} />
          </button>
          <label className="gb-wmap-switch" title={map.shared ? 'The party can open this map' : 'Only you can see this map'}>
            <input type="checkbox" checked={map.shared} onChange={(e) => onShare(e.target.checked)} />
            <span className="gb-toggle-track" aria-hidden="true" />
            Party can see it
          </label>
          <ScaleControl scale={map.scale} onChange={onScale} />
          <span className="gb-wmap-grow" />
          <button type="button" className="gb-wmap-tool" onClick={onPicture} title="Change this map’s picture (pins and fog stay where they are on it)">
            Picture…
          </button>
          <button type="button" className="gb-wmap-tool" onClick={onNew} title="Another map: a region, a city, a dungeon">
            + New map
          </button>
          <button type="button" className="gb-switcher-icon gb-switcher-icon--danger" onClick={onDelete} title="Delete this map" aria-label={`Delete ${map.name}`}>
            <XIcon size={12} />
          </button>
        </>
      )}
    </div>
  )
}

function MapView({
  map,
  readOnly,
  sessionId,
  campaignId,
  noteTitles,
  focusPin,
  onChange,
  onOpenNote,
  onOpenTool
}: {
  map: WorldMapDoc
  readOnly: boolean
  sessionId: string | null
  campaignId: string
  noteTitles?: string[]
  focusPin: string | null
  onChange: (f: (d: WorldMapDoc) => WorldMapDoc) => void
  onOpenNote?: (title: string) => void
  onOpenTool?: (tool: 'quests' | 'reputation') => void
}): JSX.Element {
  const [tool, setTool] = useState<Tool>('move')
  const [brush, setBrush] = useState(0.05)
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  // How many pixels wide the picture really is: zooming goes on until each one is a good few screen pixels.
  const [pictureWidth, setPictureWidth] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  // A pin or the party's flag being dragged: where it is now, before it's dropped.
  const [dragged, setDragged] = useState<{ id: string; x: number; y: number } | null>(null)
  // Where the pointer is while the Walk or Measure tool is on.
  const [aim, setAim] = useState<MapPoint | null>(null)
  // The Measure tool's line, from where the drag started to where it is: only on this screen, never saved.
  const [ruler, setRuler] = useState<MapPoint[]>([])
  useEffect(() => {
    if (tool !== 'measure') setRuler([])
  }, [tool])
  // A pin being edited, as it'll look: its colour and size shown on the map as they're picked.
  const [look, setLook] = useState<{ id: string; color: string; size?: number } | null>(null)
  // Esc puts the Walk tool (or any) away, back to Move.
  useEffect(() => {
    if (tool === 'move') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || (e.target instanceof Element && e.target.closest('input, textarea, select'))) return
      setTool('move')
      setAim(null)
      setRuler([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool])
  const draggedRef = useRef(dragged)
  draggedRef.current = dragged
  const frame = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const maskId = `gb-wmap-fog${useId().replace(/:/g, '')}`
  const picture = usePicture(campaignId, sessionId, map)

  useEffect(() => {
    if (focusPin) setSelected(focusPin)
  }, [focusPin])

  // The picture fits the box; pan and zoom move it from there.
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const W = box.w && box.h ? Math.min(box.w, box.h * map.aspect) : 0
  const H = W / map.aspect
  // Each of the picture's pixels up to 12 screen pixels across, at the most.
  const maxZoom = Math.max(10, W && pictureWidth ? (pictureWidth / W) * 12 : 10)
  const maxZoomRef = useRef(maxZoom)
  maxZoomRef.current = maxZoom
  // Zoomed in past the picture's own pixels: show them as crisp squares, not a blur.
  const pixelated = W > 0 && pictureWidth > 0 && (view.scale * W) / pictureWidth > 2

  // Scrolling (and pinching) in the map zooms the map, never the canvas around it.
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const r = el.getBoundingClientRect()
      const s = r.width / (el.clientWidth || 1)
      // A pinch arrives as Ctrl+scroll, in small steps.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      setView((v) => {
        const scale = Math.max(0.5, Math.min(maxZoomRef.current, v.scale * factor))
        const px = (e.clientX - r.left) / s - el.clientWidth / 2
        const py = (e.clientY - r.top) / s - el.clientHeight / 2
        const k = scale / v.scale
        return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Today on the campaign's calendar: orbiting pins are wherever they've got to by now.
  const calendar = useCalendar(sessionId ?? undefined, campaignId).calendar?.config ?? null
  const today = calendarDay(calendar)
  const placed = useMemo(() => pinPositionsAt(map, today), [map, today])

  // The DM keeps the players' copy of the picture up to date: under fog, the fog burned in.
  useFoggedCopy(campaignId, map, picture, readOnly)

  // What pins can open, for the editor and their cards.
  const [quests, setQuests] = useState<Quest[]>([])
  const [people, setPeople] = useState<RepEntry[]>([])
  useEffect(() => {
    void window.goblin.quests.get(campaignId, sessionId ?? undefined).then((r) => r.ok && setQuests(r.data.quests))
    void window.goblin.reputation.get(campaignId, sessionId ?? undefined).then((r) => r.ok && setPeople(r.data.entries))
  }, [campaignId, sessionId])

  /** Where a pointer is, as a fraction of the picture. */
  const at = (e: { clientX: number; clientY: number }, clamp = false): MapPoint | null => {
    const r = stage.current?.getBoundingClientRect()
    if (!r || !r.width) return null
    let x = (e.clientX - r.left) / r.width
    let y = (e.clientY - r.top) / r.height
    if (clamp) {
      x = Math.max(0, Math.min(1, x))
      y = Math.max(0, Math.min(1, y))
    }
    return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y }
  }

  const drag = useRef<
    | { kind: 'pan'; from: { x: number; y: number }; start: { x: number; y: number }; scale: number }
    | { kind: 'brush'; last: MapPoint }
    | { kind: 'measure' }
    | { kind: 'item'; id: string; from: { x: number; y: number }; moved: boolean; grab: MapPoint }
    | null
  >(null)

  const brushAt = (p: MapPoint): void => {
    if (tool === 'reveal') onChange((d) => ({ ...d, revealed: [...d.revealed, { ...p, r: brush }] }))
    else onChange((d) => coverAt(d, p, d.aspect))
  }

  function onPointerDown(e: React.PointerEvent): void {
    // The middle button always drags the map, whatever tool is on (and never autoscrolls the canvas).
    const middle = e.button === 1
    if ((e.button !== 0 && !middle) || (e.target as HTMLElement).closest('.gb-wmap-card, .gb-wmap-form, .gb-wmap-zoom')) return
    if (middle) {
      e.preventDefault()
      e.stopPropagation()
    }
    const item = middle ? null : (e.target as HTMLElement).closest<HTMLElement>('[data-map-item]')
    setMenu(null)
    // A pin or the flag: dragged by the DM (a click without moving opens a pin).
    if (item) {
      e.stopPropagation()
      // Where on it it was grabbed, so it moves with the pointer rather than jumping its tip to it.
      const id = item.dataset.mapItem!
      const p = at(e, true)
      const now = id === 'party' ? map.party : placed.get(id)
      const grab = p && now ? { x: p.x - now.x, y: p.y - now.y } : { x: 0, y: 0 }
      drag.current = { kind: 'item', id, from: { x: e.clientX, y: e.clientY }, moved: false, grab }
      frame.current?.setPointerCapture(e.pointerId)
      return
    }
    setSelected(null)
    const p = at(e)
    if (middle || readOnly || tool === 'move' || !p) {
      const s = frame.current ? frame.current.getBoundingClientRect().width / (frame.current.clientWidth || 1) : 1
      drag.current = { kind: 'pan', from: { x: e.clientX, y: e.clientY }, start: { x: view.x, y: view.y }, scale: s }
      frame.current?.setPointerCapture(e.pointerId)
      return
    }
    if (tool === 'pin') addPin(p)
    else if (tool === 'walk') walkTo(p)
    else if (tool === 'measure') {
      setRuler([p, p])
      drag.current = { kind: 'measure' }
      frame.current?.setPointerCapture(e.pointerId)
    }
    else {
      brushAt(p)
      drag.current = { kind: 'brush', last: p }
      frame.current?.setPointerCapture(e.pointerId)
    }
  }

  function onPointerMove(e: React.PointerEvent): void {
    const d = drag.current
    // Walking the party: the line from them to the pointer, and how far that is.
    if (!d) {
      if (tool === 'walk' && !readOnly) setAim(at(e))
      return
    }
    if (d.kind === 'measure') {
      const p = at(e, true)
      if (p) setRuler((r) => [r[0], p])
      return
    }
    if (d.kind === 'pan') setView((v) => ({ ...v, x: d.start.x + (e.clientX - d.from.x) / d.scale, y: d.start.y + (e.clientY - d.from.y) / d.scale }))
    else if (d.kind === 'brush') {
      const p = at(e)
      // A dab every so often along the stroke: a brush, not a dot per pixel.
      if (p && Math.hypot(p.x - d.last.x, (p.y - d.last.y) / map.aspect) > brush * 0.5) {
        d.last = p
        brushAt(p)
      }
    } else if (!readOnly) {
      if (!d.moved && Math.hypot(e.clientX - d.from.x, e.clientY - d.from.y) < 4) return
      d.moved = true
      const p = at(e, true)
      if (!p) return
      let to = { x: Math.max(0, Math.min(1, p.x - d.grab.x)), y: Math.max(0, Math.min(1, p.y - d.grab.y)) }
      // Locked to its orbit: the point on the orbit in the pointer's direction from its centre.
      const orbit = map.pins.find((x) => x.id === d.id)?.orbit
      const centre = orbit?.locked ? placed.get(orbit.around) : undefined
      if (orbit && centre) {
        const angle = Math.atan2((to.y - centre.y) / map.aspect, to.x - centre.x)
        to = { x: centre.x + orbit.radius * Math.cos(angle), y: centre.y + orbit.radius * Math.sin(angle) * map.aspect }
      }
      setDragged({ id: d.id, ...to })
    }
  }

  function onPointerUp(): void {
    const d = drag.current
    drag.current = null
    if (d?.kind !== 'item') return
    if (!d.moved) {
      if (d.id !== 'party') setSelected((s) => (s === d.id ? null : d.id))
      return
    }
    const to = draggedRef.current
    setDragged(null)
    if (!to) return
    // The flag dragged: set down there, no trail walked. A pin: moved.
    if (to.id === 'party') onChange((m) => placeParty(m, { x: to.x, y: to.y }))
    // An orbiting pin dropped somewhere new keeps going round, from there.
    else onChange((m) => ({ ...m, pins: m.pins.map((p) => (p.id === to.id ? reorbit(m, { ...p, x: to.x, y: to.y }, p.orbit && { around: p.orbit.around, period: p.orbit.period, clockwise: !!p.orbit.clockwise, ...(p.orbit.locked ? { radius: p.orbit.radius, locked: true } : {}) }) : p)) }))
  }

  /** The pin going round (or not) as asked, from where it is today. */
  function reorbit(m: WorldMapDoc, pin: MapPin, spin: OrbitPick | undefined): MapPin {
    const still = { ...pin }
    delete still.orbit
    if (!spin) return still
    const orbit = orbitThrough(m, spin.around, { x: pin.x, y: pin.y }, today, spin.period, spin.clockwise)
    // A distance typed in: that far out, in the same direction it's in now.
    if (!orbit) return still
    return { ...still, orbit: { ...orbit, ...(spin.radius ? { radius: spin.radius } : {}), ...(spin.locked ? { locked: true } : {}) } }
  }

  function addPin(p: MapPoint): void {
    const pin: MapPin = { id: crypto.randomUUID(), ...p, label: '', kind: 'place', color: PIN_COLORS[0], shared: false }
    onChange((d) => ({ ...d, pins: [...d.pins, pin] }))
    setEditing(pin.id)
    setTool('move')
  }

  function walkTo(p: MapPoint): void {
    // In fog, where they arrive is seen.
    onChange((d) => {
      const moved = moveParty(d, p)
      return d.fog ? { ...moved, revealed: [...moved.revealed, { ...p, r: brush }] } : moved
    })
  }

  function onContextMenu(e: React.MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    if (readOnly) return
    const p = at(e)
    if (!p) return
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Add a pin here', icon: <PinToolGlyph />, onSelect: () => addPin(p) },
        { label: 'Walk the party here', icon: <FlagToolGlyph />, separatorBefore: true, onSelect: () => walkTo(p) },
        { label: 'Put the party here (no trail)', onSelect: () => onChange((d) => placeParty(d, p)) },
        ...(map.party ? [{ label: 'Remove the party from the map', onSelect: () => onChange((d) => ({ ...d, party: null })) }] : []),
        ...(map.fog
          ? [
              { label: 'Reveal around here', icon: <SunGlyph />, separatorBefore: true, onSelect: () => onChange((d) => ({ ...d, revealed: [...d.revealed, { ...p, r: brush }] })) },
              { label: 'Hide here', icon: <CloudGlyph />, onSelect: () => onChange((d) => coverAt(d, p, d.aspect)) }
            ]
          : [{ label: 'Turn on fog of war', icon: <CloudGlyph />, separatorBefore: true, onSelect: () => onChange((d) => ({ ...d, fog: true })) }])
      ]
    })
  }

  function removePin(pin: MapPin): void {
    const before = map.pins
    // Whatever went round it stops where it is now.
    onChange((d) => ({ ...d, pins: d.pins.filter((p) => p.id !== pin.id).map((p) => (p.orbit?.around === pin.id ? reorbit(d, { ...p, ...placed.get(p.id) }, undefined) : p)) }))
    setSelected(null)
    offerUndo(`Removed ${pin.label || 'a pin'}`, () => onChange((d) => ({ ...d, pins: before })))
  }

  function openPin(pin: MapPin): void {
    if (pin.kind === 'note' && pin.ref) onOpenNote?.(pin.ref)
    else if (pin.kind === 'quest') onOpenTool?.('quests')
    else if (pin.kind === 'rep') onOpenTool?.('reputation')
  }

  const linkName = (pin: MapPin): string | null => {
    if (!pin.ref) return null
    if (pin.kind === 'note') return pin.ref
    if (pin.kind === 'quest') return quests.find((q) => q.id === pin.ref)?.title ?? null
    if (pin.kind === 'rep') return people.find((p) => p.id === pin.ref)?.name ?? null
    return null
  }

  const where = (id: string, p: MapPoint): MapPoint => (dragged?.id === id ? dragged : p)
  const sel = map.pins.find((p) => p.id === selected)
  const edited = map.pins.find((p) => p.id === editing)
  // Players see nothing under the fog (and their picture has it burned in too); the DM sees through it, dimmed.
  const fogOpacity = readOnly ? 1 : 0.5
  const party = map.party ? where('party', map.party) : null
  const toolNow = TOOLS.find((t) => t.tool === tool)!
  const unit = map.scale?.unit ?? ''
  // The last stretch walked, labelled at its middle with its length.
  const lastLeg = (() => {
    const t = map.trail
    const a = t[t.length - 2]
    const b = t[t.length - 1]
    if (!a || !b || b.gap) return null
    const d = distanceBetween(map, a, b)
    return d === null ? null : { at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, label: formatDistance(d, unit) }
  })()
  // The line to the pointer: from the party (walking) or the end of the route (measuring), with how far.
  const rulerSoFar = ruler.slice(1).reduce<number | null>((sum, b, i) => {
    const d = distanceBetween(map, ruler[i], b)
    return sum === null || d === null ? null : sum + d
  }, 0)
  const aimFrom = tool === 'walk' ? map.party : null
  const aimLine =
    aim && aimFrom && !readOnly
      ? {
          from: aimFrom,
          to: aim,
          label: (() => {
            const d = distanceBetween(map, aimFrom, aim)
            return d === null ? null : formatDistance(d, unit)
          })()
        }
      : null
  const travelled = trailDistance(map)
  // A round length about 120 screen pixels long at this zoom.
  const scaleBar = (() => {
    if (!map.scale || !W) return null
    const perPx = map.scale.across / (W * view.scale)
    const length = niceLength(perPx * 120)
    return { px: length / perPx, label: formatDistance(length, map.scale.unit) }
  })()
  return (
    <>
      {!readOnly && (
        <div className="gb-wmap-tools" role="toolbar" aria-label="Map tools">
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              type="button"
              className="gb-wmap-tool gb-wmap-tool--icon"
              aria-pressed={tool === t.tool}
              title={t.fog && !map.fog ? 'Turn on fog of war first' : t.hint}
              onClick={() => setTool(t.tool)}
              disabled={t.fog && !map.fog}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
          <span className="gb-wmap-sep" />
          <label className="gb-wmap-switch" title="Players only see the parts you reveal">
            <input type="checkbox" checked={map.fog} onChange={(e) => onChange((d) => ({ ...d, fog: e.target.checked }))} />
            <span className="gb-toggle-track" aria-hidden="true" />
            Fog of war
          </label>
          {(tool === 'reveal' || tool === 'hide' || tool === 'walk') && map.fog && (
            <label className="gb-wmap-brush" title="How much each stroke (or each step of the party) reveals">
              Brush
              <input type="range" min={0.015} max={0.15} step={0.005} value={brush} onChange={(e) => setBrush(Number(e.target.value))} aria-label="Brush size" />
            </label>
          )}
          {tool === 'measure' && ruler.length > 1 && routeWidths(map, ruler) > 0 && <ScaleFromRoute widths={routeWidths(map, ruler)} unit={map.scale?.unit ?? ''} onSet={(scale) => onChange((d) => ({ ...d, scale }))} />}
          <span className="gb-wmap-grow" />
          {(map.trail.length > 0 || map.party) && (
            <button
              type="button"
              className="gb-wmap-tool"
              onClick={() => {
                const before = { trail: map.trail, party: map.party }
                onChange((d) => ({ ...d, trail: [], party: null }))
                setAim(null)
                offerUndo('Cleared the trail', () => onChange((d) => ({ ...d, ...before })))
              }}
              title="Take away the trail and the party’s flag; the next Walk party click puts them down again"
            >
              Clear trail
            </button>
          )}
        </div>
      )}
      {!readOnly && <p className="gb-wmap-hint">{toolNow.hint}</p>}
      <div
        ref={frame}
        className={`gb-wmap-frame gb-wmap-frame--${readOnly ? 'move' : tool}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => ((drag.current = null), setDragged(null))}
        onPointerLeave={() => setAim(null)}
        onContextMenu={onContextMenu}
      >
        <div ref={stage} className="gb-wmap-stage" style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          {picture ? <img className="gb-wmap-img" src={picture} alt="" draggable={false} style={pixelated ? { imageRendering: 'pixelated' } : undefined} onLoad={(e) => setPictureWidth(e.currentTarget.naturalWidth)} /> : <GoblinLoader label="Unrolling the map" />}
          <svg className="gb-wmap-svg" width={W} height={H} viewBox={`0 0 ${W || 1} ${H || 1}`} aria-hidden="true">
            {map.fog && (
              <>
                <defs>
                  <mask id={maskId}>
                    <rect width={W} height={H} fill="white" />
                    {map.revealed.map((a, i) => (
                      <circle key={i} cx={a.x * W} cy={a.y * H} r={a.r * W} fill="black" />
                    ))}
                  </mask>
                </defs>
                <rect width={W} height={H} className="gb-wmap-fogfill" style={{ opacity: fogOpacity }} mask={`url(#${maskId})`} />
              </>
            )}
            {trailLines(map.trail).map((line, i) => (
              <polyline key={i} className="gb-wmap-trail" points={line.map((p) => `${p.x * W},${p.y * H}`).join(' ')} style={{ strokeWidth: 2.5 / view.scale }} />
            ))}
            {map.pins.map((pin) => {
              const centre = pin.orbit && placed.get(pin.orbit.around)
              // Only the orbit of the pin that's selected (or being edited or dragged).
              if (!pin.orbit || !centre || (selected !== pin.id && editing !== pin.id && dragged?.id !== pin.id)) return null
              const c = where(pin.orbit.around, centre)
              return <circle key={`orbit-${pin.id}`} className="gb-wmap-orbit" cx={c.x * W} cy={c.y * H} r={pin.orbit.radius * W} style={{ strokeWidth: 1.2 / view.scale }} />
            })}
            {ruler.length > 1 && <polyline className="gb-wmap-aim gb-wmap-ruler" points={ruler.map((p) => `${p.x * W},${p.y * H}`).join(' ')} style={{ strokeWidth: 2 / view.scale }} />}
            {ruler.map((p, i) => (
              <circle key={i} className="gb-wmap-ruler-dot" cx={p.x * W} cy={p.y * H} r={3.5 / view.scale} />
            ))}
            {aimLine && <line className="gb-wmap-aim" x1={aimLine.from.x * W} y1={aimLine.from.y * H} x2={aimLine.to.x * W} y2={aimLine.to.y * H} style={{ strokeWidth: 2 / view.scale }} />}
          </svg>
          {lastLeg && (
            <span className="gb-wmap-dist" style={{ left: lastLeg.at.x * W, top: lastLeg.at.y * H, transform: `scale(${1 / view.scale}) translate(-50%, -50%)`, transformOrigin: '0 0' }}>
              {lastLeg.label}
            </span>
          )}
          {tool === 'measure' && ruler.length > 1 && !!rulerSoFar && (
            <span className="gb-wmap-dist gb-wmap-dist--aim" style={{ left: ruler[ruler.length - 1].x * W, top: ruler[ruler.length - 1].y * H, transform: `scale(${1 / view.scale}) translate(12px, -120%)`, transformOrigin: '0 0' }}>
              {formatDistance(rulerSoFar, unit)}
            </span>
          )}
          {aimLine?.label && (
            <span className="gb-wmap-dist gb-wmap-dist--aim" style={{ left: aimLine.to.x * W, top: aimLine.to.y * H, transform: `scale(${1 / view.scale}) translate(12px, -120%)`, transformOrigin: '0 0' }}>
              {aimLine.label}
            </span>
          )}
          {map.pins.map((pin) => {
            const p = where(pin.id, placed.get(pin.id) ?? pin)
            const shown = look?.id === pin.id ? { ...pin, color: look.color, size: look.size } : pin
            if (shown.size) {
              // Laid out at its size on screen and scaled back, so it's drawn sharp and round however small it is
              // or however far in the map is zoomed (a sub-pixel box blown up loses its fill). Never less than a 3-pixel dot.
              const across = Math.max(shown.size * 2 * W * view.scale, 3)
              return (
                <button
                  key={pin.id}
                  type="button"
                  data-map-item={pin.id}
                  className={`gb-wmap-body${pin.shared ? '' : ' gb-wmap-pin--secret'}${selected === pin.id ? ' gb-wmap-pin--on' : ''}${dragged?.id === pin.id ? ' gb-wmap-pin--dragging' : ''}`}
                  style={{
                    left: p.x * W,
                    top: p.y * H,
                    width: across,
                    transform: `scale(${1 / view.scale}) translate(-50%, -50%)`,
                    ['--pin' as string]: shown.color,
                    // Its outline and selection ring in proportion to it: a hairline on a speck.
                    ['--edge' as string]: `${Math.min(1, across * 0.08)}px`,
                    ['--ring' as string]: `${Math.min(2, across * 0.18)}px`
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelected(pin.id)
                    }
                  }}
                  aria-label={pin.label || 'A pin'}
                  title={readOnly ? pin.label : `${pin.label || 'A pin'} — drag to move`}
                >
                  {pin.label && (
                    <span className="gb-wmap-pin-label gb-wmap-body-label">
                      {pin.label}
                    </span>
                  )}
                </button>
              )
            }
            return (
              <button
                key={pin.id}
                type="button"
                data-map-item={pin.id}
                className={`gb-wmap-pin${pin.shared ? '' : ' gb-wmap-pin--secret'}${selected === pin.id ? ' gb-wmap-pin--on' : ''}${dragged?.id === pin.id ? ' gb-wmap-pin--dragging' : ''}`}
                style={{ left: p.x * W, top: p.y * H, transform: `translate(-50%, -100%) scale(${1 / view.scale})`, ['--pin' as string]: shown.color }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelected(pin.id)
                  }
                }}
                aria-label={pin.label || 'A pin'}
                title={readOnly ? pin.label : `${pin.label || 'A pin'} — drag to move`}
              >
                <PinGlyph />
                {pin.label && <span className="gb-wmap-pin-label">{pin.label}</span>}
              </button>
            )
          })}
          {party && (
            <span
              data-map-item={readOnly ? undefined : 'party'}
              className={`gb-wmap-party${readOnly ? '' : ' gb-wmap-party--movable'}`}
              style={{ left: party.x * W, top: party.y * H, transform: `translate(-20%, -100%) scale(${1 / view.scale})` }}
              title={readOnly ? 'The party' : 'The party — drag to move them without a trail'}
            >
              <PartyGlyph />
            </span>
          )}
        </div>
        {sel && !edited && (
          <div className="gb-wmap-card" role="dialog" aria-label={sel.label || 'Pin'}>
            <div className="gb-wmap-card-head">
              <strong>{sel.label || 'Unnamed pin'}</strong>
              {!readOnly && !sel.shared && <span className="gb-quest-badge">Secret</span>}
              <button type="button" className="gb-switcher-icon" onClick={() => setSelected(null)} aria-label="Close">
                <XIcon size={11} />
              </button>
            </div>
            {linkName(sel) && (
              <button type="button" className="gb-quest-note" onClick={() => openPin(sel)}>
                {PIN_KIND_LABEL[sel.kind]}: {linkName(sel)} ›
              </button>
            )}
            {!readOnly && (
              <div className="gb-wmap-card-actions">
                <button type="button" className="gb-stash-act" onClick={() => setEditing(sel.id)}>
                  Edit
                </button>
                <button type="button" className="gb-stash-act" onClick={() => onChange((d) => ({ ...d, pins: d.pins.map((p) => (p.id === sel.id ? { ...p, shared: !p.shared } : p)) }))}>
                  {sel.shared ? 'Hide from the party' : 'Show the party'}
                </button>
                <button type="button" className="gb-switcher-icon gb-switcher-icon--danger" onClick={() => removePin(sel)} aria-label="Remove this pin" title="Remove">
                  <TrashGlyph />
                </button>
              </div>
            )}
          </div>
        )}
        {edited && (
          <PinForm
            pin={edited}
            noteTitles={noteTitles}
            quests={quests}
            people={people}
            pins={map.pins}
            calendar={calendar}
            pictureWidth={pictureWidth}
            scale={map.scale}
            onDone={(next, spin) => {
              const now = placed.get(next.id) ?? next
              onChange((d) => ({ ...d, pins: d.pins.map((p) => (p.id === next.id ? reorbit(d, { ...next, ...now }, spin) : p)) }))
              setEditing(null)
              setLook(null)
              setSelected(next.id)
            }}
            onPreview={(l) => setLook({ id: edited.id, ...l })}
            onCancel={() => (setEditing(null), setLook(null))}
          />
        )}
        {scaleBar && (
          <div className="gb-wmap-scalebar" title="Scale at this zoom">
            <span className="gb-wmap-scalebar-line" style={{ width: scaleBar.px }} />
            {scaleBar.label}
          </div>
        )}
        {travelled !== null && (
          <span className="gb-wmap-travelled" title="How far the party has walked along their trail">
            Travelled <strong>{formatDistance(travelled, map.scale!.unit)}</strong>
          </span>
        )}
        <div className="gb-wmap-zoom">
          <button type="button" onClick={() => setView((v) => ({ ...v, scale: Math.min(maxZoom, v.scale * 1.25) }))} aria-label="Zoom in" title="Zoom in (or scroll)">
            +
          </button>
          <button type="button" onClick={() => setView({ x: 0, y: 0, scale: 1 })} aria-label="Fit the map" title="Fit the map">
            ⤢
          </button>
          <button type="button" onClick={() => setView((v) => ({ ...v, scale: Math.max(0.5, v.scale / 1.25) }))} aria-label="Zoom out" title="Zoom out">
            −
          </button>
        </div>
      </div>
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </>
  )
}

/** Map pictures wider (or taller) than this are shrunk: plenty to zoom into, and small enough to send to players. */
const MAX_MAP_SIDE = 8192

/**
 * A picked map picture made ready to keep: one over MAX_MAP_SIDE is shrunk as it's decoded (a 16k picture never sits
 * whole in memory) and kept as a JPEG; a smaller one is kept as it is. Null if it can't be read.
 */
export async function fitMapPicture(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    // Its size, from loading it — which reads its header, not every pixel.
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = reject
      img.src = URL.createObjectURL(blob)
    })
    if (!width || !height) return null
    const scale = Math.min(1, MAX_MAP_SIDE / Math.max(width, height))
    // Small enough, and not a huge file: as it is.
    if (scale === 1 && dataUrl.length < 12 * 1024 * 1024) return { dataUrl, width, height }
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const bitmap = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const g = canvas.getContext('2d')
    if (!g) return null
    g.drawImage(bitmap, 0, 0)
    bitmap.close()
    // A JPEG a little rougher each time until it fits the limit the DM's computer keeps to.
    for (const quality of [0.9, 0.82, 0.72, 0.6]) {
      const out = canvas.toDataURL('image/jpeg', quality)
      if (out.length < 15 * 1024 * 1024) return { dataUrl: out, width: w, height: h }
    }
    return null
  } catch {
    return null
  }
}

/** A map's picture as this viewer gets it — fetched once per change, the DM's straight away, a player's in pieces. */
function usePicture(campaignId: string, sessionId: string | null, map: WorldMapDoc): string | null {
  const key = map.imageId ? `${map.id}:${map.imageId}` : null
  const [picture, setPicture] = useState<string | null>(() => (key ? (pictures.get(key) ?? null) : null))
  useEffect(() => {
    if (!key) return setPicture(null)
    const have = pictures.get(key)
    if (have) return setPicture(have)
    setPicture(null)
    const off = window.goblin.worldMap.onImage((p) => {
      if (p.campaignId !== campaignId || p.mapId !== map.id || p.imageId !== map.imageId) return
      pictures.set(key, p.image)
      setPicture(p.image)
    })
    void window.goblin.worldMap.image(campaignId, map.id, sessionId ?? undefined).then((r) => {
      if (r.ok && r.data) {
        pictures.set(key, r.data)
        setPicture(r.data)
      }
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, sessionId, key])
  return picture
}

/**
 * The DM's side: while a map is under fog, players get a copy of its picture with the fog painted in — made here, a
 * moment after the fog last changed — so what's under the fog never leaves the DM's computer.
 */
function useFoggedCopy(campaignId: string, map: WorldMapDoc, picture: string | null, readOnly: boolean): void {
  const fogKey = map.fog ? JSON.stringify(map.revealed) : null
  const made = useRef<string | null>(null)
  useEffect(() => {
    if (readOnly || !picture || !fogKey) return
    const key = `${map.imageId}|${fogKey}`
    if (made.current === key) return
    const t = setTimeout(() => {
      void burnFog(picture, map).then((fogged) => {
        if (!fogged) return
        made.current = key
        void window.goblin.worldMap.setImage(campaignId, map.id, fogged, true)
      })
    }, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, map.id, map.imageId, picture, fogKey, readOnly])
}

/** The picture with everything not revealed painted over: what a player is sent of a fogged map. */
export async function burnFog(picture: string, map: Pick<WorldMapDoc, 'revealed'>): Promise<string | null> {
  const img = new Image()
  img.src = picture
  try {
    await img.decode()
  } catch {
    return null
  }
  // Big enough to read, small enough to send: no wider than 3000 pixels.
  const scale = Math.min(1, 3000 / (img.naturalWidth || 1))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  if (!g) return null
  g.drawImage(img, 0, 0, w, h)
  // The fog on a canvas of its own, the revealed circles cut out of it, laid over the picture.
  const fog = document.createElement('canvas')
  fog.width = w
  fog.height = h
  const f = fog.getContext('2d')!
  f.fillStyle = '#151210'
  f.fillRect(0, 0, w, h)
  f.globalCompositeOperation = 'destination-out'
  for (const a of map.revealed) {
    f.beginPath()
    f.arc(a.x * w, a.y * h, a.r * w, 0, Math.PI * 2)
    f.fill()
  }
  g.drawImage(fog, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** A pin's name, what it opens, its colour, and whether the party can see it. */
function PinForm({
  pin,
  noteTitles,
  quests,
  people,
  pins,
  calendar,
  pictureWidth,
  scale,
  onDone,
  onPreview,
  onCancel
}: {
  pin: MapPin
  noteTitles?: string[]
  quests: Quest[]
  people: RepEntry[]
  pins: MapPin[]
  calendar: CalendarConfig | null
  pictureWidth: number
  scale: MapScale | undefined
  onDone: (pin: MapPin, orbit: OrbitPick | undefined) => void
  onPreview: (look: { color: string; size?: number }) => void
  onCancel: () => void
}): JSX.Element {
  const [d, setD] = useState(pin)
  useEffect(() => {
    onPreview({ color: d.color, size: d.size })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.color, d.size])
  const customColor = !(PIN_COLORS as readonly string[]).includes(d.color)
  const units = periodUnits(calendar)
  const [around, setAround] = useState(pin.orbit?.around ?? '')
  const [unit, setUnit] = useState(() => {
    const p = pin.orbit?.period
    return [...units].reverse().find((u) => p !== undefined && p >= u.days)?.label ?? units[units.length - 1].label
  })
  const unitDays = units.find((u) => u.label === unit)?.days ?? 1
  const [every, setEvery] = useState(() => (pin.orbit ? String(+(pin.orbit.period / unitDays).toPrecision(6)) : '1'))
  const [clockwise, setClockwise] = useState(pin.orbit?.clockwise ?? false)
  const [locked, setLocked] = useState(pin.orbit?.locked ?? false)
  // It can't go round itself, or round anything already going round it.
  const centres = pins.filter((p) => p.id !== pin.id && !circlesBack(pins, p.id, pin.id))
  const period = Number(every) * unitDays
  const isCentre = pins.some((p) => p.orbit?.around === pin.id)
  // With a scale, sizes and distances in its unit: a planet's real diameter, how far out it goes round.
  const inUnits = (fraction: number | undefined): string => (scale && fraction ? String(+(fraction * scale.across).toPrecision(6)) : '')
  const [distance, setDistance] = useState(() => inUnits(pin.orbit?.radius))
  const [diameter, setDiameter] = useState(() => inUnits(pin.size && pin.size * 2))
  const typedRadius = scale ? parseAmount(distance) : null
  const set = <K extends keyof MapPin>(k: K, v: MapPin[K]): void => setD((p) => ({ ...p, [k]: v }))
  const listId = useMemo(() => `gb-wmap-notes-${pin.id}`, [pin.id])
  return (
    <form
      className="gb-quest-form gb-wmap-form"
      onSubmit={(e) => {
        e.preventDefault()
        onDone(
          { ...d, label: d.label.trim(), ref: d.kind === 'place' ? undefined : d.ref },
          around && period > 0 ? { around, period, clockwise, locked, ...(typedRadius && scale ? { radius: Math.min(10, typedRadius / scale.across) } : {}) } : undefined
        )
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <input className="gb-quest-form-title" autoFocus value={d.label} placeholder="Name this place" aria-label="Pin name" maxLength={120} onChange={(e) => set('label', e.target.value)} />
      <div className="gb-quest-form-label">Opens</div>
      <div className="gb-wmap-kinds" role="radiogroup" aria-label="What it opens">
        {(Object.keys(PIN_KIND_LABEL) as PinKind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={d.kind === k} className="gb-quest-for-chip" aria-pressed={d.kind === k} onClick={() => setD((p) => ({ ...p, kind: k, ref: undefined }))}>
            {k === 'place' ? 'Nothing' : k === 'rep' ? 'Someone' : k === 'note' ? 'A note' : 'A quest'}
          </button>
        ))}
      </div>
      {d.kind === 'note' && (
        <>
          <input className="gb-input" value={d.ref ?? ''} list={listId} placeholder="Which note" aria-label="Which note" onChange={(e) => set('ref', e.target.value)} />
          <datalist id={listId}>
            {(noteTitles ?? []).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </>
      )}
      {d.kind === 'quest' && (
        <select className="gb-input" value={d.ref ?? ''} aria-label="Which quest" onChange={(e) => set('ref', e.target.value || undefined)}>
          <option value="">Pick a quest…</option>
          {quests.map((q) => (
            <option key={q.id} value={q.id}>
              {q.title || 'Untitled quest'}
            </option>
          ))}
        </select>
      )}
      {d.kind === 'rep' && (
        <select className="gb-input" value={d.ref ?? ''} aria-label="Who" onChange={(e) => set('ref', e.target.value || undefined)}>
          <option value="">Pick someone…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <div className="gb-wmap-colors" role="radiogroup" aria-label="Colour">
        {PIN_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={d.color === c} aria-label={c} className="gb-wmap-color" style={{ background: c }} onClick={() => set('color', c)} />
        ))}
        <label className={`gb-wmap-color gb-wmap-color--custom${customColor ? ' gb-wmap-color--on' : ''}`} style={customColor ? { background: d.color } : undefined} title="Any colour">
          <input type="color" value={d.color} aria-label="Any colour" onChange={(e) => set('color', e.target.value)} />
        </label>
      </div>
      <div className="gb-quest-form-label">Goes round</div>
      <select className="gb-input" value={around} aria-label="What it goes round" onChange={(e) => setAround(e.target.value)}>
        <option value="">Nothing: it stays put</option>
        {centres.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label || 'An unnamed pin'}
          </option>
        ))}
      </select>
      {around && (
        <>
          <div className="gb-wmap-orbit-row">
            <span>Once every</span>
            <input className="gb-input" inputMode="decimal" value={every} aria-label="How many" onChange={(e) => setEvery(e.target.value.replace(/[^\d.]/g, '').slice(0, 10))} />
            <select className="gb-input" value={unit} aria-label="Days, weeks or years" onChange={(e) => setUnit(e.target.value)}>
              {units.map((u) => (
                <option key={u.label} value={u.label}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          {scale && (
            <div className="gb-wmap-orbit-row">
              <span>Distance</span>
              <input className="gb-input" value={distance} placeholder="where it is now" aria-label="How far out it goes round" onChange={(e) => setDistance(e.target.value.slice(0, 24))} />
              <span>{scale.unit} from its centre</span>
            </div>
          )}
          <div className="gb-wmap-kinds" role="radiogroup" aria-label="Which way round">
            <button type="button" role="radio" aria-checked={!clockwise} aria-pressed={!clockwise} className="gb-quest-for-chip" onClick={() => setClockwise(false)}>
              Anticlockwise
            </button>
            <button type="button" role="radio" aria-checked={clockwise} aria-pressed={clockwise} className="gb-quest-for-chip" onClick={() => setClockwise(true)}>
              Clockwise
            </button>
          </div>
          <label className="gb-quest-form-toggle" title="Dragging it moves it round its orbit only, never further in or out">
            <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
            <span className="gb-toggle-track" aria-hidden="true" />
            Locked to its orbit
          </label>
          <span className="gb-stash-hint">
            {calendar
              ? locked ? 'It goes round as the calendar’s date moves on. Drag it to move it round its orbit.' : 'It goes round from where it is now, as the calendar’s date moves on. Drag it to change how far out it is.'
              : 'Orbits move with the campaign’s calendar: make one, and they’ll go round as its date moves on.'}
          </span>
        </>
      )}
      {(around || isCentre || d.size) && (
        <label className="gb-wmap-size">
          <span>Sphere size</span>
          <input
            type="range"
            min={0}
            max={SIZE_STEPS}
            step={1}
            value={sizeToStep(d.size)}
            aria-label="Sphere size"
            onChange={(e) => {
              const v = stepToSize(Number(e.target.value))
              setDiameter(inUnits(v && v * 2))
              setD((p) => {
                const next: MapPin = { ...p, size: v }
                if (!v) delete next.size
                return next
              })
            }}
          />
          <span className="gb-stash-hint">
            {!d.size
              ? 'A pin'
              : scale
                ? `A sphere ${formatDistance(d.size * 2 * scale.across, scale.unit)} across${pictureWidth ? ` (${formatPixels(d.size * 2 * pictureWidth)} of the picture)` : ''}`
                : pictureWidth
                  ? `A sphere ${formatPixels(d.size * 2 * pictureWidth)} of the picture across (set the map’s scale to see it in miles, km…)`
                  : 'Drawn as a sphere'}
          </span>
        </label>
      )}
      {scale && (around || isCentre || d.size) && (
        <div className="gb-wmap-orbit-row">
          <span>Diameter</span>
          <input
            className="gb-input"
            value={diameter}
            placeholder="none"
            aria-label="Sphere diameter"
            onChange={(e) => {
              const text = e.target.value.slice(0, 24)
              setDiameter(text)
              const n = parseAmount(text)
              setD((p) => {
                const next: MapPin = { ...p, size: n ? Math.min(0.5, n / 2 / scale.across) : undefined }
                if (!next.size) delete next.size
                return next
              })
            }}
          />
          <span>{scale.unit}</span>
        </div>
      )}
      <label className="gb-quest-form-toggle">
        <input type="checkbox" checked={d.shared} onChange={(e) => set('shared', e.target.checked)} />
        <span className="gb-toggle-track" aria-hidden="true" />
        The party can see it
      </label>
      <div className="gb-quest-form-actions">
        <button type="button" className="gb-quest-form-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="gb-quest-form-save">
          Save
        </button>
      </div>
    </form>
  )
}

/** What a pin's editor asks for to set it going round: the rest comes from where it is. */
interface OrbitPick {
  around: string
  period: number
  clockwise: boolean
  locked?: boolean
  /** How far out, as a fraction of the map's width, when it's typed in; otherwise from where the pin is. */
  radius?: number
}

/** The sphere size slider: logarithmic, step 0 is a pin, then from a hundred-thousandth of the map’s width to a tenth. */
const SIZE_STEPS = 1000
const SIZE_MIN = 1e-5
const SIZE_MAX = 0.1
function stepToSize(step: number): number | undefined {
  return step > 0 ? SIZE_MIN * (SIZE_MAX / SIZE_MIN) ** (step / SIZE_STEPS) : undefined
}
function sizeToStep(size: number | undefined): number {
  if (!size) return 0
  return Math.max(1, Math.min(SIZE_STEPS, Math.round((Math.log(size / SIZE_MIN) / Math.log(SIZE_MAX / SIZE_MIN)) * SIZE_STEPS)))
}
function formatPixels(px: number): string {
  return px >= 10 ? `${Math.round(px).toLocaleString('en')} px` : `${+px.toPrecision(2)} px`
}

/** The day it is on the campaign's calendar, hours as a fraction — 0 with no calendar, so orbits stand still. */
function calendarDay(config: CalendarConfig | null): number {
  if (!config?.months.length) return 0
  return absoluteDayNumber(config, config.currentDate) + (parseTimeOfDay(config.timeOfDay) ?? 0) / 24
}

/** Orbit periods in this calendar's days, weeks and years (a year as long as its months add up to). */
function periodUnits(config: CalendarConfig | null): Array<{ label: string; days: number }> {
  const week = config?.weekdays.length || 7
  const year = config?.months.reduce((n, m) => n + m.length, 0) || 365
  return [
    { label: 'hours', days: 1 / 24 },
    { label: 'days', days: 1 },
    { label: 'weeks', days: week },
    { label: 'years', days: year }
  ]
}

/** Whether `id` goes round `target`, however many orbits away. */
function circlesBack(pins: MapPin[], id: string, target: string): boolean {
  const byId = new Map(pins.map((p) => [p.id, p]))
  let at = byId.get(id)
  for (let i = 0; at?.orbit && i < 12; i++) {
    if (at.orbit.around === target) return true
    at = byId.get(at.orbit.around)
  }
  return false
}

function PinGlyph(): JSX.Element {
  return (
    <svg className="gb-wmap-pin-mark" width="22" height="28" viewBox="0 0 22 28" aria-hidden="true">
      <path d="M11 27s9-9.2 9-16a9 9 0 0 0-18 0c0 6.8 9 16 9 16Z" fill="var(--pin)" stroke="rgba(0,0,0,0.55)" strokeWidth="1.2" />
      <circle cx="11" cy="11" r="3.4" fill="rgba(255,255,255,0.85)" />
    </svg>
  )
}

function PartyGlyph(): JSX.Element {
  return (
    <svg width="26" height="32" viewBox="0 0 26 32" aria-hidden="true">
      <path d="M6 31V3" stroke="#2b2118" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7 3h15l-4 5 4 5H7Z" fill="#d39a2b" stroke="#2b2118" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="6" cy="30" r="2.4" fill="#2b2118" />
    </svg>
  )
}

const glyph = (d: ReactNode): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    {d}
  </svg>
)

function HandGlyph(): JSX.Element {
  return glyph(<path d="M5 8V3.5a1 1 0 0 1 2 0V7m0-4.5a1 1 0 0 1 2 0V7m0-3.5a1 1 0 0 1 2 0V8m0-2.5a1 1 0 0 1 2 0V10a4.5 4.5 0 0 1-4.5 4.5h-.6a4 4 0 0 1-3.2-1.6L2.2 9.6a1 1 0 0 1 1.5-1.3L5 9.5" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" />)
}
function PinToolGlyph(): JSX.Element {
  return glyph(<path d="M8 14.5s4.5-4.4 4.5-8a4.5 4.5 0 0 0-9 0c0 3.6 4.5 8 4.5 8ZM8 8.2a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />)
}
function FlagToolGlyph(): JSX.Element {
  return glyph(<path d="M4 14.5v-13M4 2h8.5l-2 3 2 3H4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />)
}
function RulerGlyph(): JSX.Element {
  return glyph(<path d="M2 11.5 11.5 2l2.5 2.5L4.5 14Zm2.2-2.2 1.3 1.3m.9-3.5 1.3 1.3m.9-3.5 1.3 1.3m.9-3.5 1.3 1.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />)
}
function SunGlyph(): JSX.Element {
  return glyph(<path d="M8 10.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6ZM8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />)
}
function CloudGlyph(): JSX.Element {
  return glyph(<path d="M4.5 12.5h7a3 3 0 0 0 .4-6 4 4 0 0 0-7.7.9 2.6 2.6 0 0 0 .3 5.1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />)
}
function TrashGlyph(): JSX.Element {
  return glyph(<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />)
}
function MapGlyph(): JSX.Element {
  return (
    <svg width="44" height="44" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5Z" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M5.5 2v10.5M10.5 3.5V14" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  )
}
