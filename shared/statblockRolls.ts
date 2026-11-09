import { diceGroups } from './dice'

/**
 * Turns the roll-worthy bits of a rendered statblock into roll buttons: an
 * ability score, a save or skill bonus, an initiative bonus, an attack's
 * "+4 to hit" and its "1d6 + 2" damage. Each button carries what to roll in
 * `data-statblock-roll` (JSON); whoever shows the statblock decides how a
 * click rolls it (see campaigns/StatblockCard.tsx). Works on HTML that's
 * already escaped, and leaves tags and existing buttons (a `dice:` inline
 * roll) alone.
 */

export type StatblockRoll = { kind: 'check'; label: string; modifier: number; critOn?: number } | { kind: 'damage'; label: string; expr: string }

function attr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function signed(text: string): number {
  return Number(text.replace(/[−–]/g, '-').replace(/\s+/g, ''))
}

export function rollButtonHtml(html: string, roll: StatblockRoll): string {
  return `<button type="button" class="gb-statblock-roll" data-statblock-roll="${attr(JSON.stringify(roll))}" title="Roll ${attr(roll.label)}">${html}</button>`
}

/**
 * A roll chip's insides: the number that's rolled, solid (`<b>`), beside its
 * context (`<span>`) — "5 (1d6 + 2)", "+4 to hit", "Dex +5", "8 (−1)".
 * `solidFirst` puts the number on the left.
 */
export function chipHtml(solid: string, context: string, solidFirst: boolean): string {
  const b = `<b>${solid}</b>`
  const span = `<span>${context}</span>`
  return solidFirst ? b + span : span + b
}

/** Runs `replace` over the text between tags only — never inside a tag or an existing button. */
function inText(html: string, re: RegExp, replace: (match: RegExpExecArray) => string | null): string {
  return html
    .split(/(<button[\s\S]*?<\/button>|<[^>]+>)/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(re, (...args) => {
            const match = args.slice(0, -2) as unknown as RegExpExecArray
            return replace(match) ?? match[0]
          })
    )
    .join('')
}

const BONUS = /([A-Z][a-z]+(?: (?:of|[A-Z][a-z]+))*) ([+−–-]\d+)/g

/** "Dex +5, Wis +3" — each a saving throw. */
export function markSaves(html: string): string {
  return inText(html, BONUS, (m) => rollButtonHtml(chipHtml(m[2], m[1], false), { kind: 'check', label: `${m[1]} Save`, modifier: signed(m[2]) }))
}

/** "Perception +4, Sleight of Hand +6" — each a skill check. */
export function markSkills(html: string): string {
  return inText(html, BONUS, (m) => rollButtonHtml(chipHtml(m[2], m[1], false), { kind: 'check', label: `${m[1]} Check`, modifier: signed(m[2]) }))
}

/** "+2 (12)" — the 2024 initiative line's bonus. */
export function markInitiative(html: string): string {
  return inText(html, /^\s*([+−–-]\d+)/, (m) => rollButtonHtml(chipHtml(m[1], '', true), { kind: 'check', label: 'Initiative', modifier: signed(m[1]) }))
}

/**
 * An action or trait: its attack bonus ("+4 to hit", or the 2024 "Attack
 * Roll: +4") and its damage — "5 (1d6 + 2)" as one chip with its average,
 * or a bare "1d6 + 2" on its own.
 */
export function markEntry(html: string, name: string): string {
  const attacks = inText(html, /([+−–-]\d+) to hit|(?<=Attack Roll: )([+−–-]\d+)/g, (m) =>
    rollButtonHtml(m[1] ? chipHtml(m[1], 'to hit', true) : chipHtml(m[2], '', true), { kind: 'check', label: `${name} Attack`, modifier: signed(m[1] ?? m[2]) })
  )
  const dice = '\\d+d\\d+(?: ?[+−–-] ?\\d+)?'
  const averaged = inText(attacks, new RegExp(`(\\d+) \\((${dice})\\)`, 'g'), (m) => {
    const expr = m[2].replace(/[−–]/g, '-')
    return diceGroups(expr) ? rollButtonHtml(chipHtml(m[1], `(${m[2]})`, true), { kind: 'damage', label: `${name} Damage`, expr }) : null
  })
  return inText(averaged, new RegExp(`\\b${dice}`, 'g'), (m) => {
    const expr = m[0].replace(/[−–]/g, '-')
    return diceGroups(expr) ? rollButtonHtml(chipHtml(m[0], '', true), { kind: 'damage', label: `${name} Damage`, expr }) : null
  })
}

// --- For the monster editor (bestiary/MonsterEditor.tsx) ---------------------------------

/** The rolls an action's or trait's text will get on the statblock — what the editor shows under each one. */
export function rollsInEntry(text: string, name: string): StatblockRoll[] {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return [...markEntry(escaped, name).matchAll(/data-statblock-roll="([^"]*)"/g)].map(
    (m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')) as StatblockRoll
  )
}

/** The rolls a "Dex +5, Wis +3" saves or skills line will get. */
export function rollsInBonusLine(text: string): number {
  return [...text.matchAll(BONUS)].length
}

export interface AttackDraft {
  ranged: boolean
  toHit: number
  /** "5" (reach, in feet) or "80/320" (range). */
  distance: string
  /** "1d6+2", "2d8 + 4". */
  dice: string
  damageType: string
}

/** "1d6+2" → "1d6 + 2" and its average (5), or null when it isn't one dice group with an optional bonus. */
export function damageWithAverage(dice: string): { expr: string; average: number } | null {
  const m = dice.replace(/\s+/g, '').replace(/[−–]/g, '-').match(/^(\d+)d(\d+)(?:([+-])(\d+))?$/)
  if (!m) return null
  const [count, sides, sign, bonus] = [Number(m[1]), Number(m[2]), m[3], Number(m[4] ?? 0)]
  if (count < 1 || sides < 1) return null
  const mod = sign === '-' ? -bonus : bonus
  return { expr: `${count}d${sides}${m[3] ? ` ${sign} ${bonus}` : ''}`, average: Math.max(1, Math.floor((count * (sides + 1)) / 2 + mod)) }
}

/** An attack written the way the statblock turns into roll buttons: "+4 to hit" and "5 (1d6 + 2)". */
export function attackText(a: AttackDraft): string {
  const hit = `${a.toHit >= 0 ? '+' : '−'}${Math.abs(a.toHit)}`
  const dmg = damageWithAverage(a.dice)
  const reach = a.ranged ? `range ${a.distance.trim() || '80/320'} ft.` : `reach ${a.distance.trim() || '5'} ft.`
  const damage = dmg ? `${dmg.average} (${dmg.expr})${a.damageType.trim() ? ` ${a.damageType.trim()}` : ''} damage` : 'no damage'
  return `${a.ranged ? 'Ranged' : 'Melee'} Weapon Attack: ${hit} to hit, ${reach}, one target. Hit: ${damage}.`
}
