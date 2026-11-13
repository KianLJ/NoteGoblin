import { BrowserPanel } from '../browser/BrowserPanel'
import { UndoToast } from '../../ui/UndoToast'
import { ShortcutSheet } from '../../ui/ShortcutSheet'
import { GoblinLoader } from '../../ui/GoblinLoader'
import { setBrowserAccount } from '../browser/browserAccount'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ModeToggle, type Mode } from './ModeToggle'
import { WindowControls } from './WindowControls'
import { VersionBadge } from './VersionBadge'
import { WhatsNewView } from './WhatsNew'
import { CHANGELOG, type ChangelogEntry } from '../../data/changelog'
import { BestiaryIcon, PacksIcon } from './icons'
import { ContentPacksModal } from '../content/ContentPacksModal'
import { FriendsButton, FriendsPanel } from '../friends/FriendsPanel'
import { MessagesButton } from '../chat/MessagesButton'
import { NotificationToasts } from '../notifications/NotificationToasts'
import { RollAnimationOverlay } from '../dice/RollAnimationOverlay'
import { useNotifications } from '../notifications/useNotifications'
import { CampaignWorkspace } from '../campaigns/CampaignWorkspace'
import { useNotesWorkspace } from '../campaigns/useNotesWorkspace'
import { PlayerWorkspaceBody } from '../player/PlayerWorkspaceBody'
import { usePlayerWorkspace } from '../player/usePlayerWorkspace'
import { useClassicLayout } from '../classic/classicLayout'
import { useClassicDmTabs } from '../classic/useClassicDmTabs'
import { ClassicCampaignWorkspace } from '../classic/ClassicCampaignWorkspace'
import { ClassicPlayerWorkspaceBody } from '../classic/ClassicPlayerWorkspaceBody'
import { WorkspaceHeaderBar } from '../classic/WorkspaceHeaderBar'
import { PlayerWorkspaceHeaderBar } from '../classic/PlayerWorkspaceHeaderBar'
import { HeaderPopover } from '../classic/HeaderPopover'
import { TOOL_ICONS } from '../canvas/toolIcons'
import { Modal } from '../../ui/Modal'
import { useCharacterCloudSync } from '../player/useCharacterCloudSync'
import { MusicPanel } from '../audio/MusicPanel'
import { SoundBoardPanel } from '../audio/SoundBoardPanel'
import type { CanvasHandle } from '../canvas/Canvas'
import { toolFull, type ToolContents } from '../canvas/toolItems'
import { AccountButton } from '../account/AccountSettingsButton'
import { MusicMini, SoundBoardMini } from '../canvas/toolMinis'
import { KeepAliveOutlet, useKeepAliveHost } from '../canvas/KeepAlive'
import { entryNodeId, putEntry } from '../canvas/canvasEntries'
import { DYNAMIC_SIZE } from '@shared/canvasTools'
import { ensureMusicListening, stopMusic } from '../audio/musicEngine'
import { ensureAmbientListening } from '../audio/ambientEngine'
import { ensureSfxBoardListening } from '../audio/sfxBoardEngine'
import { startAudioLibrarySync } from '../audio/librarySync'
import type { Campaign, CharacterSheet } from '@shared/ipc'
import { useApplyActivePacks, useCampaignPacks } from '../content/usePacks'

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
  // Your own music and sounds, kept with your account so every device you sign in on has them.
  useEffect(() => startAudioLibrarySync(), [])

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
  // Dev builds leave both modes open, so you can host and also join your own session as a player to test it.
  const lockedMode: Mode | undefined = import.meta.env.DEV ? undefined : hostedSessionId ? 'player' : joinedSession ? 'dm' : undefined
  // Combat is the DM's map in DM mode, or the DM's map as shared with you while you're in their session
  // (out of one, the tab's still there, saying how to get to the fight).
  const combatShown = combatOpen
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

  // Main tells a dev build's self-joined player's calls from the DM's own by the view showing (registerIpc.ts's isOwnHostedCall).
  useEffect(() => {
    void window.goblin.sessions.setViewRole(mode === 'player' ? 'player' : 'dm')
  }, [mode])

  // Your own relay account id — this is what a note/folder you author over a
  // joined session gets stamped with as authorUserId (see sessionHost.ts's
  // dispatch()), which is NOT the same id space as your local identity or
  // (as the DM) your local host-db user id. Only the player side needs this:
  // the DM's own authorUserId is always their campaign's dmUserId instead.
  const [myRelayUserId, setMyRelayUserId] = useState<string | null>(null)
  // Whose logins every Browser box uses.
  useEffect(() => setBrowserAccount(myRelayUserId), [myRelayUserId])
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
      setDisconnectMessage(reason === 'dm-left' ? 'The DM disconnected.' : reason === 'kicked' ? 'The DM removed you from the table.' : 'Lost connection to the DM.')
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

  // DM: while hosting, this window gets the table's live updates — presenting's scene changes, players' edits —
  // whatever's open on the canvas. (The Players box used to be the only thing subscribing, so with it closed,
  // Present started for the players but the presenter bar never came up here.)
  useEffect(() => {
    if (hostedSessionId && activeCampaign) window.goblin.presence.subscribe(hostedSessionId, activeCampaign.id)
  }, [hostedSessionId, activeCampaign])

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

  // Whichever workspace canvas is showing (DM or player) — the header's buttons open their tools on it.
  const canvasRef = useRef<CanvasHandle>(null)
  // Music keeps running while its box is closed (see canvas/KeepAlive.tsx).
  const musicHost = useKeepAliveHost()
  const playerSessionId = joinedSession?.sessionId ?? null
  const [packsOpen, setPacksOpen] = useState(false)
  // The classic layout (Settings → Appearance): the old sidebar screens, with the Codex and What's New as pop-ups.
  const classic = useClassicLayout()
  const dmTabs = useClassicDmTabs(workspace)
  const [bestiaryOpen, setBestiaryOpen] = useState(false)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  // The versions the What's New box shows: the ones just updated through, or (reopened later) the newest.
  const [whatsNewEntries, setWhatsNewEntries] = useState<ChangelogEntry[]>(() => CHANGELOG.slice(0, 1))

  const sharedTools: ToolContents = {
    codex: (
      <Suspense fallback={<GoblinLoader label="Opening the Codex" />}>
        <Bestiary
          embedded
          hideMonsters={mode === 'player' && !!joinedSession}
          sessionId={mode === 'dm' ? hostedSessionId : playerSessionId}
          onAddToCanvas={(entry) => {
            putEntry(mode, entry)
            canvasRef.current?.openAt(entryNodeId(entry), entry.kind === 'monster' ? DYNAMIC_SIZE.monster : DYNAMIC_SIZE.entry)
          }}
        />
      </Suspense>
    ),
    whatsnew: <WhatsNewView entries={whatsNewEntries} />,
    browser: <BrowserPanel />,
    friends: (
      <FriendsPanel
        mode={mode}
        hostedSessionId={hostedSessionId}
        invitedSessionIds={invitedSessionIds}
        onJoinedSession={handleJoinedSession}
        connectedLabel={joinedSession?.label ?? null}
        activeCampaignName={playerWorkspace.activeCampaign?.name ?? null}
        onResync={playerWorkspace.resync}
      />
    ),
    ...(mode === 'dm'
      ? {
          music: { full: <KeepAliveOutlet host={musicHost} />, mini: <MusicMini sessionId={hostedSessionId} /> },
          soundboard: { full: <SoundBoardPanel sessionId={hostedSessionId} />, mini: <SoundBoardMini sessionId={hostedSessionId} /> }
        }
      : {})
  }

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
          <AccountButton displayName={displayName} />
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
            onCombat={() => {
              setWorkshopOpen(false)
              setCombatOpen(true)
            }}
          />

          {classic && !workshopOpen && !combatShown && mode === 'dm' && activeCampaign && (
            <>
              <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', flexShrink: 0 }} />
              <WorkspaceHeaderBar
                campaign={activeCampaign}
                workspace={workspace}
                monsterTabs={dmTabs.monsterTabs}
                activeMonsterTab={dmTabs.activeMonsterTab}
                onSelectMonsterTab={dmTabs.selectMonsterTab}
                onCloseMonsterTab={dmTabs.closeMonsterTab}
                tabOrder={dmTabs.dmTabOrder}
                onMoveTab={dmTabs.moveDmTab}
              />
            </>
          )}

          {classic && !workshopOpen && !combatShown && mode === 'player' && playerWorkspace.tabItems.length > 0 && (
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
          <div className="gb-topbar-group">
          <button
            type="button"
            className="gb-topbtn"
            title="Codex — right-click to close it"
            aria-label="Codex"
            onClick={() => {
              if (classic) return setBestiaryOpen(true)
              setWorkshopOpen(false)
              setCombatOpen(false)
              canvasRef.current?.openTool('codex')
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              canvasRef.current?.closeTool('codex')
            }}
          >
            <BestiaryIcon />
          </button>
          <button type="button" className="gb-topbtn" title="Content Packs" aria-label="Content Packs" onClick={() => setPacksOpen(true)}>
            <PacksIcon />
          </button>
          {classic && mode === 'dm' && (
            <>
              <HeaderPopover
                width={360}
                trigger={(toggle) => (
                  <button type="button" className="gb-topbtn" title="Goblin Bard" aria-label="Goblin Bard" onClick={toggle}>
                    {TOOL_ICONS.music}
                  </button>
                )}
              >
                <KeepAliveOutlet host={musicHost} />
              </HeaderPopover>
              <HeaderPopover
                width={340}
                trigger={(toggle) => (
                  <button type="button" className="gb-topbtn" title="Sound Board" aria-label="Sound Board" onClick={toggle}>
                    {TOOL_ICONS.soundboard}
                  </button>
                )}
              >
                {toolFull(sharedTools.soundboard)}
              </HeaderPopover>
            </>
          )}
          </div>
          {import.meta.env.DEV && hostedSessionId && !joinedSession && (
            <button
              type="button"
              className="gb-btn gb-btn--secondary"
              title="Dev build only: join the session you're hosting as a player, to test the player side"
              style={{ fontSize: 12 }}
              onClick={async () => {
                const result = await window.goblin.sessions.join(hostedSessionId)
                if (result.ok) handleJoinedSession(hostedSessionId, 'Your own table (dev)')
                else {
                  setDisconnectMessage(result.error)
                  setTimeout(() => setDisconnectMessage(null), 6000)
                }
              }}
            >
              Join as player (dev)
            </button>
          )}
          <div className="gb-topbar-group">
          <MessagesButton
            campaignId={mode === 'dm' ? (activeCampaign?.id ?? null) : (playerWorkspace.activeCampaign?.id ?? null)}
            sessionId={mode === 'dm' ? hostedSessionId : playerSessionId}
            myUserId={myRelayUserId}
          />
          {classic ? (
            <HeaderPopover width={300} trigger={(toggle) => <FriendsButton onOpen={toggle} />}>
              {toolFull(sharedTools.friends)}
            </HeaderPopover>
          ) : (
            <FriendsButton
              onOpen={() => {
                setWorkshopOpen(false)
                setCombatOpen(false)
                canvasRef.current?.openTool('friends')
              }}
            />
          )}
          </div>
          <VersionBadge
            variant="inline"
            onWhatsNew={(entries) => {
              setWhatsNewEntries(entries)
              if (classic) return setWhatsNewOpen(true)
              setWorkshopOpen(false)
              setCombatOpen(false)
              canvasRef.current?.openTool('whatsnew')
            }}
          />
        </div>

        <WindowControls />
      </header>

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
          <Suspense fallback={<GoblinLoader size="lg" label="Opening the Workshop" />}>
            <Workshop authorName={displayName} />
          </Suspense>
        </main>
      )}
      {combatShown && !workshopOpen && (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {mode === 'dm' ? (
            <CombatView sessionId={hostedSessionId} campaignId={activeCampaign?.id ?? null} playerCharacters={combatCharacters} />
          ) : joinedSession ? (
            <PlayerCombatView
              sessionId={joinedSession.sessionId}
              campaignId={playerWorkspace.activeCampaign?.id ?? null}
              character={playerWorkspace.lastActiveCharacter}
              onSaveCharacter={(patch) => {
                const character = playerWorkspace.lastActiveCharacter
                if (character) void playerWorkspace.saveCharacter(character.id, patch)
              }}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-5)' }}>
              <div style={{ maxWidth: 380, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>No fight to show yet</strong>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>The battle map is your DM’s. Join their session and it appears here, with your character and the party’s ship.</span>
              </div>
            </div>
          )}
        </main>
      )}
      <main style={{ flex: 1, display: workshopOpen || combatShown ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
        {classic ? (
          mode === 'dm' ? (
            <ClassicCampaignWorkspace
              campaign={activeCampaign}
              workspace={workspace}
              onSwitchCampaign={setActiveCampaign}
              onCampaignDeleted={() => setActiveCampaign(null)}
              hostedSessionId={hostedSessionId}
              onHostedSessionChange={setHostedSessionId}
              playerCharacters={playerCharacters}
              onOpenCombat={() => {
                setWorkshopOpen(false)
                setCombatOpen(true)
              }}
              viewedPlayerUserId={dmTabs.viewedPlayerUserId}
              onViewPlayerUserId={dmTabs.setViewedPlayerUserId}
              monsterTabs={dmTabs.monsterTabs}
              activeMonsterTab={dmTabs.activeMonsterTab}
              onOpenMonsterTab={dmTabs.openMonsterTab}
              onSelectMonsterTab={dmTabs.setActiveMonsterTab}
            />
          ) : (
            <ClassicPlayerWorkspaceBody
              workspace={playerWorkspace}
              myUserId={myRelayUserId}
              sessionId={joinedSession?.sessionId ?? null}
              connectedLabel={joinedSession?.label ?? null}
              onLeaveSession={() => setJoinedSession(null)}
            />
          )
        ) : mode === 'dm' ? (
          <CampaignWorkspace
            campaign={activeCampaign}
            workspace={workspace}
            onSwitchCampaign={setActiveCampaign}
            onCampaignDeleted={() => setActiveCampaign(null)}
            hostedSessionId={hostedSessionId}
            onHostedSessionChange={setHostedSessionId}
            playerCharacters={playerCharacters}
            combatCharacters={combatCharacters}
            onOpenCombat={() => {
              setWorkshopOpen(false)
              setCombatOpen(true)
            }}
            sharedTools={sharedTools}
            canvasRef={canvasRef}
          />
        ) : (
          <PlayerWorkspaceBody
            workspace={playerWorkspace}
            myUserId={myRelayUserId}
            sessionId={joinedSession?.sessionId ?? null}
            connectedLabel={joinedSession?.label ?? null}
            onLeaveSession={() => setJoinedSession(null)}
            sharedTools={sharedTools}
            canvasRef={canvasRef}
          />
        )}
      </main>

      <NotificationToasts notifications={notifications} onJoined={handleJoinedSession} />
      <UndoToast />
      <ShortcutSheet />
      <RollAnimationOverlay />
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
      {bestiaryOpen && (
        <Suspense fallback={<GoblinLoader overlay size="lg" label="Opening the Codex" />}>
          <Bestiary onClose={() => setBestiaryOpen(false)} hideMonsters={mode === 'player' && !!joinedSession} sessionId={mode === 'dm' ? hostedSessionId : playerSessionId} />
        </Suspense>
      )}
      {whatsNewOpen && (
        <Modal onClose={() => setWhatsNewOpen(false)} width={720}>
          <div style={{ height: 'min(70vh, 640px)', display: 'flex', flexDirection: 'column', containerType: 'inline-size' }}>
            <WhatsNewView entries={whatsNewEntries} />
          </div>
        </Modal>
      )}
      {mode === 'dm' && createPortal(<MusicPanel sessionId={hostedSessionId} campaignId={activeCampaign?.id ?? null} />, musicHost)}
    </div>
  )
}
