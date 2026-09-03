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
import resultUrl from '../../assets/sfx/Result.mp3'
import sceneAdvanceUrl from '../../assets/sfx/SceneAdvance.mp3'
import sendMessageUrl from '../../assets/sfx/SendMessage.mp3'
import sessionHostedUrl from '../../assets/sfx/SessionHosted.mp3'
import shortRestUrl from '../../assets/sfx/ShortRest.mp3'
import whooshUrl from '../../assets/sfx/Whoosh.mp3'
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
  /** A roll's reveal (RollAnimationOverlay.tsx) for anything that isn't a natural 1 or 20 — those keep their own dedicated chimes. Played with `rate` set from how good the roll was, low-pitched for a bad roll and high-pitched for a good one, so an ordinary result still has some texture instead of every non-crit roll sounding identical. */
  | 'result'
  | 'sceneAdvance'
  /** You sent a message from an open chat log. */
  | 'sendMessage'
  | 'sessionHosted'
  | 'shortRest'
  /** The modifier chip flying in to a settled die (RollAnimationOverlay.tsx) — started the instant the chip begins its flight so its ~2.6s length lines up with the impact landing exactly when the chip actually reaches the die, see MODIFIER_FLY_MS there. */
  | 'whoosh'

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
  result: resultUrl,
  sceneAdvance: sceneAdvanceUrl,
  sendMessage: sendMessageUrl,
  sessionHosted: sessionHostedUrl,
  shortRest: shortRestUrl,
  whoosh: whooshUrl
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

/** Fires a short one-shot UI cue — a no-op if the user has muted sound effects. Safe to call from anywhere; failures (e.g. autoplay policy before any user gesture) are swallowed rather than surfaced, since a missing sound is never worth an error toast. `rate` shifts the clip's pitch via playbackRate — 1 is unchanged, e.g. 0.8 is lower and 1.2 is higher; see 'result' above for the one cue that actually varies this. */
export function playSfx(id: SfxId, rate = 1): void {
  if (!getStoredSfxEnabled()) return
  const base = elementFor(id)
  // Cloning lets an already-playing cue (e.g. rapid-fire dice rolls) overlap
  // itself instead of restarting/cutting off — the cached element is only
  // ever a template, never actually played from directly.
  const instance = base.cloneNode(true) as HTMLAudioElement
  instance.volume = getStoredSfxVolume()
  // Chromium (and so Electron) defaults preservesPitch to true, which uses
  // a time-stretch algorithm to deliberately keep pitch constant while
  // playbackRate changes speed — the exact opposite of what a pitch cue
  // needs. Without turning this off, changing `rate` just sped the clip up
  // or slowed it down with barely any perceptible pitch shift.
  instance.preservesPitch = false
  instance.playbackRate = rate
  void instance.play().catch(() => {
    /* autoplay blocked or similar — not worth surfacing */
  })
}
