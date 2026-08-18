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
 * Read-only mirror of the DM's initiative tracker — whose turn it is and
 * that enemies exist, but never a monster's real name, exact HP, or
 * position on the DM's own list; sanitizeForPlayer (shared/encounter.ts)
 * already stripped all of that server-side before this ever arrives, so
 * there's nothing left here to accidentally leak.
 */
export function PlayerInitiativeView({ sessionId }: PlayerInitiativeViewProps): JSX.Element {
  const [state, setState] = useState<PlayerVisibleInitiativeState | null>(null)

  useEffect(() => {
    return window.goblin.initiative.onUpdate((update) => {
      if (update.sessionId === sessionId) setState(update.state)
    })
  }, [sessionId])

  if (!state || state.combatants.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 'var(--space-3)' }}>No encounter in progress.</p>
  }

  const inCombat = state.turnIndex >= 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 'var(--space-2)' }}>
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            borderColor: inCombat && i === state.turnIndex ? 'var(--accent)' : undefined,
            background: inCombat && i === state.turnIndex ? 'var(--accent-subtle)' : undefined
          }}
        >
          <span style={{ fontSize: 13, fontWeight: c.isSelf ? 700 : 400 }}>
            {c.name}
            {c.isSelf && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (you)</span>}
          </span>
          {c.kind === 'monster' && (
            <span style={{ fontSize: 11, fontWeight: 700, color: INJURY_COLOR[c.injury] }}>{INJURY_LABELS[c.injury]}</span>
          )}
        </div>
      ))}
    </div>
  )
}
