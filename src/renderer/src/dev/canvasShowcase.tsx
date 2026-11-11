// Dev-only: the canvas and its newer pieces with sample content, for screenshots in the "What's new" post.
// Open http://localhost:5180/sheet-preview.html?showcase=overview (or =statblock, =sessions, =whatsnew, =editor, =encounters, =cues, =hidden). Not part of the app build.
import { useRef, useState } from 'react'
import { Canvas } from '../features/canvas/Canvas'
import { TOOL_ICONS } from '../features/canvas/toolIcons'
import { TimerDockButton, TimerMini, TimerPanel, setSessionTimer } from '../features/canvas/SessionTimer'
import { StickyNote } from '../features/canvas/StickyNote'
import { DiceButton } from '../features/dice/DiceButton'
import { StatblockCard } from '../features/campaigns/StatblockCard'
import { MonsterEditor } from '../features/bestiary/MonsterEditor'
import { EncounterLibrary } from '../features/combat/EncounterLibrary'
import { SessionPresenter, SessionsList, type SessionDecksApi } from '../features/campaigns/SessionTimeline'
import { SceneCues } from '../features/campaigns/SceneCues'
import { BrowserPanel } from '../features/browser/BrowserPanel'
import { setBrowserAccount } from '../features/browser/browserAccount'
import { GoblinLoader } from '../ui/GoblinLoader'
import { CanvasZoomContext } from '../features/canvas/canvasZoom'
import type { SessionScene } from '@shared/sessionDeck'
import { MarkdownLiveEditor } from '../features/campaigns/MarkdownLiveEditor'
import { renderNoteMarkdown } from '../markdown'
import { loadSavedEncounters } from '../data/savedEncounters'
import type { Note } from '@shared/ipc'
import { readingOrder } from '@shared/canvasLayout'
import { FileIcon, PawIcon, StickyIcon } from '../features/campaigns/icons'
import { BESTIARY } from '../data/bestiary'
import { startTimer } from '@shared/sessionTimer'
import type { CanvasLayout } from '@shared/canvasLayout'
import type { CanvasItem } from '../features/canvas/toolItems'
import type { CanvasNav } from '../features/canvas/useCanvasLayout'
import { WhatsNewView } from '../features/shell/WhatsNew'
import '../features/canvas/canvas.css'
import { MusicPanel } from '../features/audio/MusicPanel'
import { MusicMini, PartyMini, SessionsMini, SoundBoardMini } from '../features/canvas/toolMinis'
import { TOOL_META, TOOL_MINI } from '@shared/canvasTools'
import { QuickSearch, noteTarget, useQuickSearchKey } from '../features/canvas/QuickSearch'
import { NoteEditor } from '../features/campaigns/NoteEditor'
import { ShowToPlayersButton } from '../features/campaigns/ShowToPlayersButton'
import { HostButton } from '../features/campaigns/HostButton'
import { QuestLog } from '../features/campaigns/QuestLog'
import { QuestRewardNotice } from '../features/player/QuestRewardNotice'
import { QuestAnnouncer } from '../features/player/QuestAnnouncer'
import { DmInitiativeTool } from '../features/campaigns/DmInitiativeTool'
import { HandoutViewer } from '../features/player/HandoutViewer'
import { stripDmAsides } from '@shared/sessionDeck'
import { SoundBoardPanel } from '../features/audio/SoundBoardPanel'
import '../styles/animations.css'

const goblin = BESTIARY.find((m) => m.index === 'goblin') ?? BESTIARY[0]
const ogre = BESTIARY.find((m) => m.index === 'ogre') ?? BESTIARY[0]

const NOTE_HTML = `<h2>The Sunken Crypt</h2><p>Beneath the old chapel, water has crept into the burial halls. The party hears chanting long before they see the candles.</p><ul><li>Three goblin scavengers guard the stair</li><li>The ogre <strong>Brakka</strong> sleeps in the ossuary</li><li>A <em>silver key</em> hangs from the priest's statue</li></ul>`

