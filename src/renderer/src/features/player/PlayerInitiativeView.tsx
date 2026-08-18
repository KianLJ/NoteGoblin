import { useEffect, useState } from 'react'
import { INJURY_LABELS, type InjuryLevel, type PlayerVisibleInitiativeState } from '@shared/encounter'

interface PlayerInitiativeViewProps {
  sessionId: string | null
}

const INJURY_COLOR: Record<InjuryLevel, string> = {
  undamaged: 'var(--success)',
  moderate: 'var(--accent)',
  bloodied: 'var(--accent)',
  severe: 'var(--danger)',
  critical: 'var(--danger)'
}

/**
 * Read-only mirror of the DM's initiative tracker, except for one thing you
 * can write: your own initiative roll. Everyone's real name and turn order
 * are visible, and a fellow player's real HP — but a monster's HP only ever
 * shows as an injury-level band, never the exact number (see
 * sanitizeForPlayer in shared/encounter.ts, which strips that server-side
 * before this ever arrives).
 */
export function PlayerInitiativeView({ sessionId }: PlayerInitiativeViewProps): JSX.Element {
  const [state, setState] = useState<PlayerVisibleInitiativeState | null>(null)
  const [myInitiativeDraft, setMyInitiativeDraft] = useState('')

  useEffect(() => {
    return window.goblin.initiative.onUpdate((update) => {
      if (update.sessionId === sessionId) setState(update.state)
    })
  }, [sessionId])

  function submitMyInitiative(): void {
    const value = myInitiativeDraft.trim() === '' ? null : Number(myInitiativeDraft)
    void window.goblin.initiative.setMine(Number.isNaN(value) ? null : value)
  }

  if (!state || state.combatants.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 'var(--space-3)' }}>No encounter in progress.</p>
  }

  const inCombat = state.turnIndex >= 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          className="gb-input"
          placeholder="Your initiative"
          value={myInitiativeDraft}
          onChange={(e) => setMyInitiativeDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitMyInitiative()}
          onBlur={submitMyInitiative}
          style={{ fontSize: 12, flex: 1 }}
        />
      </div>

      {inCombat && (
        <div className="gb-card" style={{ padding: 'var(--space-2)', textAlign: 'center', fontSize: 12 }}>
          <div style={{ fontWeight: 700 }}>Round {state.round}</div>
          <div style={{ color: 'var(--accent)' }}>{state.combatants[state.turnIndex]?.name ?? '—'}'s turn</div>
        </div>
      )}
      {state.combatants.map((c, i) => (
        <div
          key={c.id}
          className="gb-card"
          style={{
            padding: '6px 8px',
            opacity: c.dead ? 0.6 : 1,
            borderColor: inCombat && i === state.turnIndex ? 'var(--accent)' : undefined,
            background: inCombat && i === state.turnIndex ? 'var(--accent-subtle)' : undefined
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: c.isSelf ? 700 : 400 }}>
              {c.name}
              {c.isSelf && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (you)</span>}
              {c.dead && (
                <span className="gb-badge" style={{ marginLeft: 6, fontSize: 9, color: 'var(--danger)' }}>
                  Dead
                </span>
              )}
            </span>
            {!c.dead &&
              (c.kind === 'player' ? (
                c.currentHp !== null && c.maxHp !== null && (
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {c.currentHp} / {c.maxHp} HP
                  </span>
                )
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: INJURY_COLOR[c.injury] }}>{INJURY_LABELS[c.injury]}</span>
              ))}
          </div>
          {c.deathSaves && (
            <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
              <span>
                Successes: <strong style={{ color: 'var(--success)' }}>{c.deathSaves.successes}</strong>/3
              </span>
              <span>
                Failures: <strong style={{ color: 'var(--danger)' }}>{c.deathSaves.failures}</strong>/3
              </span>
            </div>
          )}
          {c.statusEffects.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {c.statusEffects.map((effect) => (
                <span key={effect} className="gb-badge" style={{ fontSize: 9 }}>
                  {effect}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
