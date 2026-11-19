// The web app's stand-in for the desktop's main process (src/main/registerIpc.ts): it answers the same channels
// the preload calls, for a player. Your account is your relay account; friends, messages, the planner and
// notifications go to the relay; a joined session goes over the relay to the DM's app exactly as on the desktop
// (src/main/sessionClient.ts runs here unchanged); characters live in your relay account. Running a campaign,
// hosting, homebrew packs and local files need the desktop app (shortcut: they answer "needs the desktop app").
import { emit, handle, webWindow } from './electron'
import * as relayClient from '../src/server/relay/relayClient'
import { RELAY_URL, RELAY_DIRECTORY_PATH } from './relayConfig'
import { connectPresence, disconnectPresence, queryOnline } from '../src/main/relaySocket'
import { getFriendHostingSessionId, getRelaySession, getRelayStatus, isFriendOnline, setRelaySession, type RelaySession } from '../src/main/relayState'
import { getJoinedSessionId, joinSession, leaveSession, sendRequest } from '../src/main/sessionClient'
import type { RequestKind } from '../src/server/relay/sessionProtocol'
import { emptyCharacterSheet, type CharacterSheetData } from '@shared/dnd5e'
import { normalizeWithOwnPacks } from '@shared/content/sheet'
import { srdPack } from '@shared/content/srd'
import type { ApiResult, CharacterSheet, Identity, LoginResult } from '@shared/ipc'
import type { CloudCharacter } from '@shared/cloudCharacter'

const win = webWindow as never
const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data })
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })
const NEEDS_DESKTOP = 'That needs the NoteGoblin desktop app.'

// --- Your account -------------------------------------------------------------
// Kept in localStorage when you tick "remember me", sessionStorage otherwise (gone when the tab closes).

const SESSION_KEY = 'ng-web-session'
const stored = (): RelaySession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as RelaySession) : null
  } catch {
    return null
  }
}
let remember = true
function keep(session: RelaySession | null): void {
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
  if (session) (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session))
}
const identityOf = (s: RelaySession): Identity => ({ id: s.userId, displayName: s.username })

/** Signed in: the relay session, live presence, then (as the desktop does) your saved look from the account. */
function start(session: RelaySession): LoginResult {
  setRelaySession(session)
  keep(session)
  connectPresence(session.token, win)
  setTimeout(() => {
    void relayClient.getPrefs(session.token).then((r) => emit('relay:prefs-checked', r.ok ? (r.data.prefs ?? null) : null))
  }, 300)
  void loadCharacters()
  return { ok: true, identity: identityOf(session) }
}

handle('identity:has-any', () => true)
handle('identity:has-remembered', () => !!stored())
handle('identity:auto-login', async (): Promise<LoginResult> => {
  const s = stored()
  if (!s) return fail('Log in first.')
  const me = await relayClient.getMe(s.token)
  if (!me.ok) {
    keep(null)
    return fail('Your session expired. Log in again.')
  }
  return start({ ...s, username: me.data.username })
})
handle('identity:remember', (r: unknown) => {
  remember = r === true
  const s = getRelaySession()
  if (s) keep(s)
  return { ok: true }
})
handle('identity:login', async (name: unknown, password: unknown): Promise<LoginResult> => {
  const r = await relayClient.login(String(name).trim(), String(password))
  if (!r.ok) return fail(r.error.startsWith('Too many sign-in attempts') ? r.error : 'That display name and password don’t match.')
  return start(r.data)
})
handle('identity:create', async (name: unknown, password: unknown): Promise<LoginResult> => {
  const r = await relayClient.register(String(name).trim(), String(password))
  return r.ok ? start(r.data) : fail(r.error)
})
handle('identity:get-current', () => {
  const s = getRelaySession()
  return s ? identityOf(s) : null
})
handle('identity:list', () => {
  const s = getRelaySession()
  return s ? [{ ...identityOf(s), remembered: true, current: true }] : []
})
handle('identity:switch', () => fail('The web app signs in one account at a time: log out, then log in as the other.'))
handle('identity:forget-saved', () => undefined)
handle('identity:update-display-name', () => fail(NEEDS_DESKTOP))
handle('identity:change-password', async (current: unknown, next: unknown): Promise<LoginResult> => {
  const s = getRelaySession()
  if (!s) return fail('Log in first.')
  const check = await relayClient.login(s.username, String(current))
  if (!check.ok) return fail('That current password isn’t right.')
  const r = await relayClient.changePassword(check.data.token, String(next))
  return r.ok ? start({ ...s, token: check.data.token }) : fail(r.error)
})
handle('identity:sign-out', () => {
  leaveSession()
  disconnectPresence()
  setRelaySession(null)
  keep(null)
  characters = new Map()
})
handle('identity:pull-prefs', async () => {
  const s = getRelaySession()
  if (!s) return null
  const r = await relayClient.getPrefs(s.token)
  return r.ok ? r.data.prefs : null
})
handle('identity:push-prefs', async (prefs: unknown) => {
  const s = getRelaySession()
  if (s) await relayClient.setPrefs(s.token, prefs)
})