function noteBox(id: string, title: string, html: string): CanvasItem {
  return {
    id: `note:${id}`,
    title,
    icon: <FileIcon />,
    size: { w: 420, h: 360 },
    content: <div className="gb-markdown" style={{ padding: 'var(--space-4)', overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: html }} />
  }
}

const OVERVIEW: CanvasLayout = {
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    { id: 'note:crypt', x: 32, y: 32, w: 400, h: 336, z: 1 },
    { id: 'monster:goblin', x: 448, y: 32, w: 400, h: 560, z: 3 },
    { id: 'sticky:a', x: 32, y: 384, w: 224, h: 176, z: 4 },
    { id: 'sticky:b', x: 272, y: 400, w: 160, h: 144, z: 5 },
    { id: 'timer', x: 864, y: 32, w: 320, h: 208, z: 2 },
    { id: 'collection:act1', x: 896, y: 288, w: 96, h: 96, z: 6 },
    { id: 'collection:act2', x: 1024, y: 288, w: 96, h: 96, z: 7 }
  ],
  collections: {
    act1: { name: 'Act One: The Chapel', layout: { viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] } },
    act2: { name: 'Act Two: Below', layout: { viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] } }
  }
}

const nav: CanvasNav = { path: [], names: [], placed: new Set(), root: OVERVIEW, enterPath: () => {}, update: () => {}, enter: () => {}, exitTo: () => {}, rename: () => {}, moveOut: () => {} }

function Overview(): JSX.Element {
  const [layout, setLayout] = useState(OVERVIEW)
  const items: CanvasItem[] = [
    noteBox('crypt', 'The Sunken Crypt', NOTE_HTML),
    { id: 'monster:goblin', title: goblin.name, icon: <PawIcon />, size: { w: 400, h: 560 }, content: <StatblockCard monster={goblin} /> },
    {
      id: 'sticky:a',
      title: 'Ask about the key',
      icon: <StickyIcon />,
      size: { w: 224, h: 176 },
      className: 'gb-canvas-node--sticky gb-sticky--yellow',
      content: <StickyNote mode="dm" sticky={{ kind: 'sticky', id: 'a', color: 'yellow', text: 'Ask about the key\nMira owes the priest a favour — use it if they stall.' }} />
    },
    {
      id: 'sticky:b',
      title: 'Break at 9',
      icon: <StickyIcon />,
      size: { w: 160, h: 144 },
      className: 'gb-canvas-node--sticky gb-sticky--mint',
      content: <StickyNote mode="dm" sticky={{ kind: 'sticky', id: 'b', color: 'mint', text: 'Break at 9\nPizza 🍕' }} />
    },
    { id: 'timer', title: 'Session Timer', icon: TOOL_ICONS.timer, size: { w: 320, h: 208 }, content: <TimerPanel /> }
  ]
  return (
    <div style={{ height: '100vh', display: 'flex' }}>
      <Canvas
        mode="dm"
        layout={layout}
        setLayout={setLayout}
        items={items}
        toolIcons={TOOL_ICONS}
        hiddenTools={['codex', 'timer']}
        nav={nav}
        contextMenu={() => ({
          add: [
            { label: 'Party note', icon: <FileIcon />, onSelect: () => {} },
            { label: 'DM-only note', icon: <FileIcon />, onSelect: () => {} },
            { label: 'Monster statblock…', icon: <PawIcon />, onSelect: () => {} }
          ],
          open: [{ label: 'Open Elowen’s sheet', icon: <StickyIcon />, onSelect: () => {} }]
        })}
        dock={<TimerDockButton onOpen={() => {}} onClose={() => {}} />}
        floating={<DiceButton sessionId={null} />}
        corner={
          <>
            <button type="button" className="gb-btn gb-btn--secondary" style={{ flex: 1 }}>
              The Gloomwood Saga
            </button>
          </>
        }
      />
    </div>
  )
}

