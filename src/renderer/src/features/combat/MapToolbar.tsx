// The battle map's controls, laid out the way map tools usually are: the
// tools down the left side (each with a key), the chosen tool's own options
// along the top, and undo, redo, snapping and map settings in the top-right.
import type { ReactNode } from 'react'
import type { TemplateKind } from '@shared/battleMap'
import type { MapTool, WallDraw } from './BattleMapView'
import { LIGHT_PRESETS } from '@shared/vision'

export type LightPreset = (typeof LIGHT_PRESETS)[number]

/** The Props tool: put props on the map and move them, or draw (and pick) the invisible blockers that go round them. */
export type PropMode = 'place' | 'blocker' | 'pickBlocker'

export type RailTool = 'move' | 'ruler' | 'shapes' | 'walls' | 'light' | 'images' | 'props'

export const isShape = (t: MapTool): t is TemplateKind => t === 'cone' || t === 'sphere' || t === 'line' || t === 'cube'
export const railOf = (t: MapTool): RailTool => (isShape(t) ? 'shapes' : t)

export const RAIL: Array<{ tool: RailTool; label: string; key: string; hint: string; dmOnly?: boolean }> = [
  { tool: 'move', label: 'Move', key: 'V', hint: 'Drag a token to move it (walls stop it; hold Alt to drag through), or drag the map to pan. Click a door to open or close it.' },
  { tool: 'ruler', label: 'Measure', key: 'R', hint: 'Drag between squares to measure. Diagonals count as one square.' },
  { tool: 'shapes', label: 'Spell areas', key: 'S', hint: 'Pick a shape above, then drag from where it starts: the distance sets its size.', dmOnly: true },
  { tool: 'walls', label: 'Walls & doors', key: 'W', hint: 'Draw rooms and walls, then set doors into them. Walls and closed doors stop tokens and sight.', dmOnly: true },
  { tool: 'light', label: 'Lights', key: 'L', hint: 'Pick a kind of light along the top, then click the map to place one; click a light to change how far it reaches. The map’s lighting is in Map settings.', dmOnly: true },
  { tool: 'images', label: 'Map images', key: 'I', hint: 'Add map images, then drag them into place and size them to line up with the grid.', dmOnly: true },
  { tool: 'props', label: 'Props', key: 'P', hint: 'Your campaign’s props: click one in the library to put it on the map, then drag it into place and size it from its corner. Blocker draws invisible walls round them that stop tokens.', dmOnly: true }
]

const SHAPES: Array<{ kind: TemplateKind; label: string; hint: string }> = [
  { kind: 'cone', label: 'Cone', hint: 'Drag from the caster: the distance sets its length, the direction where it points.' },
  { kind: 'sphere', label: 'Sphere', hint: 'Drag from where the spell lands: the distance sets its radius.' },
  { kind: 'line', label: 'Line', hint: 'Drag from the caster along the line (5 ft wide): the distance sets its length.' },
  { kind: 'cube', label: 'Cube', hint: 'Drag from one corner: the distance sets its side.' }
]

const WALL_DRAWS: Array<{ draw: WallDraw; label: string; hint: string }> = [
  { draw: 'room', label: 'Room', hint: 'Drag from one corner of a room to the other: four walls, joined. Corners snap to other walls and to the grid.' },
  { draw: 'wall', label: 'Wall', hint: 'Click corner to corner; click the first corner again to close the shape. Corners snap to other walls’ ends, onto walls, and to the grid.' },
  { draw: 'door', label: 'Door', hint: 'Click a wall to set a one-square door into it, or drag along a wall for a wider one — that stretch of wall is cut out. Click a door with Move to open it.' },
  { draw: 'window', label: 'Window', hint: 'Click a wall to set a window into it, or drag along it for a wider one. Windows are glass: sight and light pass; closed, they stop tokens.' },
  { draw: 'select', label: 'Pick', hint: 'Click a wall, door or window to pick it: change it, drag its ends, or Delete it. Drag a box round several (or Ctrl-click) to pick them all.' }
]

const PROP_MODES: Array<{ mode: PropMode; label: string; hint: string }> = [
  { mode: 'place', label: 'Move props', hint: 'Click a prop on the map to pick it: drag it to move it, drag its corner to size it. Delete removes it.' },
  { mode: 'blocker', label: 'Blocker', hint: 'Invisible walls that only stop tokens, round props, furniture or a pit. Sight and light pass, and players never see them. Click corner to corner; click the first corner again to close the shape.' },
  { mode: 'pickBlocker', label: 'Pick blocker', hint: 'Click a blocker to pick it: drag its ends, or Delete it. Drag a box round several (or Ctrl-click) to pick them all.' }
]