// --- The app itself -----------------------------------------------------------

handle('app:get-version', () => __APP_VERSION__)
handle('updates:get-status', () => ({ state: 'current', checkedAt: Date.now() }))
handle('updates:check', () => ({ state: 'current', checkedAt: Date.now() }))
handle('updates:install', () => undefined)
handle('window:is-maximized', () => false)
for (const c of ['window:minimize', 'window:toggle-maximize', 'window:close', 'discord:set-activity', 'sessions:set-view-role']) handle(c, () => undefined)

// --- The relay: friends, notifications, messages, the planner --------------------

const withSession = <T>(run: (token: string) => Promise<ApiResult<T>>): Promise<ApiResult<T>> => {
  const s = getRelaySession()
  return s ? run(s.token) : Promise.resolve(fail('Not connected to the relay.'))
}
const done = (r: { ok: true } | { ok: false; error: string }): ApiResult<void> => (r.ok ? ok(undefined) : r)

handle('relay:status', () => getRelayStatus())
handle('relay:my-user-id', () => getRelaySession()?.userId ?? null)
handle('relay:avatar:get', async () => {
  const s = getRelaySession()
  if (!s) return null
  const r = await relayClient.getMe(s.token)
  return r.ok ? (r.data.avatar ?? null) : null
})
handle('relay:avatar:set', (avatar: unknown) => withSession(async (t) => done(await relayClient.setAvatar(t, (avatar as string | null) ?? null))))
handle('relay:friends:list', () =>
  withSession(async (t) => {
    const r = await relayClient.getFriends(t)
    if (!r.ok) return r
    return ok(r.data.friends.map((f) => ({ ...f, online: isFriendOnline(f.userId), hostingSessionId: getFriendHostingSessionId(f.userId) })))
  })
)
handle('relay:friends:list-requests', () =>
  withSession(async (t) => {
    const r = await relayClient.getFriends(t)
    return r.ok ? ok(r.data.incomingRequests) : r
  })
)
handle('relay:friends:send-request', (username: unknown) =>
  withSession(async (t) => {
    const r = await relayClient.sendFriendRequest(t, String(username))
    return r.ok ? ok({ status: r.data.status }) : r
  })
)
handle('relay:friends:accept', (userId: unknown) =>
  withSession(async (t) => {
    const r = await relayClient.respondToRequest(t, String(userId), true)
    if (r.ok) queryOnline([String(userId)])
    return done(r)
  })
)
handle('relay:friends:decline', (userId: unknown) => withSession(async (t) => done(await relayClient.respondToRequest(t, String(userId), false))))
handle('relay:friends:remove', (userId: unknown) => withSession(async (t) => done(await relayClient.removeFriend(t, String(userId)))))
handle('relay:notifications:list', () => withSession((t) => relayClient.getNotifications(t)))
handle('relay:notifications:mark-read', (id: unknown) =>
  withSession(async (t) => {
    const r = done(await relayClient.markNotificationRead(t, String(id)))
    if (r.ok) emit('relay:notifications-changed')
    return r
  })
)
handle('relay:messages:send', (input: unknown) => withSession((t) => relayClient.sendMessage(t, input as Parameters<typeof relayClient.sendMessage>[1])))
handle('relay:messages:list', (withUserId: unknown, kind: unknown) => withSession((t) => relayClient.listMessages(t, String(withUserId), kind as 'friend' | 'whisper')))
handle('relay:messages:whisper-threads', () => withSession((t) => relayClient.listWhisperThreads(t)))
handle('relay:messages:mark-read', (fromUserId: unknown, kind: unknown) =>
  withSession(async (t) => {
    const r = done(await relayClient.markMessagesRead(t, String(fromUserId), kind as 'friend' | 'whisper'))
    if (r.ok) emit('relay:notifications-changed')
    return r
  })
)
handle('relay:planner:get', () => withSession((t) => relayClient.getPlanner(t)))
const PLANNER_ACTIONS: relayClient.PlannerAction[] = ['availability', 'save', 'vote', 'suggest', 'unsuggest', 'book', 'delete']
handle('relay:planner:do', (action: unknown, body: unknown) =>
  PLANNER_ACTIONS.includes(action as relayClient.PlannerAction) ? withSession((t) => relayClient.plannerAction(t, action as relayClient.PlannerAction, body)) : fail('Unknown planner action.')
)
handle('relay:admin:list-accounts', () => withSession((t) => relayClient.adminListAccounts(t)))
handle('relay:admin:remove-account', (userId: unknown) => withSession(async (t) => done(await relayClient.adminRemoveAccount(t, String(userId)))))
handle('relay:admin:update-account', (userId: unknown, input: unknown) => withSession((t) => relayClient.adminUpdateAccount(t, String(userId), input as { username?: string; newPassword?: string })))