function StatblockShot(): JSX.Element {
  return (
    <div style={{ height: '100vh', overflowY: 'auto', padding: 'var(--space-5)', background: 'var(--bg-canvas)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <StatblockCard monster={ogre} />
      </div>
    </div>
  )
}

const SCENES = ['Rumours at the Gilded Goose', 'The road to the chapel', 'Goblins on the stair', 'The ossuary', 'Brakka wakes', 'The silver key']
const fakeDecks: SessionDecksApi = {
  decks: [
    {
      id: 'deck',
      campaignId: 'camp',
      title: 'Session 12: Below the Chapel',
      createdAt: '',
      updatedAt: '',
      scenes: SCENES.map((_, i) => ({ noteId: `s${i}`, encounterIds: i === 2 ? ['enc'] : [], music: i === 0 ? [{ moodId: 'tavernRespite', trackId: null }] : i === 3 ? [{ moodId: 'dungeonDread', trackId: null }] : i === 4 ? [{ moodId: 'combatBoss', trackId: null }] : [] }))
    }
  ],
  loading: false,
  live: { deckId: 'deck', sceneIndex: 2 },
  createDeck: async () => undefined,
  renameDeck: async () => {},
  reorderScenes: async () => {},
  removeDeck: async () => {},
  addScene: async () => undefined,
  removeScene: async () => {},
  present: () => {},
  setLiveSceneIndex: () => {},
  stopPresenting: () => {}
}

const SCENE_TEXT = [
  'The innkeeper lowers her voice: the chapel bell rang at midnight, and nobody has rung it in forty years.',
  'Mud, crows, and a cart with one wheel. :: If they search it, the priest’s satchel is gone.',
  'Three goblins crouch on the broken stair, picking through a priest’s satchel. One wears the silver key on a string.',
  'Bones stacked to the ceiling. Something breathes behind them.'
]
const SESSION_LAYOUT: CanvasLayout = {
  viewport: { x: 24, y: 64, zoom: 0.8 },
  nodes: [
    { id: 'note:s0', x: 16, y: 32, w: 400, h: 240, z: 1 },
    { id: 'note:s1', x: 512, y: 16, w: 400, h: 240, z: 2 },
    { id: 'note:s2', x: 1008, y: 48, w: 400, h: 240, z: 3 },
    { id: 'note:s3', x: 512, y: 400, w: 400, h: 240, z: 4 },
    { id: 'sessions', x: 1008, y: 384, w: 400, h: 320, z: 5 }
  ]
}

function SessionsShot(): JSX.Element {
  const [layout, setLayout] = useState(SESSION_LAYOUT)
  const sceneIds = SCENE_TEXT.map((_, i) => `note:s${i}`)
  const items: CanvasItem[] = [
    ...SCENE_TEXT.map((text, i) => ({
      ...noteBox(`s${i}`, SCENES[i], `<h2>${SCENES[i]}</h2><p>${text}</p>`),
      className: i === 2 ? 'gb-canvas-node--live' : undefined,
      noClose: true
    })),
    { id: 'sessions', title: 'Sessions', icon: TOOL_ICONS.sessions, size: { w: 400, h: 320 }, content: <SessionsList api={fakeDecks} onOpen={() => {}} onNew={() => {}} onDelete={() => {}} onRename={() => {}} shelved={() => false} onUnshelve={() => {}} /> }
  ]
  const sessionNav: CanvasNav = { ...nav, path: ['deck'], names: [{ id: 'deck', name: 'Session 12: Below the Chapel', sessionDeckId: 'deck' }] }
  return (
    <div style={{ height: '100vh', display: 'flex' }}>
      <Canvas
        mode="dm"
        layout={layout}
        setLayout={setLayout}
        items={items}
        toolIcons={TOOL_ICONS}
        hiddenTools={['codex', 'timer']}
        nav={sessionNav}
        sequence={readingOrder(layout.nodes.filter((n) => sceneIds.includes(n.id)))}
        crumbExtra={
          <button type="button" className="gb-btn gb-btn--secondary gb-session-crumb-action" style={{ fontSize: 12 }}>
            Stop presenting
          </button>
        }
        floating={<DiceButton sessionId={null} />}
      />
    </div>
  )
}

/** ?showcase=audio: the music and sound board boxes on the canvas, the note box in front of them. */
const AUDIO: CanvasLayout = {
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    { id: 'music', x: 32, y: 32, w: 352, h: 480, z: 1 },
    { id: 'soundboard', x: 400, y: 32, w: 320, h: 400, z: 2 },
    { id: 'note:crypt', x: 736, y: 32, w: 400, h: 336, z: 3 },
    { id: 'timer', x: 736, y: 400, w: 320, h: 208, z: 4 },
    { id: 'players', x: 32, y: 560, w: 320, h: 480, z: 5 },
    { id: 'sessions', x: 400, y: 560, w: 880, h: 640, z: 6 }
  ]
}

const AUDIO_DECKS = {
  decks: [{ id: 'd', campaignId: 'c', title: 'Session 4', createdAt: '', updatedAt: '', scenes: [{ noteId: 'n1' }, { noteId: 'n2' }, { noteId: 'n3' }] }],
  live: { deckId: 'd', sceneIndex: 1 },
  setLiveSceneIndex: (i: number) => console.log('scene', i)
} as unknown as SessionDecksApi

function AudioShot(): JSX.Element {
  const [hosted, setHosted] = useState<string | null>(null)
  const [layout, setLayout] = useState(AUDIO)
  const items: CanvasItem[] = [
    { id: 'music', title: 'Music', icon: TOOL_ICONS.music, size: { w: 352, h: 480 }, content: <MusicPanel sessionId={null} />, mini: <MusicMini sessionId={null} />, miniSize: TOOL_MINI.music },
    { id: 'soundboard', title: 'Sound Board', icon: TOOL_ICONS.soundboard, size: { w: 320, h: 400 }, content: <SoundBoardPanel sessionId={null} />, mini: <SoundBoardMini sessionId={null} />, miniSize: TOOL_MINI.soundboard },
    { id: 'timer', title: 'Session Timer', icon: TOOL_ICONS.timer, size: { w: 320, h: 208 }, content: <TimerPanel />, mini: <TimerMini />, miniSize: TOOL_MINI.timer },
    { id: 'players', title: 'Players', icon: TOOL_ICONS.players, size: { w: 320, h: 480 }, content: <div />, mini: <PartyMini sessionId={null} campaignId={null} />, miniSize: TOOL_MINI.players },
    {
      id: 'sessions',
      title: 'Sessions',
      icon: TOOL_ICONS.sessions,
      size: { w: 880, h: 640 },
      content: <div />,
      mini: <SessionsMini api={AUDIO_DECKS} notes={[{ id: 'n2', title: 'The Leaky Lantern' } as never]} />,
      miniSize: TOOL_MINI.sessions
    },
    noteBox('crypt', 'The Sunken Crypt', NOTE_HTML)
  ]
  return (
    <div style={{ height: '100vh', display: 'flex' }}>
      <Canvas mode="dm" layout={layout} setLayout={setLayout} items={items} toolIcons={TOOL_ICONS} hiddenTools={['codex', 'timer']} nav={{ ...nav, root: AUDIO }} contextMenu={() => ({ add: [] })}title="The Sunken Crypt" titleExtra={<HostButton hostedSessionId={hosted} onHostedSessionChange={(id) => setHosted(id === null ? null : (id ?? 'demo'))} />} />
    </div>
  )
}

/** ?showcase=encounters: the Encounter Library with a few saved encounters (written to this preview's storage once). */
function EncountersShot(): JSX.Element {
  if (!localStorage.getItem('gb-saved-encounters')) {
    localStorage.setItem(
      'gb-saved-encounters',
      JSON.stringify([
        { id: 'e1', name: 'Goblins on the stair', monsterIndexes: ['goblin', 'goblin', 'goblin'], tags: ['chapel'], createdAt: '', placements: { 'goblin#1': { x: 10, y: 4, size: 1 } } },
        { id: 'e2', name: 'Brakka wakes', monsterIndexes: ['ogre', 'goblin', 'goblin'], tags: ['chapel', 'boss'], createdAt: '' },
        { id: 'e3', name: 'Wolves on the road', monsterIndexes: ['wolf', 'wolf', 'wolf', 'wolf'], tags: ['forest'], createdAt: '' }
      ])
    )
  }
  return (
    <div style={{ height: '100vh', width: 380, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)' }}>
      <EncounterLibrary playerCharacters={new Map()} />
    </div>
  )
}

// A scene with two encounters and two songs, while it's being presented: its cues in the box, and on the bar above.
const CUE_SCENE = { noteId: 's2', encounterIds: ['e1', 'e2'], music: [{ moodId: 'dungeonDread', trackId: null }, { moodId: 'combatBoss', trackId: null }] }
/** The scene's cues, its switches working (on this page only). */
function CueEditor(): JSX.Element {
  const [scene, setScene] = useState<SessionScene>(CUE_SCENE)
  return <SceneCues scene={scene} encounters={loadSavedEncounters()} onChange={(patch) => setScene((s) => ({ ...s, ...patch }))} />
}

function CuesShot(): JSX.Element {
  const [layout, setLayout] = useState<CanvasLayout>({ viewport: { x: 0, y: 0, zoom: 1 }, nodes: [{ id: 'note:s2', x: 320, y: 96, w: 640, h: 600, z: 1 }] })
  const api: SessionDecksApi = { ...fakeDecks, decks: [{ ...fakeDecks.decks[0], scenes: fakeDecks.decks[0].scenes.map((sc, i) => (i === 2 ? CUE_SCENE : sc)) }] }
  const notes = SCENES.map((title, i) => ({ id: `s${i}`, title }) as unknown as Note)
  const items: CanvasItem[] = [
    {
      id: 'note:s2',
      title: SCENES[2],
      icon: <FileIcon />,
      size: { w: 640, h: 600 },
      className: 'gb-canvas-node--live',
      noClose: true,
      content: (
        <div style={{ padding: 'var(--space-4)', overflowY: 'auto' }}>
          <CueEditor />
          <div className="gb-markdown">
            <h2>{SCENES[2]}</h2>
            <p>{SCENE_TEXT[2]}</p>
            <p>If they parley, the goblins point down the stair: Brakka is waking, and they want no part of it.</p>
          </div>
        </div>
      )
    }
  ]
  return (
    <div style={{ height: '100vh', display: 'flex', position: 'relative' }}>
      <SessionPresenter api={api} notes={notes} hostedSessionId={null} onStep={() => {}} onLoadEncounter={() => {}} />
      <Canvas mode="dm" layout={layout} setLayout={setLayout} items={items} toolIcons={TOOL_ICONS} hiddenTools={['codex', 'timer']} nav={nav} floating={<DiceButton sessionId={null} />} />
    </div>
  )
}

// A note with a hidden (::) block: as you write it, and as it reads.
const HIDDEN_NOTE = ['The party reaches the chapel door at dusk.', '', '::', 'The door is trapped: DC 14 Perception to spot the wire.', 'Brother Aldric is the cultist.', '::', '', 'Inside, candles are still burning.', '', ':: @u1', 'Ann knows the side door is unlocked.', '::'].join('\n')
const SHOW_PLAYERS = [
  { userId: 'u1', displayName: 'Ann' },
  { userId: 'u2', displayName: 'Bram' }
]
function HiddenShot(): JSX.Element {
  const titles = { current: new Set<string>() }
  const notes = { current: [] as Note[] }
  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: 24, background: 'var(--bg-surface)' }}>
      <MarkdownLiveEditor defaultValue={HIDDEN_NOTE} campaignId="camp" knownTitlesRef={titles} notesRef={notes} onChange={() => {}} onWikilinkClick={() => {}} players={SHOW_PLAYERS} />
      <div className="gb-markdown" dangerouslySetInnerHTML={{ __html: renderNoteMarkdown(HIDDEN_NOTE, new Set(), 'camp', new Map(SHOW_PLAYERS.map((p) => [p.userId, p.displayName]))) }} />
    </div>
  )
}

