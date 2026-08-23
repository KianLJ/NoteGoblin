import { useEffect, useState } from 'react'
import { formatBreakdown, type DiceRollLogEntry } from '@shared/dice'
import { performCheckRoll, performRoll } from './diceLogStore'
import { dequeueRollAnimation, getRollAnimationQueue, resolvePendingRoll, subscribeRollAnimation } from './rollAnimationStore'

const SPIN_MS = 1300
const FLICKER_INTERVAL_MS = 220
// The tip is two visible stages, not one: the last flickered number tips
// away first, then the real result tips in — otherwise there's nothing to
// actually watch happen during the "tip," just a long pause before the
// answer appears. Durations here must match the .gb-digit-tip-out/-in CSS
// animations in global.css.
const TIP_OUT_MS = 750
const TIP_IN_MS = 750
const REVEAL_AT_MS = SPIN_MS + TIP_OUT_MS + TIP_IN_MS

const MUTED_RGB: [number, number, number] = [107, 101, 88]
const BRIGHT_RGB: [number, number, number] = [243, 233, 220]

/** Muted grey early in the roll, brightening toward cream as it settles — `t` is 0 (just started) to 1 (about to tip to the real number). */
function flickerColor(t: number): string {
  const [r, g, b] = MUTED_RGB.map((c, i) => Math.round(c + (BRIGHT_RGB[i] - c) * t))
  return `rgb(${r}, ${g}, ${b})`
}

/** Whether the die that actually counted toward the total came up its max/min face — only meaningful for a d20 check roll, which is the only thing that ever reaches this overlay (see useSheetRoller.ts/ForceRollPrompt.tsx). */
function naturalRoll(entry: DiceRollLogEntry): 'crit' | 'fumble' | null {
  const group = entry.groups?.[0]
  if (!group || group.sides !== 20) return null
  const kept = entry.advantage === 'disadvantage' ? Math.min(...group.results) : Math.max(...group.results)
  if (kept === 20) return 'crit'
  if (kept === 1) return 'fumble'
  return null
}

type Phase = 'rolling' | 'tipping-out' | 'tipping-in' | 'revealed'

/**
 * The Baldur's Gate 3-style dramatic roll popup. Two top-level modes:
 *
 * - **Pending** (a sheet button was clicked): the die just sits there,
 *   waiting for a second, deliberate click on it — a misclick on the sheet
 *   should never burn a real roll. Right-clicking the sheet button already
 *   chose advantage/disadvantage before this ever opened (see OverviewTab.tsx's
 *   RollButton), so there's nothing left to configure here.
 * - **Rolled** (either the pending die was just clicked, or the queued item
 *   arrived already-rolled — see rollAnimationStore.ts): while it tumbles,
 *   random muted numbers flicker past, brightening as the spin winds down,
 *   then a slow, deliberate tip carries the last flickered number over to
 *   the real result before the full reveal (glow, crit/fumble, DC badge).
 *   Stays up until clicked away; there's no auto-dismiss, since a DC/crit
 *   result is exactly the kind of thing you don't want to miss by looking
 *   away for a second.
 *
 * Mounted once, high up (AppShell.tsx), driven by rollAnimationStore's queue
 * rather than props — the trigger and this overlay are unrelated component
 * trees, same reasoning as diceLogStore.ts.
 */