// --- Playing at someone's table -------------------------------------------------

handle('sessions:status', () => ({ hosting: false }))
handle('sessions:start', () => fail('Hosting a session needs the NoteGoblin desktop app.'))
handle('sessions:stop', () => undefined)
handle('sessions:join', async (sessionId: unknown) => {
  const s = getRelaySession()
  if (!s) return fail('Not connected to the relay.')
  const r = await joinSession(String(sessionId), s.token, s.username, win)
  return r.ok ? ok(undefined) : r
})
handle('sessions:leave', () => leaveSession())

/** A call that goes to the DM you're playing with, as the desktop's does (see registerIpc.ts's requireJoinedSession). */
function toDm(sessionId: unknown, kind: RequestKind, payload: unknown): Promise<ApiResult<unknown>> {
  if (typeof sessionId !== 'string' || sessionId !== getJoinedSessionId()) return Promise.resolve(fail('Join a session first.'))
  return sendRequest(kind, payload)
}
/** Same, when only one session can be joined anyway (the call doesn't name it). */
const toJoined = (kind: RequestKind, payload: unknown): Promise<ApiResult<unknown>> => toDm(getJoinedSessionId(), kind, payload)

handle('campaigns:list', (sid: unknown) => (sid ? toDm(sid, 'campaigns.list', {}) : ok([])))
handle('campaigns:players', (campaignId: unknown, sid: unknown) => toDm(sid, 'campaigns.players', { campaignId }))
handle('campaigns:join', (campaignId: unknown, sid: unknown) => toDm(sid, 'campaigns.join', { campaignId }))
handle('campaigns:get-active', (sid: unknown) => (sid ? toDm(sid, 'campaigns.getActive', {}) : ok(null)))
handle('campaigns:join-active', (sid: unknown) => toDm(sid, 'campaigns.joinActive', {}))
handle('notes:list', (campaignId: unknown, sid: unknown) => toDm(sid, 'notes.list', { campaignId }))
handle('notes:create', (campaignId: unknown, input: unknown, sid: unknown) => toDm(sid, 'notes.create', { campaignId, input }))
handle('notes:update', (campaignId: unknown, noteId: unknown, input: unknown, sid: unknown) => toDm(sid, 'notes.update', { campaignId, noteId, input }))
handle('notes:remove', (campaignId: unknown, noteId: unknown, sid: unknown) => toDm(sid, 'notes.remove', { campaignId, noteId }))
handle('folders:list', (campaignId: unknown, sid: unknown) => toDm(sid, 'folders.list', { campaignId }))
handle('folders:create', (campaignId: unknown, input: unknown, sid: unknown) => toDm(sid, 'folders.create', { campaignId, input }))
handle('folders:update', (campaignId: unknown, folderId: unknown, input: unknown, sid: unknown) => toDm(sid, 'folders.update', { campaignId, folderId, input }))
handle('folders:remove', (campaignId: unknown, folderId: unknown, sid: unknown) => toDm(sid, 'folders.remove', { campaignId, folderId }))
for (const [channel, kind] of [
  ['quests:get', 'quests.get'],
  ['worldMap:get', 'worldMap.get'],
  ['reputation:get', 'reputation.get'],
  ['boards:get', 'boards.get'],
  ['stash:get', 'stash.get'],
  ['vehicles:get', 'vehicles.get'],
  ['calendar:get', 'calendar.get'],
  ['sessionDecks:list', 'sessionDecks.list'],
  ['sessionDecks:getLive', 'sessionDecks.getLive'],
  ['messages:list', 'messages.list'],
  ['campaignPacks:list', 'campaignPacks.list']
] as Array<[string, RequestKind]>) {
  handle(channel, (campaignId: unknown, sid: unknown) => toDm(sid, kind, { campaignId }))
}
handle('worldMap:image', (campaignId: unknown, mapId: unknown, sid: unknown) => toDm(sid, 'worldMap.image', { campaignId, mapId }))
handle('calendar:event-note', (campaignId: unknown, eventId: unknown, sid: unknown) => toDm(sid, 'calendar.eventNote', { campaignId, eventId }))
handle('boards:change', (campaignId: unknown, change: unknown, sid: unknown) => toDm(sid, 'boards.change', { campaignId, change }))
handle('boards:presence', (campaignId: unknown, presence: unknown, sid: unknown) => void toDm(sid, 'boards.presence', { campaignId, presence }))
handle('stash:change', (campaignId: unknown, change: unknown, sid: unknown) => toDm(sid, 'stash.change', { campaignId, change }))
handle('messages:send', (campaignId: unknown, input: unknown, sid: unknown) => toDm(sid, 'messages.send', { campaignId, input }))
handle('presence:subscribe', (sid: unknown, campaignId: unknown) => void toDm(sid, 'presence.subscribe', { campaignId }))
handle('presence:select-character', (sid: unknown, characterName: unknown) => void toDm(sid, 'presence.selectCharacter', { characterName }))
handle('characters:sync-selected', (sid: unknown, character: unknown) => void toDm(sid, 'characters.sync', { character }))
handle('characters:get-player-character', (userId: unknown) => toJoined('characters.getPlayerCharacter', { userId }))
handle('battleMap:fetch', (sid: unknown) => toDm(sid, 'battleMap.get', {}))
handle('battleMap:fetch-image', (sid: unknown, imageId: unknown) => toDm(sid, 'battleMap.image', imageId ? { imageId } : {}))
handle('battleMap:move-token', (sid: unknown, combatantId: unknown, x: unknown, y: unknown) => toDm(sid, 'battleMap.moveToken', { combatantId, x, y }))
handle('battleMap:face-token', (sid: unknown, combatantId: unknown, facing: unknown) => toDm(sid, 'battleMap.faceToken', { combatantId, facing }))
handle('battleMap:drag-token', (sid: unknown, combatantId: unknown, x: unknown, y: unknown) => void toDm(sid, 'battleMap.dragToken', { combatantId, x, y }))
handle('battleMap:mark-player', (sid: unknown, mark: unknown) => void toDm(sid, 'battleMap.mark', { mark }))
handle('initiative:get', () => toJoined('initiative.get', {}))
handle('initiative:set-mine', (initiative: unknown) => void toJoined('initiative.setMine', { initiative }))
handle('dice:broadcast', (sid: unknown, roll: unknown) => void toDm(sid, 'dice.roll', { roll }))
handle('sfx-board:broadcast', (sfxId: unknown) => void toJoined('sfxBoard.play', { sfxId }))

