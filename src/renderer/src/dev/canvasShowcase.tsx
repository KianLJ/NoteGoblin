// Dev-only: the canvas and its newer pieces with sample content, for screenshots in the "What's new" post.
// Open http://localhost:5180/sheet-preview.html?showcase=overview (or =statblock, =sessions, =whatsnew, =editor, =encounters, =cues). Not part of the app build.
import { useState } from 'react'
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
import { TOOL_MINI } from '@shared/canvasTools'
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
      mini: <SessionsMini api={AUDIO_DECKS} notes={[{ id: 'n2', title: 'The Leaky Lantern' } as never]} hostedSessionId={null} />,
      miniSize: TOOL_MINI.sessions
    },
    noteBox('crypt', 'The Sunken Crypt', NOTE_HTML)
  ]
  return (
    <div style={{ height: '100vh', display: 'flex' }}>
      <Canvas mode="dm" layout={layout} setLayout={setLayout} items={items} toolIcons={TOOL_ICONS} hiddenTools={['codex', 'timer']} nav={{ ...nav, root: AUDIO }} contextMenu={() => ({ add: [] })} />
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
          <SceneCues scene={CUE_SCENE} encounters={loadSavedEncounters()} onChange={() => {}} />
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

export function CanvasShowcase({ scene }: { scene: string }): JSX.Element {
  if (scene === 'audio') return <AudioShot />
  if (scene === 'cues') return <CuesShot />
  if (scene === 'encounters') return <EncountersShot />
  if (scene === 'editor') return <MonsterEditor monster={goblin} onClose={() => {}} onSaved={() => {}} />
  if (scene === 'statblock') return <StatblockShot />
  if (scene === 'whatsnew')
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', containerType: 'inline-size' }}>
        <WhatsNewView entries={[{ version: '0.10.0', title: 'A table you lay out yourself', highlights: [] }]} />
      </div>
    )
  if (scene === 'sessions') return <SessionsShot />
  return <Overview />
}

// A timer partway through a session, so the dock and the timer box have something to show.
setSessionTimer(startTimer(3 * 3600_000, Date.now() - 35 * 60_000))