export function RollAnimationOverlay(): JSX.Element | null {
  const [queue, setQueue] = useState(() => getRollAnimationQueue())
  const [phase, setPhase] = useState<Phase>('rolling')
  const [displayValue, setDisplayValue] = useState<number | null>(null)
  const [flickerT, setFlickerT] = useState(0)

  useEffect(() => subscribeRollAnimation(() => setQueue(getRollAnimationQueue())), [])

  const current = queue[0]
  const rolledEntry = current?.kind === 'rolled' ? current.entry : null
  const rolledId = rolledEntry?.id ?? null
  const total = rolledEntry?.total ?? null
  // The largest die actually rolled (20 for every check/save/skill/attack,
  // whatever the weapon/spell's real damage dice are for a damage roll) —
  // flickering a 19 while a d6 damage roll settles would be a giveaway that
  // the flicker isn't real, so it needs to respect the actual die in play.
  const flickerSides = rolledEntry?.groups?.length ? Math.max(...rolledEntry.groups.map((g) => g.sides)) : 20

  useEffect(() => {
    if (!rolledId || total === null) {
      setPhase('rolling')
      setDisplayValue(null)
      setFlickerT(0)
      return
    }
    setPhase('rolling')
    setFlickerT(0)
    setDisplayValue(1 + Math.floor(Math.random() * flickerSides))

    const start = Date.now()
    const flickerTimer = setInterval(() => {
      setDisplayValue(1 + Math.floor(Math.random() * flickerSides))
      setFlickerT(Math.min(1, (Date.now() - start) / SPIN_MS))
    }, FLICKER_INTERVAL_MS)

    // Stage 1: whatever number was showing when the spin stopped holds still,
    // then visibly tips away — this is what makes "the closest number"
    // legible at all, instead of just vanishing under the real answer.
    const tipOutTimer = setTimeout(() => {
      clearInterval(flickerTimer)
      setFlickerT(1)
      setPhase('tipping-out')
    }, SPIN_MS)

    // Stage 2: the real result tips in from the other side.
    const tipInTimer = setTimeout(() => {
      setDisplayValue(total)
      setPhase('tipping-in')
    }, SPIN_MS + TIP_OUT_MS)

    const revealTimer = setTimeout(() => setPhase('revealed'), REVEAL_AT_MS)

    return () => {
      clearInterval(flickerTimer)
      clearTimeout(tipOutTimer)
      clearTimeout(tipInTimer)
      clearTimeout(revealTimer)
    }
  }, [rolledId, total, flickerSides])

  if (!current) return null

  function triggerPendingRoll(): void {
    if (current.kind === 'pending-check') {
      const entry = performCheckRoll(current.sessionId, current.rollerId, current.rollerName, current.modifier, current.advantage, false, current.label, current.dc)
      resolvePendingRoll(entry)
    } else if (current.kind === 'pending-damage') {
      const entry = performRoll(current.sessionId, current.rollerId, current.rollerName, current.groups, current.modifier, false)
      resolvePendingRoll({ ...entry, label: current.label })
    }
  }

  const isPending = current.kind !== 'rolled'
  const entry = rolledEntry
  const label = current.kind !== 'rolled' ? current.label : entry?.label
  const revealed = phase === 'revealed'
  const dieAnimationClass =
    phase === 'rolling' ? 'gb-die-tumble' : phase === 'tipping-out' || phase === 'tipping-in' ? 'gb-die-settle' : undefined

  // A natural 20/1 has no special RAW meaning against a DC (that's an
  // attack-roll-only rule) — showing "CRITICAL!" right next to "DC —
  // Failure" (e.g. rolling with advantage, keeping a natural 20 on one die,
  // but the total with modifiers still misses the DC) reads as a flat
  // contradiction, so the banner only shows for a roll with no target
  // number to fail against (attacks, or a plain sheet check with no forced
  // DC) — see naturalRoll's own doc comment for the "only ever a d20 check
  // roll" scope this already assumes.
  const natural = entry && revealed && entry.dc == null ? naturalRoll(entry) : null
  const passFail = entry && revealed && entry.dc != null && entry.total != null ? (entry.total >= entry.dc ? 'success' : 'failure') : null

  const dieColor = natural === 'crit' ? 'var(--success)' : natural === 'fumble' || passFail === 'failure' ? 'var(--danger)' : 'var(--accent)'
  const numberColor = revealed ? dieColor : phase === 'rolling' ? flickerColor(flickerT) : '#f3e9dc'

  return (
    <div
      className="gb-roll-backdrop-in"
      onClick={() => {
        if (!isPending && revealed) dequeueRollAnimation()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-4)',
        background: 'radial-gradient(circle at 50% 45%, rgba(40, 30, 20, 0.72), rgba(10, 8, 6, 0.88))',
        cursor: !isPending && revealed ? 'pointer' : 'default'
      }}
    >
      {label && (
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 30,
            fontWeight: 600,
            color: '#f3e9dc',
            textAlign: 'center',
            letterSpacing: '0.02em'
          }}
        >
          {label}
        </div>
      )}

      <div
        onClick={(e) => {
          if (isPending) {
            e.stopPropagation()
            triggerPendingRoll()
          }
        }}
        style={{ position: 'relative', width: 260, height: 260, cursor: isPending ? 'pointer' : 'default' }}
      >
        {/* The rotation lives on this inner wrapper alone — the number below
            is a sibling, not a descendant, so it stays upright and legible
            the whole time instead of spinning (and briefly turning sideways/
            upside-down) along with the die. */}
        <div key={entry?.id ?? (current.kind !== 'rolled' ? current.id : undefined)} className={isPending ? 'gb-die-idle-pulse' : dieAnimationClass}>
          <svg viewBox="0 0 100 100" width={260} height={260} style={{ filter: revealed ? `drop-shadow(0 0 28px ${dieColor})` : 'none' }}>
            <polygon
              points="50,3 93,26 93,74 50,97 7,74 7,26"
              fill="rgba(24, 18, 12, 0.9)"
              stroke={revealed ? dieColor : isPending ? 'var(--accent)' : '#8a7256'}
              strokeWidth={3}
            />
            <polygon points="50,3 93,26 50,49 7,26" fill="rgba(255,255,255,0.06)" />
          </svg>
        </div>
        {displayValue !== null && (
          <div
            key={phase === 'rolling' ? `flicker-${displayValue}` : phase}
            className={
              phase === 'rolling' ? 'gb-digit-flicker' : phase === 'tipping-out' ? 'gb-digit-tip-out' : phase === 'tipping-in' ? 'gb-digit-tip-in' : undefined
            }
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontSize: 60,
              fontWeight: 700,
              color: numberColor
            }}
          >
            <span className={natural === 'fumble' ? 'gb-roll-shake' : undefined}>{displayValue}</span>
          </div>
        )}
      </div>

      {isPending && <div style={{ fontSize: 16, color: '#cbb996', fontWeight: 600 }}>Click the die to roll</div>}

      {revealed && entry && (
        <div className="gb-roll-pop-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          {natural && (
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: dieColor, letterSpacing: '0.04em' }}>
              {natural === 'crit' ? 'CRITICAL!' : 'FUMBLE!'}
            </div>
          )}
          <div style={{ fontSize: 16, color: '#cbb996' }}>
            {entry.formula} — {formatBreakdown(entry)}
          </div>
          {passFail && (
            <div
              className="gb-badge"
              style={{
                marginTop: 4,
                fontSize: 14,
                fontWeight: 700,
                color: passFail === 'success' ? 'var(--success)' : 'var(--danger)',
                borderColor: passFail === 'success' ? 'var(--success)' : 'var(--danger)'
              }}
            >
              DC {entry.dc} — {passFail === 'success' ? 'Success' : 'Failure'}
            </div>
          )}
          <div style={{ fontSize: 13, color: '#9c8a6c', marginTop: 10 }}>Click to dismiss</div>
        </div>
      )}
    </div>
  )
}