/** ?showcase=table: a note's table in the editor — wide, in a narrow box, editable in place. */
const TABLE_NOTE = ['The party’s haul from the crypt:', '', '| Item | Value | Who has it | Notes |', '| --- | ---: | --- | --- |', '| Silver key | 25 gp | Ann | Opens the priest’s statue |', '| Potion of healing | 50 gp | Bram | 2d4 + 2 |', '| Map of the catacombs | — | Ann | Half of it is water-damaged |', '', 'Then the ogre woke up.', '', '| d6 | On the road |', '| --- | --- |', '| 1-2 | A merchant with a broken wheel |', '| 3-4 | Wolves, watching from the treeline |', '| 5 | A toll bridge, and a troll |', '| 6 | Nothing — an eerie quiet |'].join('\n')
function TableShot(): JSX.Element {
  const titles = { current: new Set<string>() }
  const notes = { current: [] as Note[] }
  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, padding: 24, background: 'var(--bg-surface)' }}>
      <div style={{ border: '1px solid var(--border-subtle)', padding: 12, overflow: 'hidden' }}>
        <MarkdownLiveEditor defaultValue={TABLE_NOTE} campaignId="camp" knownTitlesRef={titles} notesRef={notes} onChange={(v) => console.log('note now', JSON.stringify(v))} onWikilinkClick={() => {}} />
      </div>
      <div style={{ border: '1px solid var(--border-subtle)', padding: 12 }}>
        <MarkdownLiveEditor defaultValue={TABLE_NOTE} campaignId="camp" knownTitlesRef={titles} notesRef={notes} onChange={() => {}} onWikilinkClick={() => {}} />
      </div>
    </div>
  )
}

