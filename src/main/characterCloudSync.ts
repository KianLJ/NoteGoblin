import type { CloudCharacter } from '@shared/cloudCharacter'
import * as relayClient from '@server/relay/relayClient'
import { getCurrentIdentity } from './appState'
import { getRelaySession, onRelaySessionStarted } from './relayState'

/**
 * Keeps the relay's copy of this identity's character sheets current, for
 * the read-only web viewer (relay/ serves it at /viewer/). The renderer
 * builds each upload (it has the content engine with the right packs
 * active, see useCharacterCloudSync.ts) and hands it here; this side only
 * queues, debounces, and sends.
 *
 * Every queued change is tagged with the local identity it belongs to and
 * only ever sent while that same identity is the one logged in — the relay
 * session is per identity, so flushing a queue across an identity switch
 * would file one person's sheets under someone else's account.
 */

type Pending = { identityId: string } & ({ kind: 'set'; character: CloudCharacter } | { kind: 'delete' })

const pending = new Map<string, Pending>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const PUSH_DEBOUNCE_MS = 2000

async function send(characterId: string): Promise<void> {
  const item = pending.get(characterId)
  if (!item) return
  const session = getRelaySession()
  const identity = getCurrentIdentity()
  if (!session || !identity) return // retried on the next relay session
  if (identity.id !== item.identityId) {
    pending.delete(characterId)
    return
  }
  const result =
    item.kind === 'set'
      ? await relayClient.setCloudCharacter(session.token, item.character)
      : await relayClient.removeCloudCharacter(session.token, characterId)
  // Only clear it if nothing newer was queued while this request was in flight.
  if (result.ok && pending.get(characterId) === item) pending.delete(characterId)
}

function schedule(characterId: string, item: Pending): void {
  pending.set(characterId, item)
  clearTimeout(timers.get(characterId))
  timers.set(
    characterId,
    setTimeout(() => {
      timers.delete(characterId)
      void send(characterId)
    }, PUSH_DEBOUNCE_MS)
  )
}

export function queueCloudCharacter(character: CloudCharacter): void {
  const identity = getCurrentIdentity()
  if (!identity) return
  schedule(character.id, { identityId: identity.id, kind: 'set', character })
}

export function queueCloudCharacterRemoval(characterId: string): void {
  const identity = getCurrentIdentity()
  if (!identity) return
  schedule(characterId, { identityId: identity.id, kind: 'delete' })
}

onRelaySessionStarted(() => {
  for (const characterId of [...pending.keys()]) void send(characterId)
})
