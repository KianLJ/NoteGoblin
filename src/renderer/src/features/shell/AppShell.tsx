import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { ModeToggle, type Mode } from './ModeToggle'
import { WindowControls } from './WindowControls'
import { VersionBadge } from './VersionBadge'
import { BestiaryIcon, PacksIcon } from './icons'
import { ContentPacksModal } from '../content/ContentPacksModal'
import { FriendsMenu } from '../friends/FriendsMenu'
import { MessagesButton } from '../chat/MessagesButton'
import { NotificationToasts } from '../notifications/NotificationToasts'
import { RollAnimationOverlay } from '../dice/RollAnimationOverlay'
import { useNotifications } from '../notifications/useNotifications'
import { CampaignWorkspace } from '../campaigns/CampaignWorkspace'
import { WorkspaceHeaderBar } from '../campaigns/WorkspaceHeaderBar'
import { useNotesWorkspace } from '../campaigns/useNotesWorkspace'
import { PlayerWorkspaceBody } from '../player/PlayerWorkspaceBody'
import { PlayerWorkspaceHeaderBar } from '../player/PlayerWorkspaceHeaderBar'
import { usePlayerWorkspace } from '../player/usePlayerWorkspace'
import { useCharacterCloudSync } from '../player/useCharacterCloudSync'
import { MusicButton } from '../audio/MusicButton'
import { SoundBoardButton } from '../audio/SoundBoardButton'
import { ensureMusicListening, stopMusic } from '../audio/musicEngine'
import { ensureAmbientListening } from '../audio/ambientEngine'
import { ensureSfxBoardListening } from '../audio/sfxBoardEngine'
import type { Campaign, CharacterSheet } from '@shared/ipc'
import { useApplyActivePacks, useCampaignPacks } from '../content/usePacks'
import type { BestiaryMonster } from '../../data/bestiary'

// Loaded the first time they open, so the app starts without their code.
const Bestiary = lazy(() => import('../bestiary/Bestiary').then((m) => ({ default: m.Bestiary })))
import { CombatView } from '../combat/CombatView'
import { PlayerCombatView } from '../combat/PlayerCombatView'
import { useBattleMapSync } from '../combat/useBattleMapSync'
import { useCombatSheetSync } from '../combat/useCombatSheetSync'
import { useTestPlayerSheets } from '../combat/useTestPlayerSheets'
const Workshop = lazy(() => import('../workshop/Workshop').then((m) => ({ default: m.Workshop })))

// Discord presence line shown while the app is open but not actively DMing
// or connected to a session — one is picked at random per launch (not
// re-rolled on every render) rather than staying blank, since "the app's
// just sitting there" is exactly the moment a bit of goblin flavor earns
// its keep more than a literal status ever would.
/** No sheets to sync (Player mode). */
const NO_CHARACTERS = new Map<string, CharacterSheet>()

const IDLE_PRESENCE_LINES = [
  'Hoarding notes in goblin hole',
  'Rifling through old campaign notes',
  'Sorting shinies into folders',
  'Scribbling something in the dark',
  'Guarding a pile of loot (mostly notes)',
  'Goblining it'
]

interface AppShellProps {
  displayName: string
}

export type DmTabRef = { kind: 'note'; id: string } | { kind: 'monster'; id: string }

