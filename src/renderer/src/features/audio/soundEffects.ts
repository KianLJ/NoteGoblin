import diceRollUrl from '../../assets/sfx/DiceRoll.mp3'
import invalidActionUrl from '../../assets/sfx/InvalidAction.mp3'
import levelUpUrl from '../../assets/sfx/LevelUp.mp3'
import longRestUrl from '../../assets/sfx/LongRest.mp3'
import natural1Url from '../../assets/sfx/Natural1.mp3'
import natural20Url from '../../assets/sfx/Natural20.mp3'
import newMessageUrl from '../../assets/sfx/NewMessage.mp3'
import playerDisconnectedUrl from '../../assets/sfx/PlayerDisconnected.mp3'
import playerJoinedUrl from '../../assets/sfx/PlayerJoined.mp3'
import receiveMessageUrl from '../../assets/sfx/ReceiveMessage.mp3'
import sceneAdvanceUrl from '../../assets/sfx/SceneAdvance.mp3'
import sendMessageUrl from '../../assets/sfx/SendMessage.mp3'
import sessionHostedUrl from '../../assets/sfx/SessionHosted.mp3'
import shortRestUrl from '../../assets/sfx/ShortRest.mp3'
import { getStoredSfxEnabled, getStoredSfxVolume } from './soundSettings'

export type SfxId =
  | 'diceRoll'
  | 'invalidAction'
  | 'levelUp'
  | 'longRest'
  | 'natural1'
  | 'natural20'
  /** Header-level toast for a message arriving somewhere other than the thread you're currently looking at — see useMessageToast.ts. Deliberately never fires alongside sendMessage/receiveMessage below (those are for an actually-open chat log), so the two never overlap on the same message. */
  | 'newMessage'
  | 'playerDisconnected'
  | 'playerJoined'
  /** A message arriving in a chat log you already have open (party chat or a whisper thread) — see useCampaignChat.ts/useRelayMessages.ts. */
  | 'receiveMessage'
  | 'sceneAdvance'
  /** You sent a message from an open chat log. */
  | 'sendMessage'
  | 'sessionHosted'
  | 'shortRest'

const SFX_URLS: Record<SfxId, string> = {
  diceRoll: diceRollUrl,
  invalidAction: invalidActionUrl,
  levelUp: levelUpUrl,
  longRest: longRestUrl,
  natural1: natural1Url,
  natural20: natural20Url,
  newMessage: newMessageUrl,
  playerDisconnected: playerDisconnectedUrl,
  playerJoined: playerJoinedUrl,
  receiveMessage: receiveMessageUrl,
  sceneAdvance: sceneAdvanceUrl,
  sendMessage: sendMessageUrl,
  sessionHosted: sessionHostedUrl,
  shortRest: shortRestUrl
}

// One HTMLAudioElement per cue, reused across plays (cloned when a cue might
// overlap itself — e.g. two dice rolls in quick succession) rather than
// created fresh every time, so repeated triggers don't pile up GC pressure.
const cache = new Map<SfxId, HTMLAudioElement>()

function elementFor(id: SfxId): HTMLAudioElement {
  let el = cache.get(id)
  if (!el) {
    el = new Audio(SFX_URLS[id])
    cache.set(id, el)
  }
  return el
}

/** Fires a short one-shot UI cue — a no-op if the user has muted sound effects. Safe to call from anywhere; failures (e.g. autoplay policy before any user gesture) are swallowed rather than surfaced, since a missing sound is never worth an error toast. */
export function playSfx(id: SfxId): void {
  if (!getStoredSfxEnabled()) return
  const base = elementFor(id)
  // Cloning lets an already-playing cue (e.g. rapid-fire dice rolls) overlap
  // itself instead of restarting/cutting off — the cached element is only
  // ever a template, never actually played from directly.
  const instance = base.cloneNode(true) as HTMLAudioElement
  instance.volume = getStoredSfxVolume()
  void instance.play().catch(() => {
    /* autoplay blocked or similar — not worth surfacing */
  })
}
