// The battle map's controls, laid out the way map tools usually are: the
// tools down the left side (each with a key), the chosen tool's own options
// along the top, and undo, redo, snapping and map settings in the top-right.
import type { ReactNode } from 'react'
import type { TemplateKind } from '@shared/battleMap'
import type { FogDraw, FogTool, MapTool, WallDraw } from './BattleMapView'

export type RailTool = 'move' | 'ruler' | 'shapes' | 'fog' | 'walls' | 'light' | 'images'

export const isShape = (t: MapTool): t is TemplateKind => t === 'cone' || t === 'sphere' || t === 'line' || t === 'cube'
export const railOf = (t: MapTool): RailTool => (isShape(t) ? 'shapes' : t)

export const RAIL: Array<{ tool: RailTool; label: string; key: string; hint: string; dmOnly?: boolean }> = [
  { tool: 'move', label: 'Move', key: 'V', hint: 'Drag a token to move it (walls stop it; hold Alt to drag through), or drag the map to pan. Click a door to open or close it.' },
  { tool: 'ruler', label: 'Measure', key: 'R', hint: 'Drag between squares to measure. Diagonals count as one square.' },
  { tool: 'shapes', label: 'Spell areas', key: 'S', hint: 'Pick a shape above, then drag from where it starts: the distance sets its size.', dmOnly: true },
  { tool: 'fog', label: 'Fog', key: 'F', hint: 'Draw fog to hide parts of the map from players; Cut clears it.', dmOnly: true },
  { tool: 'walls', label: 'Walls & doors', key: 'W', hint: 'Draw rooms and walls, then set doors into them. Walls and closed doors stop tokens and sight.', dmOnly: true },
  { tool: 'light', label: 'Lights', key: 'L', hint: 'Click to place a light; click one to change how far it reaches. The map’s lighting is in Map settings.', dmOnly: true },
  { tool: 'images', label: 'Map images', key: 'I', hint: 'Add map images, then drag them into place and size them to line up with the grid.', dmOnly: true }
]

const SHAPES: Array<{ kind: TemplateKind; label: string; hint: string }> = [
  { kind: 'cone', label: 'Cone', hint: 'Drag from the caster: the distance sets its length, the direction where it points.' },
  { kind: 'sphere', label: 'Sphere', hint: 'Drag from where the spell lands: the distance sets its radius.' },
  { kind: 'line', label: 'Line', hint: 'Drag from the caster along the line (5 ft wide): the distance sets its length.' },
  { kind: 'cube', label: 'Cube', hint: 'Drag from one corner: the distance sets its side.' }
]

const FOG_DRAWS: Array<{ draw: FogDraw; label: string; hint: string }> = [
  { draw: 'rect', label: 'Square', hint: 'Drag from one corner to the other.' },
  { draw: 'circle', label: 'Circle', hint: 'Drag from the centre outwards.' },
  { draw: 'points', label: 'Points', hint: 'Click point by point; click the first point, double-click or press Enter to finish. Escape cancels.' },
  { draw: 'brush', label: 'Brush', hint: 'Paint freely.' },
  { draw: 'line', label: 'Line', hint: 'Drag a straight line.' },
  { draw: 'move', label: 'Pick', hint: 'Click fog (or a cut) to pick it, then drag it. Delete removes it; its options can lock it.' }
]

const WALL_DRAWS: Array<{ draw: WallDraw; label: string; hint: string }> = [
  { draw: 'room', label: 'Room', hint: 'Drag from one corner of a room to the other: four walls, joined. Corners snap to other walls and to the grid.' },
  { draw: 'wall', label: 'Wall', hint: 'Click corner to corner; click the first corner again to close the shape. Corners snap to other walls’ ends, onto walls, and to the grid.' },
  { draw: 'door', label: 'Door', hint: 'Click a wall to set a one-square door into it, or drag along a wall for a wider one — that stretch of wall is cut out. Click a door with Move to open it.' },
  { draw: 'window', label: 'Window', hint: 'Click a wall to set a window into it, or drag along it for a wider one. Windows are glass: sight and light pass; closed, they stop tokens.' },
  { draw: 'select', label: 'Pick', hint: 'Click a wall, door or window to pick it: change it, drag its ends, or Delete it.' }
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
  fogTool,
  onFogTool,
  wallDraw,
  onWallDraw,
  onAddImages,
  onHint
}: {
  tool: MapTool
  onShape: (k: TemplateKind) => void
  fogTool: FogTool
  onFogTool: (f: FogTool) => void
  wallDraw: WallDraw
  onWallDraw: (w: WallDraw) => void
  onAddImages: (files: File[]) => void
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
  else if (rail === 'fog')
    body = (
      <>
        <Segmented options={[['add', 'Add'], ['cut', 'Cut']]} value={fogTool.op} onChange={(op) => onFogTool({ ...fogTool, op: op as FogTool['op'] })} />
        <Divider />
        {FOG_DRAWS.map((d) => (
          <Chip
            key={d.draw}
            on={fogTool.draw === d.draw}
            title={d.hint}
            onClick={() => {
              onFogTool({ ...fogTool, draw: d.draw })
              onHint(d.hint)
            }}
          >
            {d.label}
          </Chip>
        ))}
        {(fogTool.draw === 'brush' || fogTool.draw === 'line') && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 4 }} title="How wide, in squares">
            Width
            <input type="range" min={0.25} max={6} step={0.25} value={fogTool.width} onChange={(e) => onFogTool({ ...fogTool, width: Number(e.target.value) })} style={{ width: 80 }} />
            <span style={{ minWidth: 26 }}>{fogTool.width}</span>
          </label>
        )}
      </>
    )
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
  if (!body) return null
  return (
    <div style={{ position: 'absolute', top: 12, left: 64, right: 190, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
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
    <div style={{ position: 'absolute', right: 12, top: 12, zIndex: 5, display: 'flex', gap: 2, padding: 4, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}>
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
      <button type="button" onClick={onSnap} title={snap ? 'Snapping to the grid — click to place freely' : 'Placing freely — click to snap to the grid'} aria-label="Snap to grid" aria-pressed={snap} style={railButton(snap)}>
        <Svg>
          <path d="M4 2v6a4 4 0 0 0 8 0V2" />
          <path d="M4 5h3M9 5h3" />
        </Svg>
      </button>
      <button type="button" onClick={onSettings} title="Map settings: lighting, sight, fog" aria-label="Map settings" aria-pressed={settingsOpen} style={railButton(settingsOpen)}>
        <Svg>
          <circle cx="8" cy="8" r="2.2" />
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
        </Svg>
      </button>
    </div>
  )
}

/** Picks a tool from its key (V, R, S, F, W, L, I) — not while typing. */
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
    case 'fog':
      return (
        <Svg>
          <path d="M4.5 12.5h7.2a2.8 2.8 0 0 0 .3-5.6A3.8 3.8 0 0 0 4.7 6a3.3 3.3 0 0 0-.2 6.5z" />
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
      return (
        <Svg>
          <circle cx="8" cy="8" r="2.8" />
          <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
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

function Segmented({ options, value, onChange }: { options: Array<[string, string]>; value: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <div style={{ display: 'inline-flex', padding: 2, borderRadius: 8, background: 'var(--bg-sunken)' }}>
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v} style={{ ...chip(value === v), padding: '3px 10px' }}>
          {label}
        </button>
      ))}
    </div>
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