/** ?showcase=search: the Ctrl+K search over a few notes and tools (Ctrl+K toggles it, picking logs what was chosen). */
function SearchShot(): JSX.Element {
  const [open, setOpen] = useState(true)
  const root = useRef<HTMLDivElement>(null)
  useQuickSearchKey(root, setOpen)
  const pick = (what: string) => () => console.log('search picked', what)
  const notes = [
    { id: 'a', title: 'The Sunken Crypt', visibility: 'shared', sceneDeckId: null },
    { id: 'b', title: 'Brakka the ogre', visibility: 'dm', sceneDeckId: null },
    { id: 'c', title: 'Arrival at Saltmarsh', visibility: 'shared', sceneDeckId: 'deck' },
    { id: 'd', title: 'My secret plans', visibility: 'private', sceneDeckId: null }
  ].map((n) => noteTarget(n, pick(n.title)))
  const tools = (['notes', 'initiative', 'calendar', 'music'] as const).map((k) => ({ id: k, name: TOOL_META[k].title, hint: 'Tool', icon: TOOL_ICONS[k], onSelect: pick(k) }))
  return (
    <div ref={root} style={{ height: '100vh' }}>
      <QuickSearch open={open} onClose={() => setOpen(false)} notes={notes} tools={tools} onOpenMonster={(m) => console.log('search picked', m.name)} />
    </div>
  )
}