export function AppShell({ displayName }: AppShellProps): JSX.Element {
  const [mode, setMode] = useState<Mode>('dm')
  // The Homebrew Workshop covers the workspace without unmounting it, so a hosted or joined session carries on underneath.
  const [workshopOpen, setWorkshopOpen] = useState(false)
  // The Combat tab (DM only for now) sits over the workspace like the Workshop; the encounter lives in encounterStore, so nothing is lost switching back and forth.
  const [combatOpen, setCombatOpen] = useState(false)
  // Once opened, the Workshop stays mounted (hidden) while you're elsewhere, so unsaved edits are still there
  // when you come back — they live only in memory, so they're gone once NoteGoblin closes.
  const [workshopMounted, setWorkshopMounted] = useState(false)
  useEffect(() => {
    if (workshopOpen) setWorkshopMounted(true)
  }, [workshopOpen])

  // --- DM side: one active campaign workspace, switched via CampaignSwitcher (lives in the sidebar footer) ---
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null)
  const workspace = useNotesWorkspace(undefined, activeCampaign?.id ?? null)
  const dmAutoOpenedRef = useRef(false)
  const [hostedSessionId, setHostedSessionId] = useState<string | null>(null)

  // Restore hosting state on mount (e.g. this window reloaded while another
  // was already hosting isn't possible per-process, but this mirrors the old
  // hosting-status check so a stale UI never disagrees with sessionHost.ts).
  useEffect(() => {
    window.goblin.sessions.status().then((status) => {
      if (status.hosting) setHostedSessionId(status.sessionId)
    })
  }, [])

  // Goblin Bard (music, ambiance, and the Sound Board) needs to react to the
  // DM's broadcasts regardless of which mode this window is in (DM's own
  // pick, or a player's client) — wired once here rather than from
  // MusicButton/SoundBoardButton, which only ever mount on the DM's side.
  useEffect(() => {
    ensureMusicListening()
    ensureAmbientListening()
    ensureSfxBoardListening()
  }, [])

  // --- Player side: characters (always available) + the joined session's campaigns/notes ---
  const [joinedSession, setJoinedSession] = useState<{ sessionId: string; label: string } | null>(null)
  const [disconnectMessage, setDisconnectMessage] = useState<string | null>(null)
  const playerWorkspace = usePlayerWorkspace(joinedSession?.sessionId)
  useCharacterCloudSync(playerWorkspace.characters)

  // Which content packs every character sheet derives with (see shared/content/sheet.ts): the open campaign's
  // enabled packs — the DM's own campaign in DM mode, the joined (or offline) campaign in player mode — and the
  // whole personal library when no campaign is open.
  const dmCampaignPacks = useCampaignPacks(mode === 'dm' ? (activeCampaign?.id ?? null) : null)
  const activeCampaignPacks = useMemo(() => {
    if (mode === 'dm') return activeCampaign && dmCampaignPacks.packs ? dmCampaignPacks.packs.map((p) => p.pack) : null
    return playerWorkspace.activeCampaign ? playerWorkspace.campaignPacks : null
  }, [mode, activeCampaign, dmCampaignPacks.packs, playerWorkspace.activeCampaign, playerWorkspace.campaignPacks])
  useApplyActivePacks(activeCampaignPacks)

  // Lifted here (rather than inside NotificationBell) so FriendsMenu's Join
  // button can also be gated on it — a friend showing as "hosting" doesn't
  // mean you've actually been invited to their session.
  const notifications = useNotifications()
  const invitedSessionIds = new Set(
    notifications.notifications.filter((n) => n.kind === 'session-invite' && n.sessionId).map((n) => n.sessionId!)
  )
  function handleJoinedSession(sessionId: string, label: string): void {
    // Whatever Goblin Bard track was playing before (this DM's own solo
    // tinkering, an earlier session) belongs to that context, not this new
    // one — without this it just keeps looping straight through the join,
    // audible in a table it was never picked for. The new session's DM
    // still gets to pick something fresh whenever they next broadcast.
    stopMusic()
    setJoinedSession({ sessionId, label })
    setMode('player')
    setWorkshopOpen(false)
    setCombatOpen(false)
  }

  // Locks the mode you're NOT currently using once you're mid-session, so
  // Ctrl+Tab (and the toggle itself) can't accidentally step away from a
  // hosted or joined game — DM is locked while you've joined someone else's
  // session, Player is locked while you're hosting your own.
  const lockedMode: Mode | undefined = hostedSessionId ? 'player' : joinedSession ? 'dm' : undefined
  // Combat is the DM's map in DM mode, or the DM's map as shared with you while you're in their session.
  const combatShown = combatOpen && (mode === 'dm' || !!joinedSession)
  // The DM's battle map is loaded, saved and shared behind the scenes, whether or not the Combat tab is open.
  useBattleMapSync(mode === 'dm' ? (activeCampaign?.id ?? null) : null, mode === 'dm' ? hostedSessionId : null)
  const lockedReason = hostedSessionId
    ? 'Stop hosting to switch to Player mode.'
    : joinedSession
      ? 'Leave the session to switch to DM mode.'
      : undefined

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        setWorkshopOpen(false)
        setCombatOpen(false)
        setMode((m) => {
          const next = m === 'dm' ? 'player' : 'dm'
          return next === lockedMode ? m : next
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lockedMode])

  // Your own relay account id — this is what a note/folder you author over a
  // joined session gets stamped with as authorUserId (see sessionHost.ts's
  // dispatch()), which is NOT the same id space as your local identity or
  // (as the DM) your local host-db user id. Only the player side needs this:
  // the DM's own authorUserId is always their campaign's dmUserId instead.
  const [myRelayUserId, setMyRelayUserId] = useState<string | null>(null)
  useEffect(() => {
    function refresh(): void {
      window.goblin.relay.myUserId().then(setMyRelayUserId)
    }
    refresh()
    return window.goblin.relay.onFriendsChanged(refresh)
  }, [])

  // The DM closing their app (or a dropped connection) doesn't un-join us on
  // its own — sessionClient.ts pushes this the moment the relay tells it the
  // session died, so we can leave the table cleanly instead of sitting on a
  // campaign we can no longer actually reach.
  useEffect(() => {
    return window.goblin.sessions.onDisconnected((reason) => {
      window.goblin.sessions.leave()
      stopMusic()
      setJoinedSession(null)
      setDisconnectMessage(reason === 'dm-left' ? 'The DM disconnected.' : 'Lost connection to the DM.')
      setTimeout(() => setDisconnectMessage(null), 6000)
    })
  }, [])

  // Auto-open the most recent DM campaign you're actually part of, once per
  // app session. There's no "back" to re-arm this from — once a campaign
  // exists it's always the active one, switching only happens via the
  // sidebar's CampaignSwitcher. (Player-side auto-open lives inside
  // usePlayerWorkspace, keyed by joined session instead.)
  useEffect(() => {
    if (activeCampaign || mode !== 'dm' || dmAutoOpenedRef.current) return
    dmAutoOpenedRef.current = true
    window.goblin.campaigns.list().then((result) => {
      if (!result.ok) return
      // Only campaigns you actually DM, not ones you've merely joined as a
      // player (myRole would be 'player' there, still non-null) — otherwise
      // a test identity that joined someone else's campaign as a player
      // gets auto-opened straight into *their* campaign in DM mode, showing
      // the DM's info under the wrong identity.
      const mine = result.data.filter((c) => c.myRole === 'dm')
      if (mine.length > 0) setActiveCampaign(mine[0])
    })
  }, [mode, activeCampaign])

  // Whatever campaign the DM has open is "the table" — connecting players
  // auto-join this instead of picking from a list themselves. Recorded on
  // the relay session so a player discovers it the moment they join. The
  // result used to be discarded outright — if this ever failed (a race with
  // identity loading, an ownership mismatch, anything), the DM's own view of
  // the campaign looked completely normal while every join silently failed
  // with "the DM hasn't started a session yet," with no way to tell why.
  useEffect(() => {
    if (!activeCampaign) return
    window.goblin.campaigns.setActive(activeCampaign.id).then((result) => {
      if (!result.ok) {
        console.error(`Failed to mark "${activeCampaign.name}" as the active/hostable campaign: ${result.error}`)
      }
    })
  }, [activeCampaign])

  // Player: subscribe to presence once connected to a campaign, and keep the
  // rest of the table updated about which character you're currently on.
  useEffect(() => {
    if (!joinedSession || !playerWorkspace.activeCampaign) return
    window.goblin.presence.subscribe(joinedSession.sessionId, playerWorkspace.activeCampaign.id)
  }, [joinedSession, playerWorkspace.activeCampaign])

  useEffect(() => {
    if (!joinedSession || !playerWorkspace.activeCampaign) return
    window.goblin.presence.selectCharacter(
      joinedSession.sessionId,
      playerWorkspace.lastActiveCharacter?.name ?? null
    )
  }, [joinedSession, playerWorkspace.activeCampaign, playerWorkspace.lastActiveCharacter])

  // Same trigger as the presence name announcement above, but carries the
  // whole sheet — re-fires on every edit too, since lastActiveCharacter is a
  // new object each time saveCharacter's setCharacters resolves, keeping the
  // DM's view live rather than frozen at whatever it looked like on
  // selection. Uses lastActiveCharacter (not activeCharacter) so switching to
  // a note tab doesn't clear what the table sees you playing.
  useEffect(() => {
    if (!joinedSession) return
    window.goblin.characters.syncSelected(joinedSession.sessionId, playerWorkspace.lastActiveCharacter ?? null)
  }, [joinedSession, playerWorkspace.lastActiveCharacter])

  // Picked once per launch (not re-rolled every idle stretch) so it stays
  // recognizable as "your" line for the session rather than shuffling under you.
  const idlePresenceLine = useMemo(() => IDLE_PRESENCE_LINES[Math.floor(Math.random() * IDLE_PRESENCE_LINES.length)], [])

  // Discord Rich Presence — "DM for <campaign>" while actively hosting,
  // "Playing in <campaign> as <character>" while connected to someone
  // else's with a character selected (lastActiveCharacter, same "sticky
  // across note tabs" character used to announce presence/sync your sheet
  // above — falls back to plain "Playing in <campaign>" if you haven't
  // picked one), and a bit of goblin flavor any other time (not hosting/not
  // joined, or no campaign yet) rather than blank. See
  // main/discordPresence.ts for why this is entirely best-effort: it's a
  // no-op if Discord isn't running.
  useEffect(() => {
    const details =
      mode === 'dm' && hostedSessionId && activeCampaign
        ? `DM for ${activeCampaign.name}`
        : mode === 'player' && joinedSession && playerWorkspace.activeCampaign
          ? playerWorkspace.lastActiveCharacter
            ? `Playing in ${playerWorkspace.activeCampaign.name} as ${playerWorkspace.lastActiveCharacter.name || 'Unnamed Character'}`
            : `Playing in ${playerWorkspace.activeCampaign.name}`
          : idlePresenceLine
    void window.goblin.discord.setActivity(details)
  }, [
    mode,
    hostedSessionId,
    activeCampaign,
    joinedSession,
    playerWorkspace.activeCampaign,
    playerWorkspace.lastActiveCharacter,
    idlePresenceLine
  ])

  // DM: every connected player's currently-selected character, kept live —
  // used by RightPanel's ConnectedPlayersList to open one as a read-only tab.
  const [playerCharacters, setPlayerCharacters] = useState<Map<string, CharacterSheet>>(new Map())
  useEffect(() => {
    return window.goblin.characters.onPlayerCharacterChanged(({ userId, character }) => {
      setPlayerCharacters((prev) => {
        const next = new Map(prev)
        if (character) next.set(userId, character)
        else next.delete(userId)
        return next
      })
    })
  }, [])
  const [viewedPlayerUserId, setViewedPlayerUserId] = useState<string | null>(null)
  // The DM's test players play the DM's own characters; in the Combat tab they're treated like connected players.
  const testSheets = useTestPlayerSheets(mode === 'dm')
  const combatCharacters = useMemo(() => (testSheets.size ? new Map([...playerCharacters, ...testSheets]) : playerCharacters), [playerCharacters, testSheets])
  // The party's hit points (and AC, darkvision) follow their sheets in the fight, and the DM's damage goes back to them.
  useCombatSheetSync(mode === 'dm' ? combatCharacters : NO_CHARACTERS, mode === 'dm' && !!hostedSessionId)

  // Player: the DM damaged or healed you in the fight — your sheet takes the new hit points.
  const hpTarget = useRef(playerWorkspace)
  hpTarget.current = playerWorkspace
  useEffect(
    () =>
      window.goblin.characters.onHpFromDm((hp) => {
        const ws = hpTarget.current
        const character = ws.lastActiveCharacter
        if (!character) return
        const patch = { ...(hp.currentHp !== undefined ? { currentHp: hp.currentHp } : {}), ...(hp.tempHp !== undefined ? { tempHp: hp.tempHp } : {}) }
        if (Object.keys(patch).length) void ws.saveCharacter(character.id, patch)
      }),
    []
  )

  // Enemy statblock tabs opened from the Initiative tracker (see
  // InitiativeTracker.tsx's onSelectMonster) — a separate open list from
  // note tabs (each keyed by the monster's Bestiary/custom index, deduped
  // the same way notes dedupe by note id) so the DM can have several
  // enemies' cards open side by side, switching between them the same way
  // note tabs work. `activeMonsterTab` null means no monster tab is the
  // active view right now (a note, or nothing, is showing instead).
  const [monsterTabs, setMonsterTabs] = useState<BestiaryMonster[]>([])
  const [activeMonsterTab, setActiveMonsterTab] = useState<string | null>(null)

  function openMonsterTab(monster: BestiaryMonster): void {
    setMonsterTabs((prev) => (prev.some((m) => m.index === monster.index) ? prev : [...prev, monster]))
    setActiveMonsterTab(monster.index)
    setViewedPlayerUserId(null)
  }

  function closeMonsterTab(index: string): void {
    setMonsterTabs((prev) => {
      const next = prev.filter((m) => m.index !== index)
      setActiveMonsterTab((current) => (current === index ? (next[next.length - 1]?.index ?? null) : current))
      return next
    })
  }

  /**
   * The DM header's tab strip mixes two independently-owned lists — note
   * tabs (useNotesWorkspace's own ordered, persisted `openTabs`) and monster
   * tabs (above) — but a single drag can only reorder items within one JS
   * array. This is the merged visual order both render from, letting a note
   * and a monster tab drag-reorder against each other the same way the
   * player side's PlayerTabRef strip already does across notes/characters.
   * Reconciled (not recomputed from scratch) whenever either source list
   * changes, so existing positions survive — only a newly-opened tab gets
   * appended, and a closed one just drops out.
   */
  const [dmTabOrder, setDmTabOrder] = useState<DmTabRef[]>([])
  useEffect(() => {
    setDmTabOrder((prev) => {
      const noteIds = new Set(workspace.tabNotes.map((n) => n.id))
      const monsterIds = new Set(monsterTabs.map((m) => m.index))
      const kept = prev.filter((t) => (t.kind === 'note' ? noteIds.has(t.id) : monsterIds.has(t.id)))
      const keptNoteIds = new Set(kept.filter((t) => t.kind === 'note').map((t) => t.id))
      const keptMonsterIds = new Set(kept.filter((t) => t.kind === 'monster').map((t) => t.id))
      const newNotes: DmTabRef[] = workspace.tabNotes.filter((n) => !keptNoteIds.has(n.id)).map((n) => ({ kind: 'note', id: n.id }))
      const newMonsters: DmTabRef[] = monsterTabs.filter((m) => !keptMonsterIds.has(m.index)).map((m) => ({ kind: 'monster', id: m.index }))
      return [...kept, ...newNotes, ...newMonsters]
    })
  }, [workspace.tabNotes, monsterTabs])

  function moveDmTab(dragged: DmTabRef, target: DmTabRef): void {
    if (dragged.kind === target.kind && dragged.id === target.id) return
    setDmTabOrder((prev) => {
      const withoutDragged = prev.filter((t) => !(t.kind === dragged.kind && t.id === dragged.id))
      const targetIndex = withoutDragged.findIndex((t) => t.kind === target.kind && t.id === target.id)
      if (targetIndex === -1) return prev
      return [...withoutDragged.slice(0, targetIndex), dragged, ...withoutDragged.slice(targetIndex)]
    })
  }

  /** Switches which monster tab (if any) is the active view — null deactivates all of them (a note, or nothing, shows instead), same "explicit null clears it" convention as onViewPlayerUserId. Activating a real one also drops the player-character view, same mutual-exclusivity every other "takes over the main pane" view already has. */
  function selectMonsterTab(index: string | null): void {
    setActiveMonsterTab(index)
    if (index) setViewedPlayerUserId(null)
  }

  const [bestiaryOpen, setBestiaryOpen] = useState(false)
  const [packsOpen, setPacksOpen] = useState(false)

  return (
    // height:100% (not 100vh) deliberately — this box is nested inside
    // App.tsx's ScaledApp wrapper, which already pre-divides its own size by
    // the current font scale so the whole subtree renders back to exactly
    // the real window size once transformed; 100vh here would bypass that
    // and read the true (un-compensated) viewport directly, reintroducing
    // the "footer pushed off-screen" bug the scale wrapper exists to avoid.
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <header
        className="gb-drag"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          height: 44,
          padding: '0 0 0 var(--space-5)',
          background: 'var(--bg-canvas)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0
        }}
      >
        <div
          className="gb-no-drag"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0, flexShrink: 1 }}
        >
          <ModeToggle
            mode={mode}
            onChange={(m) => {
              setWorkshopOpen(false)
              setCombatOpen(false)
              setMode(m)
            }}
            disabledMode={lockedMode}
            disabledReason={lockedReason}
            workshop={workshopOpen}
            onWorkshop={() => {
              setCombatOpen(false)
              setWorkshopOpen(true)
            }}
            combat={combatShown}
            onCombat={
              mode === 'dm' || joinedSession
                ? () => {
                    setWorkshopOpen(false)
                    setCombatOpen(true)
                  }
                : undefined
            }
          />

          {!workshopOpen && !combatShown && mode === 'dm' && activeCampaign && (
            <>
              <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', flexShrink: 0 }} />
              <WorkspaceHeaderBar
                campaign={activeCampaign}
                workspace={workspace}
                monsterTabs={monsterTabs}
                activeMonsterTab={activeMonsterTab}
                onSelectMonsterTab={selectMonsterTab}
                onCloseMonsterTab={closeMonsterTab}
                tabOrder={dmTabOrder}
                onMoveTab={moveDmTab}
              />
            </>
          )}

          {!workshopOpen && !combatShown && mode === 'player' && playerWorkspace.tabItems.length > 0 && (
            <>
              <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', flexShrink: 0 }} />
              <PlayerWorkspaceHeaderBar workspace={playerWorkspace} />
            </>
          )}
        </div>

        {/* Plain flex spacer, deliberately left off the gb-no-drag list — it
            inherits gb-drag from the header, so empty header space (e.g. no
            tabs open) stays draggable instead of being silently claimed by
            the no-drag group next to it. */}
        <div style={{ flex: 1, minWidth: 'var(--space-4)' }} />

        <div
          className="gb-no-drag"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}
        >
          <button
            type="button"
            onClick={() => setBestiaryOpen(true)}
            className="gb-btn gb-btn--secondary"
            title="Codex"
            style={{ padding: 'var(--space-2)', display: 'flex' }}
          >
            <BestiaryIcon />
          </button>
          <button
            type="button"
            onClick={() => setPacksOpen(true)}
            className="gb-btn gb-btn--secondary"
            title="Content Packs"
            style={{ padding: 'var(--space-2)', display: 'flex' }}
          >
            <PacksIcon />
          </button>
          {mode === 'dm' && <MusicButton sessionId={hostedSessionId} campaignId={activeCampaign?.id ?? null} />}
          {mode === 'dm' && <SoundBoardButton sessionId={hostedSessionId} />}
          <MessagesButton
            campaignId={mode === 'dm' ? (activeCampaign?.id ?? null) : (playerWorkspace.activeCampaign?.id ?? null)}
            sessionId={mode === 'dm' ? hostedSessionId : (joinedSession?.sessionId ?? null)}
            myUserId={myRelayUserId}
          />
          <FriendsMenu
            mode={mode}
            hostedSessionId={hostedSessionId}
            invitedSessionIds={invitedSessionIds}
            onJoinedSession={handleJoinedSession}
            connectedLabel={joinedSession?.label ?? null}
            activeCampaignName={playerWorkspace.activeCampaign?.name ?? null}
            onResync={playerWorkspace.resync}
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{displayName}</span>
          <VersionBadge variant="inline" />
        </div>

        <WindowControls />
      </header>

      {packsOpen && (
        <ContentPacksModal
          onClose={() => setPacksOpen(false)}
          role={mode === 'dm' ? 'dm' : 'player'}
          campaign={
            mode === 'dm'
              ? activeCampaign && { id: activeCampaign.id, name: activeCampaign.name }
              : playerWorkspace.activeCampaign && { id: playerWorkspace.activeCampaign.id, name: playerWorkspace.activeCampaign.name }
          }
          playerCampaignPacks={playerWorkspace.campaignPacks}
        />
      )}

      {disconnectMessage && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-5)',
            background: 'var(--danger-subtle, var(--bg-sunken))',
            color: 'var(--danger)',
            fontSize: 13,
            flexShrink: 0
          }}
        >
          {disconnectMessage}
        </div>
      )}

      {workshopMounted && (
        <main style={{ flex: 1, display: workshopOpen ? 'flex' : 'none', flexDirection: 'column', minHeight: 0 }}>
          <Suspense fallback={null}>
            <Workshop authorName={displayName} />
          </Suspense>
        </main>
      )}
      {combatShown && !workshopOpen && (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {mode === 'dm' ? (
            <CombatView sessionId={hostedSessionId} campaignId={activeCampaign?.id ?? null} playerCharacters={combatCharacters} />
          ) : (
            joinedSession && (
              <PlayerCombatView
                sessionId={joinedSession.sessionId}
                character={playerWorkspace.lastActiveCharacter}
                onSaveCharacter={(patch) => {
                  const character = playerWorkspace.lastActiveCharacter
                  if (character) void playerWorkspace.saveCharacter(character.id, patch)
                }}
              />
            )
          )}
        </main>
      )}
      <main style={{ flex: 1, display: workshopOpen || combatShown ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
        {mode === 'dm' ? (
          <CampaignWorkspace
            campaign={activeCampaign}
            workspace={workspace}
            onSwitchCampaign={setActiveCampaign}
            onCampaignDeleted={() => setActiveCampaign(null)}
            hostedSessionId={hostedSessionId}
            onHostedSessionChange={setHostedSessionId}
            playerCharacters={playerCharacters}
            viewedPlayerUserId={viewedPlayerUserId}
            onViewPlayerUserId={setViewedPlayerUserId}
            monsterTabs={monsterTabs}
            activeMonsterTab={activeMonsterTab}
            onOpenMonsterTab={openMonsterTab}
            onSelectMonsterTab={setActiveMonsterTab}
          />
        ) : (
          <PlayerWorkspaceBody
            workspace={playerWorkspace}
            myUserId={myRelayUserId}
            sessionId={joinedSession?.sessionId ?? null}
            connectedLabel={joinedSession?.label ?? null}
            onLeaveSession={() => setJoinedSession(null)}
          />
        )}
      </main>

      <NotificationToasts notifications={notifications} onJoined={handleJoinedSession} />
      <RollAnimationOverlay />
      {bestiaryOpen && (
        <Suspense fallback={null}>
          <Bestiary
            onClose={() => setBestiaryOpen(false)}
            hideMonsters={mode === 'player' && !!joinedSession}
            sessionId={mode === 'dm' ? hostedSessionId : (joinedSession?.sessionId ?? null)}
          />
        </Suspense>
      )}
    </div>
  )
}
