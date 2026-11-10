import type { SceneMusic, SessionScene } from '@shared/sessionDeck'
import type { SavedEncounter } from '../../data/savedEncounters'
import { MUSIC_LIBRARY } from '../../data/musicLibrary'
import { getCustomTracks } from '../audio/customMusicStore'
import { pickMood, playSpecificTrack } from '../audio/musicEngine'
import { resolveEncounterMonsters } from './SessionTimeline'

/** A mood's name, for a scene card or cue tile. */
export function moodLabel(moodId: string | null): string | null {
  return moodId ? (MUSIC_LIBRARY.find((g) => g.id === moodId)?.label ?? null) : null
}

function tracksOf(moodId: string): Array<{ id: string; title: string }> {
  return [...(MUSIC_LIBRARY.find((g) => g.id === moodId)?.tracks ?? []), ...getCustomTracks(moodId)]
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

/**
 * A scene's cues, at the top of its note: a column of encounters it can
 * load (who's in each, how much XP) and a column of music (a mood, a track
 * or a random one, with a preview). The first music cue plays when the
 * scene comes up; every cue is a button on the presenter bar. Each column
 * ends with a tile to add another.
 */
export function SceneCues({
  scene,
  encounters,
  onChange
}: {
  scene: SessionScene
  encounters: SavedEncounter[]
  onChange: (patch: Partial<Pick<SessionScene, 'encounterIds' | 'music'>>) => void
}): JSX.Element {
  const moods = MUSIC_LIBRARY.filter((g) => g.tracks.length > 0 || getCustomTracks(g.id).length > 0)
  const setMusic = (i: number, cue: SceneMusic): void => onChange({ music: scene.music.map((m, j) => (j === i ? cue : m)) })
  const unpicked = encounters.filter((e) => !scene.encounterIds.includes(e.id))

  return (
    <div className="gb-cues">
      <div className="gb-cue-col">
        <span className="gb-cue-col-head">⚔ Encounters</span>
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
        <span className="gb-cue-col-head">♪ Music</span>
        {scene.music.map((cue, i) => (
          <div key={i} className="gb-cue gb-cue--music gb-cue--set">
            <span className="gb-cue-icon" aria-hidden="true">
              ♪
            </span>
            <div className="gb-cue-body">
              <span className="gb-cue-name">{moodLabel(cue.moodId) ?? 'Music'}</span>
              <span className="gb-cue-detail">{i === 0 ? 'Plays when the scene comes up' : 'Play it from the presenter bar'}</span>
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