/** ?showcase=backlinks: a note with two others linking to it — "Mentioned in" under its body (clicks log). */
function BacklinksShot(): JSX.Element {
  const mk = (id: string, title: string, bodyMarkdown: string): Note => ({ id, campaignId: 'camp', authorUserId: 'u', authorDisplayName: 'Kian', title, bodyMarkdown, visibility: 'shared', folderId: null, editorUserIds: [], pinned: false, sceneDeckId: null }) as unknown as Note
  const crypt = mk('1', 'The Sunken Crypt', 'Beneath the old chapel, water has crept into the burial halls.')
  const notes = [crypt, mk('2', 'Brakka the ogre', 'Sleeps in the ossuary of [[The Sunken Crypt]].'), mk('3', 'Session 3 recap', 'The party finally found [the sunken crypt|the crypt].'), mk('4', 'Saltmarsh', 'No links here.')]
  return (
    <div style={{ height: '100vh', width: 520, display: 'flex', flexDirection: 'column', padding: 24, background: 'var(--bg-surface)', position: 'relative' }}>
      <NoteEditor note={crypt} notes={notes} sessionId={null} onSave={() => {}} onNavigateToNote={() => {}} onOpenInNewTab={(id) => console.log('backlink opened', id)} onCreateAndLinkNote={() => {}} />
    </div>
  )
}

