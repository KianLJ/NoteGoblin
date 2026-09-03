import { useEffect, useRef, useState } from 'react'
import { formatBreakdown, formatModifierTerm, rollDie, sumGroupResults, type DiceRollLogEntry } from '@shared/dice'
import { playSfx } from '../audio/soundEffects'
import { performCheckRoll, performRoll } from './diceLogStore'
import { dequeueRollAnimation, getRollAnimationQueue, resolvePendingRoll, subscribeRollAnimation } from './rollAnimationStore'

const SPIN_MS = 1300
const FLICKER_INTERVAL_MS = 220
// An advantage/disadvantage roll gets two extra stages before settling: both
// real d20 faces sit still side by side for a beat (HOLD_MS — long enough to
// actually read a "3 vs 20" before anything moves), then the one that didn't
// count flies off-screen while the one that did glides to center. DISCARD_MS
// gives the discard's own 600ms CSS transition (see renderDieFace) a
// comfortable margin before the paired layout gets torn down and swapped
// for the single kept die — too tight a margin there used to let the
// dropped die's exit visibly get cut off mid-flight/fade.
const HOLD_MS = 900
const DISCARD_MS = 750
// Each die's own little flicker, played after it's individually clicked —
// see clickDie below. A fixed number of ticks chained with their own
// setTimeout each, rather than a separate setInterval running alongside an
// unrelated setTimeout for "stop now" — those are two independent timers
// that can drift relative to each other, which was letting one extra random
// frame flash for a moment between the "last" flicker tick and the actual
// reveal. Chaining ties the last tick and the reveal into the exact same
// timer sequence, so the transition is immediate with nothing in between.
// Ticks at the same cadence as the plain single-die suspense flicker
// (FLICKER_INTERVAL_MS) and runs for close to the same total duration
// (SPIN_MS) — a dis/adv roll's own per-die suspense used to be noticeably
// shorter than a plain roll's, which read as rushed by comparison.
const CLICK_FLICKER_TICK_MS = FLICKER_INTERVAL_MS
const CLICK_FLICKER_TICKS = Math.round(SPIN_MS / FLICKER_INTERVAL_MS)
// The roll shows the raw die (or dice) result first, on its own — no
// modifier baked in — then, after a short beat to actually read that raw
// number (SETTLE_PAUSE_MS), a "+5"/"−2" chip fades in (its own short CSS
// animation, see renderModifierChip) and flies in from a random angle to
// land on the die (MODIFIER_FLY_MS), at which point the number swaps from
// raw to the real total. Only plays when there's a nonzero modifier to show
// off; otherwise the raw number already *is* the total and the roll
// reveals immediately. MODIFIER_FLY_MS is the chip's own inline transition
// duration, and is set to line up with the 'whoosh' sound cue's own impact
// (started the instant the flight begins, in the same effect that flips
// modifierArrived) — the clip runs ~2.6s total but its actual punch lands
// at ~0.2s in, so the chip's flight is timed to that, not the clip's full
// length; the rest of the clip is just left to trail out afterward.
const SETTLE_PAUSE_MS = 450
const MODIFIER_FLY_MS = 200
const MODIFIER_POP_MS = 350

const MUTED_RGB: [number, number, number] = [107, 101, 88]
const BRIGHT_RGB: [number, number, number] = [243, 233, 220]

/** Muted grey early in the roll, brightening toward cream as it settles — `t` is 0 (just started) to 1 (about to tip to the real number). */
function flickerColor(t: number): string {
  const [r, g, b] = MUTED_RGB.map((c, i) => Math.round(c + (BRIGHT_RGB[i] - c) * t))
  return `rgb(${r}, ${g}, ${b})`
}

/** The d20 face that actually counted toward the total (kept die, for advantage/disadvantage) — null for anything that isn't a d20 check roll (pooled damage dice, a save with a d20 the caller never gave us in this shape, etc). */
function rawD20Face(entry: DiceRollLogEntry): number | null {
  const group = entry.groups?.[0]
  if (!group || group.sides !== 20) return null
  return entry.advantage === 'disadvantage' ? Math.min(...group.results) : Math.max(...group.results)
}

/** Whether the die that actually counted toward the total came up its max/min face — only meaningful for a d20 check roll, which is the only thing that ever reaches this overlay (see useSheetRoller.ts/ForceRollPrompt.tsx). */
function naturalRoll(entry: DiceRollLogEntry): 'crit' | 'fumble' | null {
  const raw = rawD20Face(entry)
  if (raw === 20) return 'crit'
  if (raw === 1) return 'fumble'
  return null
}

/**
 * True for a natural 20/1 with no DC in play — same gating the crit/fumble
 * banner itself uses (see naturalRoll's doc comment for why a DC changes
 * that). A roll like this skips the modifier fly-in entirely (see the three
 * reveal effects below): the raw 20/1 IS the dramatic moment, and morphing
 * it into a lower/higher number via the modifier right after would undercut
 * that — the modifier is still correctly counted in the actual total and
 * shown in the breakdown text underneath, just not re-litigated on the die
 * itself.
 */
function isCritOrFumble(entry: DiceRollLogEntry): boolean {
  return entry.dc == null && naturalRoll(entry) !== null
}

