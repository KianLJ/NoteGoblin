// Hit point arithmetic shared by the sheet: damage comes off temporary HP
// first (and temporary HP is simply gone once it reaches 0), healing never
// goes past the maximum, and a change to the maximum (levelling up or down,
// Constitution, an item) moves current HP by the same amount.

export interface HitPoints {
  currentHp: number
  tempHp: number
}

/** Takes damage from temporary HP first, then current HP (never below 0). */
export function applyDamage(hp: HitPoints, amount: number): HitPoints {
  const dmg = Math.max(0, Math.floor(amount))
  const fromTemp = Math.min(Math.max(0, hp.tempHp), dmg)
  return { tempHp: Math.max(0, hp.tempHp) - fromTemp, currentHp: Math.max(0, hp.currentHp - (dmg - fromTemp)) }
}

/** Heals current HP up to the maximum; temporary HP isn't touched. */
export function applyHealing(hp: HitPoints, amount: number, maxHp: number): HitPoints {
  return { ...hp, currentHp: Math.min(maxHp, Math.max(0, hp.currentHp) + Math.max(0, Math.floor(amount))) }
}

/**
 * Current HP after the maximum changes from `prevMax` to `newMax`: it moves
 * by the same amount (a level up adds the new HP straight away; a level
 * down takes it back), never above the new maximum, and a conscious
 * character isn't dropped to 0 by it.
 */
export function hpAfterMaxChange(currentHp: number, prevMax: number, newMax: number): number {
  const moved = Math.min(newMax, currentHp + (newMax - prevMax))
  return Math.max(currentHp > 0 ? 1 : 0, moved)
}
