import { allAudioGroups, replaceAudioGroups, subscribeAudioGroups } from './audioGroups'
import { allAudioNames, replaceAudioNames, subscribeAudioNames } from './audioNames'
import { reloadCustomMusic } from './customMusicStore'
import type { AudioLibraryMeta } from '@shared/ipc'

/**
 * The renderer's half of syncing your music and sounds with your account (main/audioSync.ts does the files):
 * your moods, Sound Board categories and names go to the main process whenever they change, and come back from
 * it when another device changed them; when syncing adds or removes songs, the lists are read again.
 */
let started = false

export function startAudioLibrarySync(): () => void {
  if (started) return () => {}
  started = true
  // Set while putting your account's copy in place, so that isn't sent straight back as a change.
  let applying = false
  const meta = (): AudioLibraryMeta => ({ groups: allAudioGroups(), names: allAudioNames() })
  const send = (): void => {
    if (!applying) void window.goblin.music.setLibraryMeta(meta(), false)
  }
  void window.goblin.music.setLibraryMeta(meta(), true)
  const offs = [
    subscribeAudioGroups(send),
    subscribeAudioNames(send),
    window.goblin.music.onLibraryMeta((next) => {
      applying = true
      try {
        replaceAudioGroups(next.groups)
        replaceAudioNames(next.names)
      } finally {
        applying = false
      }
    }),
    window.goblin.music.onCustomChanged(() => void reloadCustomMusic())
  ]
  return () => {
    started = false
    offs.forEach((off) => off())
  }
}