const ROLL_RED: [number, number, number] = [214, 76, 76]
const ROLL_GREY: [number, number, number] = [150, 150, 150]
const ROLL_GREEN: [number, number, number] = [86, 176, 104]
const ROLL_PURPLE = '#a855f7'

/**
 * How "good" a raw d20 face was, at a glance — deep red near 1, fading to a
 * boring grey around 10, brightening toward green as it climbs to 20. A
 * true natural 20 (crit) and natural 1 (fumble) still get their own
 * saturated colors via naturalRoll/dieColor; this fills in everything in
 * between with a continuous gradient instead of only the two extremes ever
 * standing out. Only meaningful when there's no DC to fail against (see
 * dieColor's own gating) — a raw face colored on its own merits would read
 * as a contradiction next to a plain pass/fail result.
 */
function rawRollColor(raw: number): string {
  const t = (Math.min(20, Math.max(1, raw)) - 1) / 19
  const [from, to, localT] = t <= 0.5 ? [ROLL_RED, ROLL_GREY, t / 0.5] : [ROLL_GREY, ROLL_GREEN, (t - 0.5) / 0.5]
  const mix = (i: number) => Math.round(from[i] + (to[i] - from[i]) * localT)
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`
}

/** The 'result' cue's pitch for a given raw d20 face — deep/low for a bad roll, climbing to a brighter/higher pitch for a good one, same 1-20 scale rawRollColor uses. A roll with no such face (pooled damage dice, etc.) just plays at the natural pitch. */
function resultPitch(raw: number | null): number {
  if (raw === null) return 1
  const t = (Math.min(20, Math.max(1, raw)) - 1) / 19
  return 0.82 + t * 0.5
}

/** True for a check roll where two d20s were actually rolled and one was dropped — the only case that gets the two-dice discard choreography instead of the plain single-die tip. */
function isDualDieRoll(entry: DiceRollLogEntry | null): boolean {
  return !!(entry?.advantage && entry.advantage !== 'normal' && entry.groups?.length === 1 && entry.groups[0].results.length === 2)
}

type Phase = 'awaiting' | 'rolling' | 'holding' | 'discarding' | 'settled' | 'modifier-in' | 'revealed'

// Standard ease-in-quint curve — the chip sits almost still for most of its
// flight, then rockets in and slams into the die right at the end, instead
// of drifting in at a constant speed the whole way.
const MODIFIER_EASE = 'cubic-bezier(0.755, 0.05, 0.855, 0.06)'

/**
 * The "+5"/"−2" chip that appears once the raw die result has settled. Its
 * entrance (a quick fade-in right where it starts) is a plain CSS animation
 * on the *outer* wrapper — always runs reliably on mount, independent of
 * React state/render timing. Its later flight to the die and fade-out
 * (`arrived` false→true, flipped a frame after mount so the browser has an
 * actual prior state to transition away from) is a separate transition on
 * the *inner* element, so the two never end up fighting over the same
 * element's opacity mid-animation the way a single shared opacity value
 * driven by two different timings did before.
 */
function renderModifierChip(props: { modifier: number; angle: number; arrived: boolean }): JSX.Element {
  const { modifier, angle, arrived } = props
  const distance = 260
  const startX = Math.cos(angle) * distance
  const startY = Math.sin(angle) * distance
  const x = arrived ? 0 : startX
  const y = arrived ? 0 : startY
  return (
    <div
      className="gb-modifier-fade-in"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${arrived ? 0.45 : 1})`,
        transition: `transform ${MODIFIER_FLY_MS}ms ${MODIFIER_EASE}`,
        pointerEvents: 'none'
      }}
    >
      <div
        style={{
          opacity: arrived ? 0 : 1,
          transition: `opacity ${MODIFIER_FLY_MS}ms ${MODIFIER_EASE}`,
          fontFamily: 'var(--font-display)',
          fontSize: 52,
          fontWeight: 700,
          color: 'var(--accent)',
          textShadow: '0 2px 14px rgba(0, 0, 0, 0.7)'
        }}
      >
        {formatModifierTerm(modifier).replace(/^([+-]) /, '$1')}
      </div>
    </div>
  )
}

/**
 * One die of an advantage/disadvantage pair. Covers its whole lifecycle in
 * one continuously-mounted element — from sitting idle waiting for its own
 * click ('awaiting', unclicked), through the flicker suspense on a
 * defensive already-rolled entry ('rolling', see the "Rolled" mode doc
 * below), to sitting frozen on its real face next to its twin ('awaiting'
 * once clicked, or 'holding'), to gliding to center or flying off
 * ('discarding'). Never remounts across that whole stretch, so the CSS
 * transition on transform/opacity actually gets to animate instead of
 * snapping straight to its end state.
 */
