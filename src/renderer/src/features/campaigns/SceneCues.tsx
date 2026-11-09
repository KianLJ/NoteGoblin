import type { SessionScene } from '@shared/sessionDeck'
import type { SavedEncounter } from '../../data/savedEncounters'
import { MUSIC_LIBRARY } from '../../data/musicLibrary'
import { getCustomTracks } from '../audio/customMusicStore'
import { pickMood, playSpecificTrack } from '../audio/musicEngine'
import { resolveEncounterMonsters } from './SessionTimeline'

/** A mood's name, for a scene card or cue tile. */
export function moodLabel(moodId: string | null): string | null {
  return moodId ? (MUSIC_LIBRARY.find((g) => g.id === moodId)?.label ?? null) : null
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
 * A scene's cues, at the top of its note: two tiles, one for the encounter
 * it loads (who's in it, how much XP) and one for the music it plays (the
 * mood, a specific track or a random one, with a preview). An empty tile
 * invites you to pick one; each tile's picker is the whole tile.
 */
export function SceneCues({
  scene,
  encounters,
  onChange
}: {
  scene: SessionScene
  encounters: SavedEncounter[]
  onChange: (patch: Partial<Pick<SessionScene, 'encounterId' | 'moodId' | 'trackId'>>) => void
}): JSX.Element {
  const encounter = scene.encounterId ? encounters.find((e) => e.id === scene.encounterId) : undefined
  const enc = encounter ? summary(encounter) : null
  const mood = moodLabel(scene.moodId)
  const tracks = scene.moodId ? [...(MUSIC_LIBRARY.find((g) => g.id === scene.moodId)?.tracks ?? []), ...getCustomTracks(scene.moodId)] : []
  const track = scene.trackId ? tracks.find((t) => t.id === scene.trackId) : undefined
  const moods = MUSIC_LIBRARY.filter((g) => g.tracks.length > 0 || getCustomTracks(g.id).length > 0)

  return (
    <div className="gb-cues">
      <div className={encounter ? 'gb-cue gb-cue--fight gb-cue--set' : 'gb-cue gb-cue--fight'}>
        <span className="gb-cue-icon" aria-hidden="true">
          ⚔
        </span>
        <div className="gb-cue-body">
          <span className="gb-cue-kind">Encounter</span>
          <span className="gb-cue-name">{encounter ? encounter.name : encounters.length ? 'Pick an encounter…' : 'Save one in the encounter builder'}</span>
          {enc && (
            <span className="gb-cue-detail">
              {enc.text} · {enc.xp.toLocaleString()} XP
            </span>
          )}
        </div>
        <select
          className="gb-cue-picker"
          value={scene.encounterId ?? ''}
          onChange={(e) => onChange({ encounterId: e.target.value || null })}
          aria-label="Encounter for this scene"
          disabled={!encounters.length}
        >
          <option value="">No encounter</option>
          {encounters.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        {encounter && (
          <button type="button" className="gb-cue-clear" onClick={() => onChange({ encounterId: null })} aria-label="Remove the encounter" title="Remove the encounter">
            ×
          </button>
        )}
      </div>

      <div className={mood ? 'gb-cue gb-cue--music gb-cue--set' : 'gb-cue gb-cue--music'}>
        <span className="gb-cue-icon" aria-hidden="true">
          ♪
        </span>
        <div className="gb-cue-body">
          <span className="gb-cue-kind">Music</span>
          <span className="gb-cue-name">{mood ?? 'Pick a mood…'}</span>
          {mood && <span className="gb-cue-detail">{track ? track.title : 'A random track from this mood'}</span>}
        </div>
        <select
          className="gb-cue-picker"
          value={scene.moodId ?? ''}
          onChange={(e) => onChange({ moodId: e.target.value || null, trackId: null })}
          aria-label="Music mood for this scene"
        >
          <option value="">No music</option>
          {moods.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        {mood && (
          <div className="gb-cue-extra">
            <select className="gb-cue-track" value={scene.trackId ?? ''} onChange={(e) => onChange({ trackId: e.target.value || null })} aria-label="Track">
              <option value="">Random track</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="gb-cue-preview"
              title="Listen here — the table doesn't hear it"
              onClick={() => (scene.trackId ? playSpecificTrack(scene.trackId, 800, null) : pickMood(scene.moodId!, 800, null))}
            >
              ▶
            </button>
            <button type="button" className="gb-cue-clear" onClick={() => onChange({ moodId: null, trackId: null })} aria-label="Remove the music" title="Remove the music">
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