// --- Characters: kept in your relay account ---------------------------------------
// The relay holds each sheet, with the numbers the app worked out for it (the phone viewer shows them). Creating or
// changing one updates the copy here; the app then uploads it with fresh numbers itself (useCharacterCloudSync's
// characters:push-cloud, as on the desktop), and that upload saves it, a moment after changes stop.
// shortcut: no offline copy, and the last device to save wins; fine for one player on one sheet at a time.

let characters = new Map<string, CloudCharacter>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const toSheet = (c: CloudCharacter): CharacterSheet => ({ ...normalizeWithOwnPacks({ ...emptyCharacterSheet(), ...c.sheet }, [srdPack()]), id: c.id, name: c.name, updatedAt: c.updatedAt, createdAt: c.sheet.createdAt ?? c.updatedAt })

async function relayGet<T>(path: string): Promise<T | null> {
  const s = getRelaySession()
  if (!s) return null
  try {
    const res = await fetch(`${RELAY_URL}${RELAY_DIRECTORY_PATH}${path}`, { headers: { authorization: `Bearer ${s.token}` } })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

let loading: Promise<void> | null = null
function loadCharacters(): Promise<void> {
  loading ??= (async () => {
    const list = (await relayGet<Array<{ id: string }>>('/characters')) ?? []
    const full = await Promise.all(list.map((c) => relayGet<CloudCharacter>(`/characters/${encodeURIComponent(c.id)}`)))
    characters = new Map(full.filter((c): c is CloudCharacter => !!c?.sheet).map((c) => [c.id, c]))
  })().finally(() => (loading = null))
  return loading
}

function upload(c: CloudCharacter): void {
  clearTimeout(timers.get(c.id))
  timers.set(
    c.id,
    setTimeout(() => {
      const s = getRelaySession()
      if (s) void relayClient.setCloudCharacter(s.token, characters.get(c.id) ?? c)
    }, 800)
  )
}

handle('characters:list', async () => {
  if (!getRelaySession()) return fail('Log in first.')
  await loadCharacters()
  return ok([...characters.values()].map(toSheet))
})
handle('characters:create', (name: unknown, sheet: unknown) => {
  const n = String(name ?? '').trim()
  if (!n) return fail('Give your character a name.')
  const now = new Date().toISOString()
  const data: CharacterSheetData = normalizeWithOwnPacks({ ...emptyCharacterSheet(), ...(sheet as CharacterSheetData) }, [srdPack()])
  const id = crypto.randomUUID()
  // Its numbers arrive with the app's upload (characters:push-cloud).
  const c = { id, name: n, updatedAt: now, subtitle: '', sheet: { ...data, id, name: n, createdAt: now, updatedAt: now } } as CloudCharacter
  characters.set(id, c)
  return ok(toSheet(c))
})
handle('characters:update', (id: unknown, input: unknown) => {
  const c = characters.get(String(id))
  if (!c) return fail('Character not found.')
  const { name, ...patch } = input as Partial<CharacterSheetData> & { name?: string }
  const now = new Date().toISOString()
  const sheet = normalizeWithOwnPacks({ ...emptyCharacterSheet(), ...c.sheet, ...patch }, [srdPack()])
  const next: CloudCharacter = { ...c, name: name ?? c.name, updatedAt: now, sheet: { ...sheet, id: c.id, name: name ?? c.name, createdAt: c.sheet.createdAt ?? now, updatedAt: now } as CharacterSheet }
  characters.set(c.id, next)
  return ok(toSheet(next))
})
handle('characters:remove', async (id: unknown) => {
  const s = getRelaySession()
  if (!s) return fail('Log in first.')
  characters.delete(String(id))
  clearTimeout(timers.get(String(id)))
  return done(await relayClient.removeCloudCharacter(s.token, String(id)))
})
handle('characters:push-cloud', (character: unknown) => {
  const c = character as CloudCharacter
  // Only your own sheets, as on the desktop.
  if (!c?.id || !characters.has(c.id)) return
  characters.set(c.id, { ...c, sheet: { ...c.sheet, createdAt: characters.get(c.id)!.sheet.createdAt } })
  upload(c)
})

// --- What a browser has instead of the desktop's files ---------------------------------

handle('files:get-vault-path', () => null)
handle('files:pick-image', (opts: unknown) => pickImage((opts as { big?: boolean } | undefined)?.big ? 64 : 8))
function pickImage(maxMb: number): Promise<ApiResult<{ dataUrl: string; fileName: string }>> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(fail('No picture picked.'))
      if (file.size > maxMb * 1024 * 1024) return resolve(fail(`That picture is too big (${maxMb} MB at most).`))
      const reader = new FileReader()
      reader.onload = () => resolve(ok({ dataUrl: String(reader.result), fileName: file.name }))
      reader.onerror = () => resolve(fail('That picture couldn’t be read.'))
      reader.readAsDataURL(file)
    }
    input.click()
  })
}
// Packs, offline campaign copies, the sound library and your own sounds live on the desktop.
handle('packs:list', () => ok([]))
handle('snapshots:list', () => ok([]))
handle('snapshots:get', () => ok(null))
handle('snapshots:save', () => undefined)
handle('snapshots:remove', () => ok(undefined))
handle('library:downloaded', () => [])
handle('music:list-custom', () => ({}))
handle('sfx-entity:list-custom', () => ({}))
handle('music:library-meta', () => undefined)