function renderDieFace(props: {
  value: number | null
  /** True while this specific die is playing its own post-click flicker (see clickDie) — independent of the shared `phase`, since the other die may still be sitting untouched or mid-spin at the same time. */
  spinning?: boolean
  /** The random face to show while `spinning` is true; ignored otherwise. */
  spinFlicker?: number | null
  side: 'left' | 'right'
  isKept: boolean
  phase: Phase
  flickerT: number
  onClick?: () => void
}): JSX.Element {
  const { value, spinning = false, spinFlicker = null, side, isKept, phase, flickerT, onClick } = props
  const sign = side === 'left' ? -1 : 1
  const awaiting = phase === 'awaiting'
  const flickering = phase === 'rolling' || spinning
  const sideBySide = flickering || awaiting || phase === 'holding'
  const discarding = phase === 'discarding'
  const clickable = awaiting && value === null && !spinning && !!onClick
  const shown = spinning ? spinFlicker : value

  // Sitting side by side (awaiting/rolling/holding), each die stays fully
  // confined to its own half of the container — no extra offset needed,
  // and critically no overlap with its twin's half, since that overlap
  // used to mean whichever die rendered later in the DOM silently ate every
  // click in the shared middle strip regardless of which die was actually
  // visible there (the "one click rolls the other die instead, or does
  // nothing" bug). Only 'discarding' needs a deliberate translateX: the
  // kept die crosses into the container's true center, the dropped one
  // keeps going well past its own half and off toward the edge of the
  // screen — a large, unambiguous throw rather than a subtle drift, so
  // there's no missing that it actually left.
  const translateX = discarding ? (isKept ? -sign * 105 : sign * 340) : 0
  const scale = sideBySide ? 0.72 : discarding ? (isKept ? 1 : 0.3) : 1
  const rotate = discarding && !isKept ? sign * 110 : 0
  const opacity = discarding && !isKept ? 0 : 1

  return (
    <div
      onClick={
        clickable
          ? (e) => {
              e.stopPropagation()
              onClick!()
            }
          : undefined
      }
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: '50%',
        left: side === 'left' ? 0 : '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `translateX(${translateX}px) scale(${scale}) rotate(${rotate}deg)`,
        opacity,
        cursor: clickable ? 'pointer' : 'default',
        // The transform runs the full 600ms (must stay comfortably shorter
        // than DISCARD_MS, which decides when this whole paired layout gets
        // torn down and swapped for the single kept die — too tight a
        // margin there let the exit get visibly cut off mid-fade).
        transition: 'transform 600ms cubic-bezier(0.3, 0.6, 0.35, 1), opacity 600ms ease-in'
      }}
    >
      <div style={{ position: 'relative', width: 260, height: 260 }}>
        <div className={phase === 'rolling' ? 'gb-die-tumble' : spinning ? 'gb-die-tumble-quick' : clickable ? 'gb-die-idle-pulse' : undefined}>
          <svg viewBox="0 0 100 100" width={260} height={260}>
            <polygon points="50,3 93,26 93,74 50,97 7,74 7,26" fill="rgba(24, 18, 12, 0.9)" stroke={clickable ? 'var(--accent)' : '#8a7256'} strokeWidth={3} />
            <polygon points="50,3 93,26 50,49 7,26" fill="rgba(255,255,255,0.06)" />
          </svg>
        </div>
        {shown !== null && (
          <div
            key={flickering ? `flicker-${shown}` : 'frozen'}
            className={flickering ? 'gb-digit-flicker' : undefined}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontSize: 60,
              fontWeight: 700,
              color: flickering ? flickerColor(phase === 'rolling' ? flickerT : 0.75) : '#f3e9dc'
            }}
          >
            <span>{shown}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The Baldur's Gate 3-style dramatic roll popup. Three top-level modes:
 *
 * - **Pending, normal** (a sheet button was clicked, no advantage/
 *   disadvantage in play): the die just sits there, waiting for a second,
 *   deliberate click on it — a misclick on the sheet should never burn a
 *   real roll.
 * - **Pending, advantage/disadvantage**: two dice sit there instead, each
 *   independently clickable — the player rolls whichever one they want,
 *   whenever they want, no forced order. The whole reveal from here on
 *   (both faces holding still, the dropped one flying off, the kept one
 *   tipping into the final total) is driven by local state the moment the
 *   second die lands, not by waiting on a round trip through the shared
 *   roll queue — see the "both dice landed" effect below.
 * - **Rolled** (the queued item arrived already-rolled — see
 *   rollAnimationStore.ts's queueRollAnimation, kept for a trigger that
 *   already had its own confirmation elsewhere): skips straight to the
 *   tumble — random muted numbers flicker past for a beat before settling
 *   (both dice at once, for an advantage/disadvantage roll), then the same
 *   hold/discard/tip-to-total reveal.
 *
 * Mounted once, high up (AppShell.tsx), driven by rollAnimationStore's queue
 * rather than props — the trigger and this overlay are unrelated component
 * trees, same reasoning as diceLogStore.ts.
 */
