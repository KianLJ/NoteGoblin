import type { SceneMusic, SessionScene } from '@shared/sessionDeck'
import type { SavedEncounter } from '../../data/savedEncounters'
import { useEffect, useReducer } from 'react'
import { MUSIC_LIBRARY } from '../../data/musicLibrary'
import { ensureCustomMusicLoaded, getCustomTracks, subscribeCustomMusic, YOUR_MUSIC_GROUP } from '../audio/customMusicStore'
import { audioGroups, subscribeAudioGroups } from '../audio/audioGroups'
import { audioName, subscribeAudioNames } from '../audio/audioNames'
import { pickMood, playSpecificTrack } from '../audio/musicEngine'
import { resolveEncounterMonsters } from './SessionTimeline'

/** Every mood a scene can cue, as the Music box lists them: the built-in ones, "Your music", then moods you made. */
function allMoods(): Array<{ id: string; label: string }> {
  return [...MUSIC_LIBRARY, { id: YOUR_MUSIC_GROUP, label: 'Your music' }, ...audioGroups('mood')]
}

/** A mood's name, for a scene card or cue tile. */
export function moodLabel(moodId: string | null): string | null {
  return moodId ? (allMoods().find((g) => g.id === moodId)?.label ?? null) : null
}

/** A mood's songs, yours included, by the names you've given them. */
function tracksOf(moodId: string): Array<{ id: string; title: string }> {
  return [...(MUSIC_LIBRARY.find((g) => g.id === moodId)?.tracks ?? []).map((t) => ({ id: t.id, title: audioName(t.id, t.title) })), ...getCustomTracks(moodId)]
}

/** Re-renders when songs are added, moods are made or renamed — and loads your added songs if the Music box hasn't yet. */
function useMusicChanges(): void {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    void ensureCustomMusicLoaded().then(bump)
    const offs = [subscribeCustomMusic(bump), subscribeAudioGroups(bump), subscribeAudioNames(bump)]
    return () => offs.forEach((off) => off())
  }, [])
}

/** A music cue's name: its track's title, or its mood's ("Tavern Respite"). */
export function cueLabel(cue: SceneMusic): string {
  const track = cue.trackId ? tracksOf(cue.moodId).find((t) => t.id === cue.trackId) : undefined
  return track?.title ?? moodLabel(cue.moodId) ?? 'Music'
}

function summary(enc: SavedEncounter): { text: string; xp: number } {
  const monsters = resolveEncounterMonsters(enc)
  const counts = new Map<string, number>()
  for (const m of monsters) counts.set(m.name, (counts.get(m.name) ?? 0) + 1)
  return {
    text: [...counts].map(([name, n]) => (n > 1 ? `${n}× ${name}` : name)).join(', ') || 'No monsters found',
    xp: monsters.reduce((sum, m) => sum + m.xp, 0)
  }
}

/** A small switch by a column's heading: the scene's first cue of that kind runs by itself as the scene comes up. */
function AutoSwitch({ kind, on, label, onChange }: { kind: 'fight' | 'music'; on: boolean; label: string; onChange: (on: boolean) => void }): JSX.Element {
  return (
    <label className={`gb-cue-auto gb-cue-auto--${kind}`} title={label}>
      <input type="checkbox" checked={on} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span className="gb-toggle-track" aria-hidden="true" />
      <span aria-hidden="true">{kind === 'fight' ? 'Auto-load' : 'Autoplay'}</span>
    </label>
  )
}

/**
 * A scene's cues, at the top of its note: a column of encounters it can
 * load (who's in each, how much XP) and a column of music (a mood, a track
 * or a random one, with a preview). With its switch on, the first music
 * cue plays when the scene comes up (on to start with), and the first
 * encounter goes into the fight (off to start with); every cue is a button
 * on the presenter bar. Each column
 * ends with a tile to add another.
 */
