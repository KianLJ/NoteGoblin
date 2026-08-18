import { useEffect, useState, type CSSProperties } from 'react'
import { DIE_SIDES, formatBreakdown, formatFormula, type DiceGroup, type DiceRollLogEntry, type DieSides } from '@shared/dice'
import { Button } from '../../ui/Button'
import { ensureDiceLogListening, getDiceLog, performRoll, subscribeDiceLog } from './diceLogStore'

interface DiceTrayProps {
  /** The hosted (DM) or joined (player) session id — null when neither, in which case the tray still rolls and logs locally, it just has no one to share with. */
  sessionId: string | null
}

const EMPTY_POOL: Record<DieSides, number> = { 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 }

/**
 * A shared dice roller — one labeled button per standard die type, a
 * modifier, and an optional "private roll" toggle, plus a log of every roll
 * anyone at the table has made since opening this tab. Identical component
 * for the DM (RightPanel.tsx) and every player (PartySidebar.tsx); the only
 * difference is which `sessionId` gets passed in, which just changes who
 * `window.goblin.dice.broadcast` reaches on the other end (see
 * shared/dice.ts and sessionHost.ts for the DM-is-the-hub relay shape).
 *
 * The log is intentionally not persisted or caught-up-on-join — it's
 * whatever's been rolled since this tray mounted, same "ephemeral, session-
 * scoped" tradeoff the Initiative tracker makes. Your own rolls append
 * immediately (no round trip needed to see your own result); everyone
 * else's arrive via `onRoll` as they happen.
 */
export function DiceTray({ sessionId }: DiceTrayProps): JSX.Element {
  const [pool, setPool] = useState<Record<DieSides, number>>(EMPTY_POOL)
  const [modifier, setModifier] = useState(0)
  const [isPrivate, setIsPrivate] = useState(false)
  const [log, setLog] = useState<DiceRollLogEntry[]>(() => getDiceLog())
  const [myId, setMyId] = useState('me')
  const [myName, setMyName] = useState('You')

  useEffect(() => {
    window.goblin.identity.getCurrent().then((identity) => {
      if (identity) {
        setMyId(identity.id)
        setMyName(identity.displayName)
      }
    })
  }, [])

  // The log itself lives outside React (see diceLogStore.ts) — a roll can
  // originate here or from an inline `dice: ...` click in a note, and both
  // need to land in the same place. This just mirrors that shared store
  // into local state so it re-renders when either source appends to it.
  useEffect(() => {
    ensureDiceLogListening()
    return subscribeDiceLog(() => setLog(getDiceLog()))
  }, [])

  function addDie(sides: DieSides): void {
    setPool((prev) => ({ ...prev, [sides]: prev[sides] + 1 }))
  }

  function removeDie(sides: DieSides): void {
    setPool((prev) => ({ ...prev, [sides]: Math.max(0, prev[sides] - 1) }))
  }

  function clearPool(): void {
    setPool(EMPTY_POOL)
  }

  const groups: DiceGroup[] = DIE_SIDES.filter((sides) => pool[sides] > 0).map((sides) => ({ sides, count: pool[sides] }))
  const canRoll = groups.length > 0 || modifier !== 0

  function roll(): void {
    if (!canRoll) return
    performRoll(sessionId, myId, myName, groups, modifier, isPrivate)
    clearPool()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="gb-label" style={{ margin: 0 }}>
          Roll Dice
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DIE_SIDES.map((sides) => (
            <button key={sides} type="button" onClick={() => addDie(sides)} style={dieButtonStyle} title={`Add a d${sides}`}>
              d{sides}
              {pool[sides] > 0 && <span style={dieCountBadgeStyle}>{pool[sides]}</span>}
            </button>
          ))}
        </div>

        {groups.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {groups.map((g) => (
              <span key={g.sides} className="gb-badge" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                {g.count}d{g.sides}
                <button type="button" onClick={() => removeDie(g.sides)} style={removeChipBtnStyle} title={`Remove one d${g.sides}`}>
                  ×
                </button>
              </span>
            ))}
            <button type="button" onClick={clearPool} style={{ ...removeChipBtnStyle, fontSize: 11, color: 'var(--text-muted)' }}>
              Clear
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
            Modifier
            <input
              type="number"
              className="gb-input"
              value={modifier}
              onChange={(e) => setModifier(Number(e.target.value) || 0)}
              style={{ width: 56, fontSize: 12, padding: '3px 6px' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            Private roll
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="primary" onClick={roll} disabled={!canRoll} style={{ flex: 1 }}>
            {groups.length > 0 || modifier !== 0 ? `Roll ${formatFormula(groups, modifier)}` : 'Roll'}
          </Button>
        </div>
        {isPrivate && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            Everyone else will only see that you rolled — the result stays visible to you alone.
          </p>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {log.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 'var(--space-2)' }}>No rolls yet.</p>}
        {log.map((entry) => (
          <RollLogRow key={entry.id} entry={entry} isMine={entry.rollerId === myId} />
        ))}
      </div>
    </div>
  )
}

function RollLogRow({ entry, isMine }: { entry: DiceRollLogEntry; isMine: boolean }): JSX.Element {
  const masked = entry.private && entry.total === null && !isMine
  const time = new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <div className="gb-card" style={{ padding: 'var(--space-2) var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>{entry.rollerName}</strong>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>rolled {entry.formula}</span>
        {entry.private && (
          <span className="gb-badge" style={{ fontSize: 10 }}>
            Private
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{time}</span>
      </div>
      {masked ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0', fontStyle: 'italic' }}>Result hidden — private roll.</p>
      ) : (
        entry.total !== null && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{entry.total}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatBreakdown(entry)}</span>
          </div>
        )
      )}
    </div>
  )
}

const dieButtonStyle: CSSProperties = {
  position: 'relative',
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface-raised)',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer'
}

const dieCountBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -6,
  background: 'var(--accent)',
  color: 'var(--accent-contrast, #fff)',
  borderRadius: '999px',
  fontSize: 10,
  fontWeight: 700,
  minWidth: 16,
  height: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 3px'
}

const removeChipBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  padding: 0,
  fontSize: 13,
  lineHeight: 1
}