export function RollAnimationOverlay(): JSX.Element | null {
  const [queue, setQueue] = useState(() => getRollAnimationQueue())
  const [phase, setPhase] = useState<Phase>('rolling')
  const [displayValue, setDisplayValue] = useState<number | null>(null)
  // Only meaningful for a dual-die roll — the second die, shown alongside
  // the first through 'awaiting'/'rolling'/'holding'/'discarding', gone by
  // 'settled' since only the kept die (displayValue) carries on to the
  // final total.
  const [secondDisplayValue, setSecondDisplayValue] = useState<number | null>(null)
  const [flickerT, setFlickerT] = useState(0)
  // The entry built locally the moment both dice of a manual advantage/
  // disadvantage roll have landed — created (and immediately handed to
  // resolvePendingRoll) before the hold/discard/tip animation even starts,
  // so entry.total is already known for the final tip, and the "revealed"
  // info panel below has real formula/breakdown/DC data throughout. Cleared
  // whenever a fresh dual pending roll starts (see the 'awaiting' reset
  // effect).
  const [localEntry, setLocalEntry] = useState<DiceRollLogEntry | null>(null)
  // Guards the "both dice landed" effect against firing twice for the same
  // pending item (e.g. an extra render between the two setState calls).
  const resolvedIdRef = useRef<string | null>(null)
  // Guards the dual-roll sequence effect (below) against starting twice for
  // the same resolved entry.
  const dualEntrySequenceRef = useRef<string | null>(null)
  // Each pending die's own little flicker, played the moment it's clicked —
  // independent per die (side A/B), since the player can click either one
  // whenever they like without waiting on the other. `displayValue`/
  // `secondDisplayValue` only get their real face once that die's spin
  // finishes (see clickDie), which is what the "both dice landed" effect
  // above is actually watching for.
  const [spinA, setSpinA] = useState(false)
  const [spinB, setSpinB] = useState(false)
  const [spinFlickerA, setSpinFlickerA] = useState<number | null>(null)
  const [spinFlickerB, setSpinFlickerB] = useState<number | null>(null)
  const spinTimersRef = useRef<{ timeoutA?: ReturnType<typeof setTimeout>; timeoutB?: ReturnType<typeof setTimeout> }>({})
  // The modifier chip's random starting angle for this roll, and whether
  // it's been told to fly in to center yet — see the phase-triggered effect
  // below and renderModifierChip. Its entrance fade-in is a plain CSS
  // animation there, not state-driven, so there's nothing to track for it.
  const [modifierAngle, setModifierAngle] = useState(0)
  const [modifierArrived, setModifierArrived] = useState(false)

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

  const isDualFromQueue = isDualDieRoll(rolledEntry)
  const pendingId = current?.kind !== 'rolled' ? current?.id : undefined

  function clearSpinTimers(): void {
    const t = spinTimersRef.current
    if (t.timeoutA) clearTimeout(t.timeoutA)
    if (t.timeoutB) clearTimeout(t.timeoutB)
    spinTimersRef.current = {}
  }

  // A fresh pending roll just became current — clear every bit of state left
  // over from whatever was shown before, regardless of whether the new one
  // is a plain roll, a dual advantage/disadvantage roll, or a damage roll.
  // This used to only reset when the *new* item was itself an advantage/
  // disadvantage roll, which meant `localEntry` (and displayValue) from a
  // previous DUAL roll stayed set indefinitely through a subsequent plain
  // roll — `entry = localEntry ?? rolledEntry` then kept pointing at that
  // stale dual entry, so isDual/pairedLayout came out true and a perfectly
  // ordinary single-die roll showed two dice instead of one. No-ops when
  // there's no pending item at all (current is 'rolled', or gone).
  useEffect(() => {
    if (!pendingId) return
    clearSpinTimers()
    resolvedIdRef.current = null
    dualEntrySequenceRef.current = null
    setDisplayValue(null)
    setSecondDisplayValue(null)
    setLocalEntry(null)
    setSpinA(false)
    setSpinB(false)
    setSpinFlickerA(null)
    setSpinFlickerB(null)
    setPhase(current?.kind === 'pending-check' && current.advantage !== 'normal' ? 'awaiting' : 'rolling')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId])

  // Cleanup on unmount only — the overlay is mounted once for the app's
  // whole life, so this mostly guards against a leaked interval/timeout if
  // it ever were torn down mid-spin.
  useEffect(() => clearSpinTimers, [])

  // The instant the reveal enters 'modifier-in' (see both reveal effects
  // below), pick a fresh random angle and reset the chip to its starting
  // point, then flip it to "arrived" a frame later so the browser actually
  // has a prior position to transition away from — flipping it in the same
  // tick it's reset would give the transition nothing to animate from. Its
  // fade-in is a plain CSS animation on mount (see renderModifierChip),
  // independent of this.
  useEffect(() => {
    if (phase !== 'modifier-in') {
      setModifierArrived(false)
      return
    }
    setModifierAngle(Math.random() * Math.PI * 2)
    setModifierArrived(false)
    const raf = requestAnimationFrame(() => {
      setModifierArrived(true)
      // Started right as the flight actually begins (not a frame earlier,
      // while it's still sitting at its starting point) — the clip's
      // length matches MODIFIER_FLY_MS, so its impact lands in the same
      // instant the chip actually reaches the die.
      playSfx('whoosh')
    })
    return () => cancelAnimationFrame(raf)
  }, [phase])

  /**
   * Plays one die's own little flicker — a fixed CLICK_FLICKER_TICKS random
   * frames, one per chained setTimeout rather than a separate setInterval —
   * then hands the real face to displayValue/secondDisplayValue in that
   * exact same final tick, which is what the "both dice landed" effect
   * above is watching for. Chaining (instead of an interval running
   * alongside an unrelated timeout) is what keeps the last flicker frame
   * and the real result landing back to back with nothing in between; an
   * independent interval could tick one more time right as the timeout
   * fired, flashing an extra random frame a moment before the real one.
   * Each side runs entirely independently, so clicking one never blocks or
   * resets the other.
   */
  function clickDie(which: 'a' | 'b'): void {
    // Checked against the queue directly, not `phase` — `phase` only
    // becomes 'awaiting' once the reset effect above has run, one render
    // after this pending item first appears, so gating on it here would
    // silently drop a click that lands in that gap.
    if (current?.kind !== 'pending-check' || current.advantage === 'normal') return
    const alreadyDone = which === 'a' ? displayValue !== null : secondDisplayValue !== null
    const alreadySpinning = which === 'a' ? spinA : spinB
    if (alreadyDone || alreadySpinning) return

    const finalValue = rollDie(20)
    const setSpinning = which === 'a' ? setSpinA : setSpinB
    const setFlicker = which === 'a' ? setSpinFlickerA : setSpinFlickerB
    const setFinal = which === 'a' ? setDisplayValue : setSecondDisplayValue
    const storeTimeout = (t: ReturnType<typeof setTimeout>): void => {
      if (which === 'a') spinTimersRef.current.timeoutA = t
      else spinTimersRef.current.timeoutB = t
    }

    playSfx('diceRoll')
    setSpinning(true)

    function tick(remaining: number): void {
      if (remaining <= 0) {
        setSpinning(false)
        setFinal(finalValue)
        return
      }
      setFlicker(1 + Math.floor(Math.random() * 20))
      storeTimeout(setTimeout(() => tick(remaining - 1), CLICK_FLICKER_TICK_MS))
    }
    setFlicker(1 + Math.floor(Math.random() * 20))
    storeTimeout(setTimeout(() => tick(CLICK_FLICKER_TICKS - 1), CLICK_FLICKER_TICK_MS))
  }

  // The moment both manually-clicked dice have a face, resolve the roll for
  // real (carrying those exact two numbers forward via presetResults, not a
  // fresh independently-rolled pair the player never saw) — not by waiting
  // for the shared queue to round-trip back as a 'rolled' entry, which was
  // the source of a race against the *other* reveal effect below fighting
  // over the same phase state. This effect's ONLY job is producing
  // `localEntry`; the actual hold/discard/settle/modifier sequence is
  // driven by the next effect, keyed on `localEntry` instead — see its own
  // comment for why splitting this apart mattered.
  //
  // `current` is deliberately NOT in the dependency array below, even
  // though it's read inside — this effect's own body calls
  // resolvePendingRoll(entry), which mutates the exact external queue
  // `current` is derived from. With `current` as a dependency, the
  // resulting re-render gave `current` a new object reference, which made
  // React tear down this effect (running its cleanup) and re-run it,
  // immediately bailing out via the `current.kind !== 'pending-check'`
  // guard since the queue had already moved on to 'rolled'. Reading
  // `current` from the closure without depending on it avoids that
  // self-inflicted loop; the effect only needs to react to the dice values
  // actually landing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (displayValue === null || secondDisplayValue === null) return
    if (current?.kind !== 'pending-check') return
    if (resolvedIdRef.current === current.id) return
    resolvedIdRef.current = current.id

    const entry = performCheckRoll(
      current.sessionId,
      current.rollerId,
      current.rollerName,
      current.modifier,
      current.advantage,
      false,
      current.label,
      current.dc,
      [displayValue, secondDisplayValue],
      true // silent — each die's own click already played a sound; resolving shouldn't add a third
    )
    setLocalEntry(entry)
    resolvePendingRoll(entry)
  }, [displayValue, secondDisplayValue])

  // Drives the entire hold/discard/settle/modifier sequence once
  // `localEntry` exists — kept as a SEPARATE effect from the one above
  // specifically so it depends only on `localEntry` (set exactly once per
  // roll and never touched again), not on `displayValue`/
  // `secondDisplayValue`. Those two get mutated by this very effect's own
  // scheduled timers (e.g. clearing secondDisplayValue once the dropped die
  // is gone) — if this effect depended on them too, each of those timers
  // firing would change a dependency, making React tear the effect down
  // (cancelling every timer still pending — the rest of the sequence,
  // including the modifier reveal) and re-run it from scratch, which then
  // immediately bailed out since one of the values it was checking for had
  // just been nulled out. That looked exactly like "the dice get cast away
  // and then it just sits there forever with no modifier."
  useEffect(() => {
    if (!localEntry || !isDualDieRoll(localEntry)) return
    if (dualEntrySequenceRef.current === localEntry.id) return
    dualEntrySequenceRef.current = localEntry.id

    const [faceA, faceB] = localEntry.groups![0].results
    const keptFace = localEntry.advantage === 'disadvantage' ? Math.min(faceA, faceB) : Math.max(faceA, faceB)

    setPhase('holding')
    // No tip-out/tip-in flip here — that flip exists to "reveal" a number
    // the player hasn't seen yet (the single-die flicker-suspense case
    // below). Here the player already watched the kept die's real face
    // plainly through 'holding' and 'discarding'; replaying a flip on a
    // number they've already read just looked like an unrelated, redundant
    // animation. Goes straight from discarding to 'settled' — the kept die
    // centered, holding its already-known raw face — then into the
    // modifier (or straight to revealed).
    const timers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => setPhase('discarding'), HOLD_MS),
      setTimeout(() => {
        setDisplayValue(keptFace)
        setSecondDisplayValue(null)
        setPhase('settled')
      }, HOLD_MS + DISCARD_MS)
    ]
    const afterSettle = HOLD_MS + DISCARD_MS + SETTLE_PAUSE_MS
    if (localEntry.modifier && !isCritOrFumble(localEntry)) {
      timers.push(
        setTimeout(() => setPhase('modifier-in'), afterSettle),
        setTimeout(() => setDisplayValue(localEntry.total), afterSettle + MODIFIER_FLY_MS),
        setTimeout(() => setPhase('revealed'), afterSettle + MODIFIER_FLY_MS + MODIFIER_POP_MS)
      )
    } else {
      timers.push(setTimeout(() => setPhase('revealed'), afterSettle))
    }
    return () => timers.forEach(clearTimeout)
  }, [localEntry])

  // Everything below handles the two cases the effect above doesn't: a
  // plain single-die roll (any advantage/disadvantage already decided
  // before this popup opened, nothing left to click here), and an
  // already-rolled dual entry arriving via queueRollAnimation (no manual
  // clicks happened, so it gets the full flicker-suspense treatment). A
  // roll already fully handled by the manual-click effect above is
  // recognized by its id matching localEntry and is left alone here.
  useEffect(() => {
    if (localEntry && localEntry.id === rolledId) return

    if (!rolledId || total === null) {
      setPhase('rolling')
      setDisplayValue(null)
      setSecondDisplayValue(null)
      setFlickerT(0)
      return
    }

    setPhase('rolling')
    setFlickerT(0)
    setDisplayValue(1 + Math.floor(Math.random() * flickerSides))
    if (isDualFromQueue) setSecondDisplayValue(1 + Math.floor(Math.random() * flickerSides))

    const start = Date.now()
    const flickerTimer = setInterval(() => {
      setDisplayValue(1 + Math.floor(Math.random() * flickerSides))
      if (isDualFromQueue) setSecondDisplayValue(1 + Math.floor(Math.random() * flickerSides))
      setFlickerT(Math.min(1, (Date.now() - start) / SPIN_MS))
    }, FLICKER_INTERVAL_MS)

    const timers: ReturnType<typeof setTimeout>[] = []

    if (isDualFromQueue && rolledEntry) {
      const [faceA, faceB] = rolledEntry.groups![0].results
      const keptFace = rolledEntry.advantage === 'disadvantage' ? Math.min(faceA, faceB) : Math.max(faceA, faceB)

      // Stage 1: the flicker stops and both real faces reveal side by
      // side, then sit still for a beat before anything moves.
      timers.push(
        setTimeout(() => {
          clearInterval(flickerTimer)
          setFlickerT(1)
          setDisplayValue(faceA)
          setSecondDisplayValue(faceB)
          setPhase('holding')
        }, SPIN_MS)
      )

      timers.push(setTimeout(() => setPhase('discarding'), SPIN_MS + HOLD_MS))

      // No tip-out/tip-in here either — same reasoning as the manual-click
      // path above: the kept die's real face was already shown plainly
      // during 'holding', so flipping it again would just be a redundant
      // replay of a reveal that already happened. Straight to 'settled'.
      timers.push(
        setTimeout(() => {
          setDisplayValue(keptFace)
          setSecondDisplayValue(null)
          setPhase('settled')
        }, SPIN_MS + HOLD_MS + DISCARD_MS)
      )

      const afterSettle = SPIN_MS + HOLD_MS + DISCARD_MS + SETTLE_PAUSE_MS
      if (rolledEntry.modifier && !isCritOrFumble(rolledEntry)) {
        timers.push(
          setTimeout(() => setPhase('modifier-in'), afterSettle),
          setTimeout(() => setDisplayValue(total), afterSettle + MODIFIER_FLY_MS),
          setTimeout(() => setPhase('revealed'), afterSettle + MODIFIER_FLY_MS + MODIFIER_POP_MS)
        )
      } else {
        timers.push(setTimeout(() => setPhase('revealed'), afterSettle))
      }
    } else {
      // The flicker just stops and the real raw result (no modifier yet)
      // shows plainly, with the die playing its own short landing wobble —
      // no flip/reveal animation on the number itself, which used to
      // replay a "guess vs. reveal" flip even here where the flicker really
      // was fake suspense, but read as a pointless extra animation on top
      // of the die's own settle.
      const rawValue = sumGroupResults(rolledEntry!.groups!)
      timers.push(
        setTimeout(() => {
          clearInterval(flickerTimer)
          setFlickerT(1)
          setDisplayValue(rawValue)
          setPhase('settled')
        }, SPIN_MS)
      )

      const afterSettle = SPIN_MS + SETTLE_PAUSE_MS
      if (rolledEntry!.modifier && !isCritOrFumble(rolledEntry!)) {
        timers.push(
          setTimeout(() => setPhase('modifier-in'), afterSettle),
          setTimeout(() => setDisplayValue(total), afterSettle + MODIFIER_FLY_MS),
          setTimeout(() => setPhase('revealed'), afterSettle + MODIFIER_FLY_MS + MODIFIER_POP_MS)
        )
      } else {
        timers.push(setTimeout(() => setPhase('revealed'), afterSettle))
      }
    }

    return () => {
      clearInterval(flickerTimer)
      timers.forEach(clearTimeout)
    }
  }, [rolledId, total, flickerSides, isDualFromQueue, rolledEntry, localEntry])

  // Plays the roll's confirmation sound exactly when the reveal actually
  // happens on screen, not the moment the roll resolves internally (which
  // can be well before the animation catches up — a single-die roll used
  // to play its nat 20 chime the instant the die was clicked, before the
  // 1.3s suspense flicker even started; a dual roll's own resolution sound
  // was suppressed for this same reason, see performCheckRoll's `silent`
  // param). A natural 20/1 only gets its own dedicated chime, and only when
  // there's no DC in play, matching the "no crit/fumble banner against a
  // DC" rule the `natural` display value below follows for the exact same
  // reason. Every other roll gets 'result' instead, pitched to how good the
  // raw d20 face actually was — low and deep for a bad roll, high for a
  // good one — rather than every non-crit result sounding identical;
  // anything that isn't a d20 check (pooled damage dice, etc.) has no such
  // "how good was it" scale, so it just plays at the natural pitch.
  useEffect(() => {
    if (phase !== 'revealed') return
    const e = localEntry ?? rolledEntry
    if (!e) return
    const nat = e.dc == null ? naturalRoll(e) : null
    if (nat === 'crit') playSfx('natural20')
    else if (nat === 'fumble') playSfx('natural1')
    else playSfx('result', resultPitch(rawD20Face(e)))
  }, [phase, localEntry, rolledEntry])

  if (!current) return null

  function triggerPendingRoll(): void {
    // The resolution itself stays silent (see the `revealed`-triggered sound
    // effect above for why) but the press itself still needs its own
    // feedback — dropping this after making resolution silent meant a
    // single-die roll made no sound at all until the reveal, instead of the
    // click itself confirming anything happened. Matches clickDie's own
    // per-die click sound for the dual-roll case.
    playSfx('diceRoll')
    if (current.kind === 'pending-check') {
      const entry = performCheckRoll(current.sessionId, current.rollerId, current.rollerName, current.modifier, current.advantage, false, current.label, current.dc, undefined, true)
      resolvePendingRoll(entry)
    } else if (current.kind === 'pending-damage') {
      const entry = performRoll(current.sessionId, current.rollerId, current.rollerName, current.groups, current.modifier, false, true)
      resolvePendingRoll({ ...entry, label: current.label })
    }
  }

  const isPending = current.kind !== 'rolled'
  const entry = localEntry ?? rolledEntry
  const isDual = isDualDieRoll(entry)
  const label = current.kind !== 'rolled' ? current.label : entry?.label
  const revealed = phase === 'revealed'
  // No flip/tip/settle flourish anywhere anymore — every path (single-die
  // and both dual variants) just reveals its raw number plainly and holds
  // it there, with no extra spin once it's actually landed. Only the
  // initial suspense flicker still tumbles.
  const dieAnimationClass = phase === 'rolling' ? 'gb-die-tumble' : undefined
  // True the instant the modifier has actually been added to the displayed
  // number (mid 'modifier-in', once the chip's own timer swaps displayValue
  // to the total) — drives both the digit's landing pop and hiding the chip
  // once it's done its job.
  const modifierLanded = phase === 'modifier-in' && !!entry && displayValue === entry.total

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

  // Same "no DC in play" gating as `natural` above — a raw d20 face colored
  // on its own merits would contradict a plain pass/fail result otherwise.
  // A "dirty 20" — the total landing on 20 only because of the modifier,
  // not an actual natural 20 — gets its own purple rather than borrowing
  // the true crit's green, so the two don't look identical at a glance.
  const rawFace = entry && revealed && entry.dc == null ? rawD20Face(entry) : null
  const isDirtyTwenty = rawFace !== null && rawFace !== 20 && entry?.total === 20
  const dieColor =
    passFail === 'failure'
      ? 'var(--danger)'
      : passFail === 'success'
        ? 'var(--success)'
        : natural === 'crit'
          ? 'var(--success)'
          : natural === 'fumble'
            ? 'var(--danger)'
            : isDirtyTwenty
              ? ROLL_PURPLE
              : rawFace !== null
                ? rawRollColor(rawFace)
                : 'var(--accent)'
  const numberColor = revealed ? dieColor : phase === 'rolling' ? flickerColor(flickerT) : '#f3e9dc'

  // Which side of the pair is the one that counted — die A renders on the
  // left, die B on the right, for the whole awaiting/rolling/holding/
  // discarding stretch, so nothing swaps sides mid-animation; only which
  // one glides to center vs. flies off is decided by this.
  const dualFaces = isDual && entry?.groups ? entry.groups[0].results : null
  const aIsKept =
    dualFaces && entry ? (entry.advantage === 'disadvantage' ? Math.min(...dualFaces) : Math.max(...dualFaces)) === dualFaces[0] : true
  // A pending advantage/disadvantage roll is detected straight from the
  // queue (`current`), not from `phase` — `phase` only flips to 'awaiting'
  // once the reset effect above has actually run, which is one render
  // *after* a new pending item first appears. On that first render, `phase`
  // is still whatever the previous roll left it at, which could briefly
  // make pairedLayout false and fall through to the old single-click
  // "roll everything at once" path below — the exact gap that let one
  // click roll both dice.
  const isPendingDualNow = current.kind === 'pending-check' && current.advantage !== 'normal'
  const pairedLayout = isPendingDualNow || (isDual && (phase === 'rolling' || phase === 'holding' || phase === 'discarding'))
  // Once both dice of an advantage/disadvantage roll have actually landed,
  // there's nothing left to misclick — unlike the single-die "wait for the
  // deliberate second click" case, so there's no reason to trap the player
  // through the whole discard/settle/modifier sequence if they'd rather just
  // see the total now. A plain single-die roll keeps the original "stays up
  // until the full reveal" behavior, since missing a DC/crit result there
  // by clicking away too early is the thing that design was protecting
  // against in the first place. Deliberately excludes 'holding' too — that
  // stage is the short, intentional "read both real numbers before anything
  // moves" pause; letting an impatient click skip right then meant the
  // dropped die never got a chance to actually fly away, which read as
  // "nothing got removed."
  const canSkipAhead = isDual && phase !== 'awaiting' && phase !== 'rolling' && phase !== 'holding' && !revealed

  function skipToRevealed(): void {
    if (!entry) return
    setDisplayValue(entry.total)
    setSecondDisplayValue(null)
    setPhase('revealed')
  }

  return (
    <div
      className="gb-roll-backdrop-in"
      onClick={() => {
        if (isPending) return
        // "Skip ahead" jumps straight to the already-known total, matching
        // what it says — this used to call dequeueRollAnimation() instead,
        // which *dismissed the whole popup* the moment anyone clicked
        // anywhere during discarding/settled/modifier-in. The roll had
        // already resolved correctly by then (the sheet already has the
        // real total), but the reveal — including the modifier actually
        // being added on screen — never got to play at all if that happened,
        // which is exactly what made the modifier look like it was never
        // shown.
        if (revealed) dequeueRollAnimation()
        else if (canSkipAhead) skipToRevealed()
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
        cursor: !isPending && (revealed || canSkipAhead) ? 'pointer' : 'default'
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
          if (isPending && !pairedLayout) {
            e.stopPropagation()
            triggerPendingRoll()
          }
        }}
        style={{
          position: 'relative',
          width: pairedLayout ? 420 : 260,
          height: 260,
          // The single die (260 wide) has no centering of its own — it just
          // sits at whatever this container's top-left is. That's invisible
          // for a plain roll, where this container is always exactly 260
          // wide, but a dual roll's handoff from the 420-wide paired layout
          // shrinks this container by 160px right as the single kept die
          // takes over, and without centering the die visibly slid/jumped
          // during that shrink instead of just calmly staying put — the
          // "freaks out" right after the discard.
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isPending && !pairedLayout ? 'pointer' : 'default',
          transition: 'width 300ms ease'
        }}
      >
        {pairedLayout ? (
          <>
            {renderDieFace({
              value: displayValue,
              spinning: spinA,
              spinFlicker: spinFlickerA,
              side: 'left',
              isKept: aIsKept,
              // Forced to 'awaiting' the instant a pending dual roll shows
              // up, even before `phase` state itself has caught up (see
              // isPendingDualNow above) — so the die is clickable and shows
              // as such from its very first render, not one frame late.
              phase: isPendingDualNow ? 'awaiting' : phase,
              flickerT,
              onClick: isPendingDualNow ? () => clickDie('a') : undefined
            })}
            {renderDieFace({
              value: secondDisplayValue,
              spinning: spinB,
              spinFlicker: spinFlickerB,
              side: 'right',
              isKept: !aIsKept,
              phase: isPendingDualNow ? 'awaiting' : phase,
              flickerT,
              onClick: isPendingDualNow ? () => clickDie('b') : undefined
            })}
          </>
        ) : (
          <>
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
                key={
                  phase === 'rolling'
                    ? `flicker-${displayValue}`
                    : phase === 'modifier-in'
                      ? modifierLanded
                        ? 'modifier-landed'
                        : 'modifier-raw'
                      : phase
                }
                className={phase === 'rolling' ? 'gb-digit-flicker' : modifierLanded ? 'gb-roll-pop-in' : undefined}
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
            {phase === 'modifier-in' &&
              entry &&
              !modifierLanded &&
              renderModifierChip({ modifier: entry.modifier ?? 0, angle: modifierAngle, arrived: modifierArrived })}
          </>
        )}
      </div>

      {isPending && (
        <div style={{ fontSize: 16, color: '#cbb996', fontWeight: 600 }}>
          {pairedLayout ? (displayValue === null || secondDisplayValue === null ? 'Click a die to roll it' : 'Resolving…') : 'Click the die to roll'}
        </div>
      )}

      {canSkipAhead && <div style={{ fontSize: 13, color: '#9c8a6c' }}>Click to skip ahead</div>}

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