export function SceneCues({
  scene,
  encounters,
  onChange
}: {
  scene: SessionScene
  encounters: SavedEncounter[]
  onChange: (patch: Partial<Pick<SessionScene, 'encounterIds' | 'music' | 'autoMusic' | 'autoEncounter'>>) => void
}): JSX.Element {
  useMusicChanges()
  const moods = allMoods().filter((g) => tracksOf(g.id).length > 0)
  const setMusic = (i: number, cue: SceneMusic): void => onChange({ music: scene.music.map((m, j) => (j === i ? cue : m)) })
  const unpicked = encounters.filter((e) => !scene.encounterIds.includes(e.id))
  const autoMusic = scene.autoMusic !== false
  const autoEncounter = scene.autoEncounter === true

  return (
    <div className="gb-cues">
      <div className="gb-cue-col">
        <div className="gb-cue-col-top">
          <span className="gb-cue-col-head">⚔ Encounters</span>
          {scene.encounterIds.length > 0 && (
            <AutoSwitch kind="fight" on={autoEncounter} label="Load it when the scene starts" onChange={(on) => onChange({ autoEncounter: on })} />
          )}
        </div>
        {scene.encounterIds.map((id) => {
          const encounter = encounters.find((e) => e.id === id)
          const enc = encounter ? summary(encounter) : null
          return (
            <div key={id} className="gb-cue gb-cue--fight gb-cue--set">
              <span className="gb-cue-icon" aria-hidden="true">
                ⚔
              </span>
              <div className="gb-cue-body">
                <span className="gb-cue-name">{encounter?.name ?? 'A deleted encounter'}</span>
                {enc && (
                  <span className="gb-cue-detail">
                    {enc.text} · {enc.xp.toLocaleString()} XP
                    {autoEncounter && id === scene.encounterIds[0] ? ' · loads when the scene comes up' : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="gb-cue-clear"
                onClick={() => onChange({ encounterIds: scene.encounterIds.filter((x) => x !== id) })}
                aria-label={`Remove ${encounter?.name ?? 'the encounter'}`}
                title="Remove this encounter"
              >
                ×
              </button>
            </div>
          )
        })}
        <label className="gb-cue gb-cue--fight gb-cue--add">
          <span className="gb-cue-icon" aria-hidden="true">
            +
          </span>
          <span className="gb-cue-name">{encounters.length ? (unpicked.length ? 'Add an encounter…' : 'Every encounter is added') : 'Save one in the encounter builder'}</span>
          <select
            className="gb-cue-picker"
            value=""
            onChange={(e) => e.target.value && onChange({ encounterIds: [...scene.encounterIds, e.target.value] })}
            aria-label="Add an encounter to this scene"
            disabled={!unpicked.length}
          >
            <option value="">Add an encounter…</option>
            {unpicked.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="gb-cue-col">
        <div className="gb-cue-col-top">
          <span className="gb-cue-col-head">♪ Music</span>
          {scene.music.length > 0 && <AutoSwitch kind="music" on={autoMusic} label="Play it when the scene starts" onChange={(on) => onChange({ autoMusic: on })} />}
        </div>
        {scene.music.map((cue, i) => (
          <div key={i} className="gb-cue gb-cue--music gb-cue--set">
            <span className="gb-cue-icon" aria-hidden="true">
              ♪
            </span>
            <div className="gb-cue-body">
              <span className="gb-cue-name">{moodLabel(cue.moodId) ?? 'Music'}</span>
              <span className="gb-cue-detail">{i === 0 && autoMusic ? 'Plays when the scene comes up' : 'Play it from the presenter bar'}</span>
            </div>
            <div className="gb-cue-extra">
              <select className="gb-cue-track" value={cue.moodId} onChange={(e) => setMusic(i, { moodId: e.target.value, trackId: null })} aria-label="Mood">
                {moods.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
              <select className="gb-cue-track" value={cue.trackId ?? ''} onChange={(e) => setMusic(i, { ...cue, trackId: e.target.value || null })} aria-label="Track">
                <option value="">Random track</option>
                {tracksOf(cue.moodId).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="gb-cue-preview"
                title="Listen here — the table doesn't hear it"
                onClick={() => (cue.trackId ? playSpecificTrack(cue.trackId, 800, null) : pickMood(cue.moodId, 800, null))}
              >
                ▶
              </button>
              <button type="button" className="gb-cue-clear" onClick={() => onChange({ music: scene.music.filter((_, j) => j !== i) })} aria-label="Remove this music" title="Remove this music">
                ×
              </button>
            </div>
          </div>
        ))}
        <label className="gb-cue gb-cue--music gb-cue--add">
          <span className="gb-cue-icon" aria-hidden="true">
            +
          </span>
          <span className="gb-cue-name">{scene.music.length ? 'Add more music…' : 'Add music…'}</span>
          <select
            className="gb-cue-picker"
            value=""
            onChange={(e) => e.target.value && onChange({ music: [...scene.music, { moodId: e.target.value, trackId: null }] })}
            aria-label="Add music to this scene"
          >
            <option value="">Pick a mood…</option>
            {moods.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