const HANDOUT_TABLE = [
  { userId: 'u1', displayName: 'Gelden', characterName: 'Gelden Nightforged' },
  { userId: 'u2', displayName: 'Ann', characterName: 'Brakka' },
  { userId: 'u3', displayName: 'Bram', characterName: null }
]

/**
 * ?showcase=browser: the Browser box as on the canvas — ?zl= its laid-out zoom (CSS zoom), ?s= a scale on top,
 * ?who= who's signed in (an account id); the button stands in for a canvas zoom under way. Pages only show in Electron.
 */
function BrowserShot(): JSX.Element {
  const q = new URLSearchParams(location.search)
  const zl = Number(q.get('zl') ?? 1)
  const [zooming, setZooming] = useState(false)
  // A new box, as pinning or unpinning gives it.
  const [mount, setMount] = useState(0)
  useState(() => setBrowserAccount(q.get('who')))
  return (
    <div style={{ height: '100vh', padding: 24, background: 'var(--bg-surface)' }}>
      <button id="toggle-zooming" type="button" onClick={() => setZooming((z) => !z)} style={{ marginBottom: 8 }}>
        {zooming ? 'Zooming' : 'Still'}
      </button>
      <button id="remount" type="button" onClick={() => setMount((m) => m + 1)} style={{ margin: '0 0 8px 8px' }}>
        Pin / unpin
      </button>
      <div style={{ transform: `scale(${q.get('s') ?? 1})`, transformOrigin: '0 0' }}>
        <div style={{ zoom: zl }}>
          <CanvasZoomContext.Provider value={{ zoom: zl, zooming }}>
            <div className="gb-card" style={{ width: 640, height: 480, padding: 0, overflow: 'hidden' }}>
              <BrowserPanel key={mount} />
            </div>
          </CanvasZoomContext.Provider>
        </div>
      </div>
    </div>
  )
}