/** The tools, down the left of the map. */
export function ToolRail({ tool, onTool, playerOnly = false }: { tool: MapTool; onTool: (t: RailTool) => void; playerOnly?: boolean }): JSX.Element {
  const active = railOf(tool)
  return (
    <div style={{ position: 'absolute', left: 12, top: 12, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 2, padding: 4, borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}>
      {RAIL.filter((r) => !playerOnly || !r.dmOnly).map((r, i, list) => (
        <div key={r.tool}>
          {i > 0 && list[i - 1].dmOnly !== r.dmOnly && <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 4px' }} />}
          <button type="button" onClick={() => onTool(r.tool)} title={`${r.label} (${r.key})`} aria-label={r.label} aria-pressed={active === r.tool} style={railButton(active === r.tool)}>
            <ToolIcon tool={r.tool} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** The chosen tool's options, along the top of the map (nothing for tools without any). */
export function ToolOptions({
  tool,
  onShape,
  wallDraw,
  onWallDraw,
  onAddImages,
  onOpenProps,
  propMode,
  onPropMode,
  newLight,
  onNewLight,
  onHint
}: {
  tool: MapTool
  onShape: (k: TemplateKind) => void
  wallDraw: WallDraw
  onWallDraw: (w: WallDraw) => void
  onAddImages: (files: File[]) => void
  onOpenProps: () => void
  propMode: PropMode
  onPropMode: (m: PropMode) => void
  newLight: LightPreset
  onNewLight: (p: LightPreset) => void
  onHint: (h: string) => void
}): JSX.Element | null {
  const rail = railOf(tool)
  const label = RAIL.find((r) => r.tool === rail)?.label
  let body: ReactNode = null
  if (rail === 'shapes')
    body = SHAPES.map((sh) => (
      <Chip
        key={sh.kind}
        on={tool === sh.kind}
        title={sh.hint}
        onClick={() => {
          onShape(sh.kind)
          onHint(sh.hint)
        }}
      >
        {sh.label}
      </Chip>
    ))
  else if (rail === 'walls')
    body = WALL_DRAWS.map((d) => (
      <Chip
        key={d.draw}
        on={wallDraw === d.draw}
        title={d.hint}
        onClick={() => {
          onWallDraw(d.draw)
          onHint(d.hint)
        }}
      >
        {d.label}
      </Chip>
    ))
  else if (rail === 'images')
    body = (
      <label style={{ ...chip(true), display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Add one or more map images; they go in the middle of the view">
        + Add images…
        <input
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (files.length) onAddImages(files)
          }}
        />
      </label>
    )
  else if (rail === 'light')
    body = LIGHT_PRESETS.map((pr) => (
      <Chip
        key={pr.name}
        on={newLight.name === pr.name}
        title={`${pr.bright} ft bright, ${pr.dim} ft dim — click the map to place one`}
        onClick={() => {
          onNewLight(pr)
          onHint(`Click the map to place a ${pr.name.toLowerCase()} (${pr.bright} ft bright, ${pr.dim} ft dim). Click a light to change or move it.`)
        }}
      >
        {pr.name}
      </Chip>
    ))
  else if (rail === 'props')
    body = (
      <>
        <Chip on={false} title="Open the prop library" onClick={onOpenProps}>
          Library
        </Chip>
        <Divider />
        {PROP_MODES.map((m) => (
          <Chip
            key={m.mode}
            on={propMode === m.mode}
            title={m.hint}
            onClick={() => {
              onPropMode(m.mode)
              onHint(m.hint)
            }}
          >
            {m.label}
          </Chip>
        ))}
      </>
    )
  if (!body) return null
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, padding: 4, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)', maxWidth: '100%' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{label}</span>
        {body}
      </div>
    </div>
  )
}

/** Undo, redo, snapping and map settings, in the top-right of the map. */
export function MapControls({ canUndo, canRedo, onUndo, onRedo, snap, onSnap, settingsOpen, onSettings }: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; snap: boolean; onSnap: () => void; settingsOpen: boolean; onSettings: () => void }): JSX.Element {
  return (
    <div style={{ flexShrink: 0, pointerEvents: 'auto', marginLeft: 'auto', display: 'flex', gap: 2, padding: 4, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}>
      <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" style={{ ...railButton(false), opacity: canUndo ? 1 : 0.35 }}>
        <Svg>
          <path d="M6 4L3 7l3 3" />
          <path d="M3 7h6.5a3.5 3.5 0 0 1 0 7H7" />
        </Svg>
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo" style={{ ...railButton(false), opacity: canRedo ? 1 : 0.35 }}>
        <Svg>
          <path d="M10 4l3 3-3 3" />
          <path d="M13 7H6.5a3.5 3.5 0 0 0 0 7H9" />
        </Svg>
      </button>
      <div style={{ width: 1, background: 'var(--border-subtle)', margin: '4px 2px' }} />
      {/* Labelled, not just an icon: a magnet alone didn't read as "snap to grid". */}
      <button
        type="button"
        onClick={onSnap}
        title={snap ? 'Things you place snap to the grid — click to place them freely' : 'Things you place go exactly where you drop them — click to snap them to the grid'}
        aria-label="Snap to grid"
        aria-pressed={snap}
        style={{ ...railButton(snap), width: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px 0 8px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
      >
        <Svg>
          <path d="M2 5.5h12M2 10.5h12M5.5 2v12M10.5 2v12" opacity={snap ? 0.9 : 0.45} />
          {snap ? <circle cx="10.5" cy="10.5" r="2" fill="currentColor" stroke="none" /> : <circle cx="8.6" cy="12.4" r="1.8" fill="currentColor" stroke="none" />}
        </Svg>
        {snap ? 'Snap on' : 'Snap off'}
      </button>
      <button type="button" onClick={onSettings} title="Map settings: lighting and sight" aria-label="Map settings" aria-pressed={settingsOpen} style={railButton(settingsOpen)}>
        {/* A cog. */}
        <Svg>
          <path d="M6.9 1.5h2.2l.4 1.8 1.2.5 1.6-1 1.5 1.5-1 1.6.5 1.2 1.8.4v2.2l-1.8.4-.5 1.2 1 1.6-1.5 1.5-1.6-1-1.2.5-.4 1.8H6.9l-.4-1.8-1.2-.5-1.6 1-1.5-1.5 1-1.6-.5-1.2-1.8-.4V6.9l1.8-.4.5-1.2-1-1.6 1.5-1.5 1.6 1 1.2-.5z" />
          <circle cx="8" cy="8" r="2.1" />
        </Svg>
      </button>
    </div>
  )
}

/** Picks a tool from its key (V, R, S, F, W, L, I, P) — not while typing. */
export function railKey(e: KeyboardEvent, playerOnly = false): RailTool | null {
  const el = e.target as HTMLElement
  if (e.ctrlKey || e.metaKey || e.altKey || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return null
  const r = RAIL.find((x) => x.key.toLowerCase() === e.key.toLowerCase())
  return r && (!playerOnly || !r.dmOnly) ? r.tool : null
}

function Svg({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export function ToolIcon({ tool }: { tool: RailTool }): JSX.Element {
  switch (tool) {
    case 'move':
      return (
        <Svg>
          <path d="M3.5 2.5l9 4.2-3.9 1.2-1.4 3.9z" />
        </Svg>
      )
    case 'ruler':
      return (
        <Svg>
          <rect x="1.5" y="5.5" width="13" height="5" rx="1" />
          <path d="M4 5.5v2M6.5 5.5v2.8M9 5.5v2M11.5 5.5v2.8" />
        </Svg>
      )
    case 'shapes':
      return (
        <Svg>
          <path d="M2 13L7 3l5 10z" />
          <circle cx="11.5" cy="5" r="2.5" />
        </Svg>
      )
    case 'walls':
      return (
        <Svg>
          <rect x="1.5" y="3" width="13" height="10" rx="0.5" />
          <path d="M1.5 6.3h13M1.5 9.7h13M5.5 3v3.3M10.5 3v3.3M8 6.3v3.4M5.5 9.7V13M10.5 9.7V13" />
        </Svg>
      )
    case 'light':
      // A light bulb.
      return (
        <Svg>
          <path d="M5.8 10.6C4.6 9.8 3.8 8.5 3.8 7a4.2 4.2 0 0 1 8.4 0c0 1.5-.8 2.8-2 3.6v1.4H5.8z" />
          <path d="M6.2 14h3.6M7 8.2l1 1 1-1M8 9.2V12" />
        </Svg>
      )
    case 'props':
      // A barrel: the sort of thing you decorate a map with.
      return (
        <Svg>
          <path d="M4.8 2h6.4c.9 1.6 1.3 3.6 1.3 6s-.4 4.4-1.3 6H4.8C3.9 12.4 3.5 10.4 3.5 8s.4-4.4 1.3-6z" />
          <path d="M3.8 5.2h8.4M3.8 10.8h8.4" />
        </Svg>
      )
    case 'images':
      return (
        <Svg>
          <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
          <circle cx="5.5" cy="6" r="1.3" />
          <path d="M1.5 12l4-4 3 3 2-2 4 4" />
        </Svg>
      )
  }
}

function Chip({ on, title, onClick, children }: { on: boolean; title?: string; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={on} style={chip(on)}>
      {children}
    </button>
  )
}

function Divider(): JSX.Element {
  return <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)', margin: '4px 4px' }} />
}

const railButton = (on: boolean): React.CSSProperties => ({
  width: 36,
  height: 34,
  display: 'grid',
  placeItems: 'center',
  border: 0,
  borderRadius: 8,
  background: on ? 'var(--accent-subtle)' : 'none',
  color: on ? 'var(--accent-hover)' : 'var(--text-secondary)',
  cursor: 'pointer'
})

const chip = (on: boolean): React.CSSProperties => ({
  whiteSpace: 'nowrap',
  border: 0,
  background: on ? 'var(--accent-subtle)' : 'none',
  color: on ? 'var(--accent-hover)' : 'var(--text-secondary)',
  padding: '5px 10px',
  borderRadius: 7,
  cursor: 'pointer',
  fontSize: 12,
  font: 'inherit'
})