/** ?showcase=handout: the DM's "Show to players" buttons and the player's viewer on one page (the stub loops it back). */
function HandoutShot(): JSX.Element {
  const picture = 'data:image/svg+xml;utf8,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'><rect width='600' height='400' fill='#d9c7a1'/><path d='M40 340 L200 120 L320 260 L420 160 L560 340Z' fill='#6b4f2a'/><circle cx='470' cy='90' r='40' fill='#f3e3b5'/></svg>")
  return (
    <div style={{ height: '100vh', padding: 24, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--bg-surface)' }}>
      <span>Note:</span>
      <ShowToPlayersButton players={HANDOUT_TABLE} build={async () => ({ id: crypto.randomUUID(), title: 'A letter, sealed in wax', kind: 'note', markdown: stripDmAsides(['My dear Aldric,', '', 'The [[Sunken Crypt]] is ours by midnight.', '', '::', 'The letter is a forgery.', '::', '', '— *M*'].join('\n')) })} />
      <span>Image:</span>
      <ShowToPlayersButton build={async () => ({ id: crypto.randomUUID(), title: 'The pass at dusk', kind: 'image', src: picture })} />
      <HandoutViewer knownTitles={new Set(['sunken crypt'])} />
    </div>
  )
}

/** ?showcase=quests: the Quests box as the DM sees it (left) and a player (right), on an in-memory log. */
function QuestsShot(): JSX.Element {
  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: '340px 480px', gap: 24, padding: 24, background: 'var(--bg-surface)' }}>
      <div className="gb-card" style={{ padding: 0, height: 560 }}>
        <QuestLog sessionId={null} campaignId="camp" readOnly={false} onOpenNote={(t) => console.log('quest note', t)} />
      </div>
      <div className="gb-card" style={{ padding: 0, height: 560, position: 'relative' }}>
        <QuestLog sessionId="s" campaignId="camp" readOnly onOpenNote={(t) => console.log('quest note', t)} />
        <QuestAnnouncer sessionId="s" campaignId="camp" onOpenQuests={() => console.log('open quests')} />
        <QuestRewardNotice character={{ name: 'Gelden', experiencePoints: 900, currency: { cp: 0, sp: 0, ep: 0, gp: 12, pp: 0 } } as never} onApply={(c, r) => console.log('reward applied', c.name, JSON.stringify(r.coins), r.xp)} />
      </div>
    </div>
  )
}

/** ?showcase=initiative: the DM's Initiative box, its Encounters tab included. */
function InitiativeShot(): JSX.Element {
  return (
    <div className="gb-card" style={{ width: 420, height: '90vh', margin: 24, padding: 0, display: 'flex', flexDirection: 'column' }}>
      <DmInitiativeTool sessionId={null} campaignId="camp" combatCharacters={new Map()} onOpenMonster={() => {}} />
    </div>
  )
}

export function CanvasShowcase({ scene }: { scene: string }): JSX.Element {
  if (scene === 'search') return <SearchShot />
  if (scene === 'table') return <TableShot />
  if (scene === 'browser') return <BrowserShot />
  if (scene === 'loader')
    return (
      <div style={{ height: '100vh', display: 'flex', gap: 32, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)' }}>
        <GoblinLoader size="sm" fill={false} />
        <GoblinLoader size="md" fill={false} label="Opening the calendar" />
        <GoblinLoader size="lg" fill={false} label="Opening the Workshop" />
      </div>
    )
  if (scene === 'backlinks') return <BacklinksShot />
  if (scene === 'handout') return <HandoutShot />
  if (scene === 'quests') return <QuestsShot />
  if (scene === 'initiative') return <InitiativeShot />
  if (scene === 'audio') return <AudioShot />
  if (scene === 'cues') return <CuesShot />
  if (scene === 'hidden') return <HiddenShot />
  if (scene === 'encounters') return <EncountersShot />
  if (scene === 'editor') return <MonsterEditor monster={goblin} onClose={() => {}} onSaved={() => {}} />
  if (scene === 'statblock') return <StatblockShot />
  if (scene === 'whatsnew')
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', containerType: 'inline-size' }}>
        {/* ?v= a version's post; 0.10.0's by default. */}
        <WhatsNewView entries={[{ version: new URLSearchParams(location.search).get('v') ?? '0.10.0', title: '', highlights: [] }]} />
      </div>
    )
  if (scene === 'sessions') return <SessionsShot />
  return <Overview />
}

// A timer partway through a session, so the dock and the timer box have something to show.
setSessionTimer(startTimer(3 * 3600_000, Date.now() - 35 * 60_000))
