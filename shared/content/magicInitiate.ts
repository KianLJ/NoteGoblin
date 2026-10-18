// Magic Initiate used to be one feat offering the Cleric, Druid and Wizard
// lists together; it's now three (Magic Initiate (Cleric) / (Druid) /
// (Wizard)), as in the 2024 rules and D&D Beyond. This moves a saved
// character's old "magic-initiate" picks onto the matching version, keeping
// every spell they chose:
//   - a background's origin feat becomes that background's version
//     (Acolyte -> Cleric, Sage -> Wizard);
//   - anywhere else, the list most of the chosen spells come from (ties go
//     Cleric, Druid, Wizard; no spells chosen yet -> by spellcasting ability).
// A spell from another list stays picked (the sheet just notes it's off-list).
// Pure and idempotent: a sheet with nothing to move comes back as the same object.

import { SPELLS } from '../compendium'
import type { Ability, CharacterSheetData } from '../dnd5e'
import { SRD_PACK_ID } from './srd'

export const OLD_MAGIC_INITIATE = 'magic-initiate'
const LISTS = ['cleric', 'druid', 'wizard'] as const
type List = (typeof LISTS)[number]
const BACKGROUND_LIST: Record<string, List> = { acolyte: 'cleric', sage: 'wizard' }

const newId = (list: List): string => `${OLD_MAGIC_INITIATE}-${list}`
const local = (id: string): string => (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id)
const isOld = (id: string): boolean => local(id) === OLD_MAGIC_INITIATE && (!id.includes(':') || id.startsWith(`${SRD_PACK_ID}:`))

/** The list a set of chosen spells (compendium or full ids) mostly comes from. */
export function listForSpells(spellIds: string[], ability?: Ability): List {
  const score = (list: List): number => spellIds.filter((id) => SPELLS.find((s) => s.id === local(id))?.classes.some((c) => c.toLowerCase() === list)).length
  const best = Math.max(...LISTS.map(score))
  if (best > 0) return LISTS.find((l) => score(l) === best)!
  return ability === 'int' ? 'wizard' : 'cleric'
}

const backgroundList = (sheet: CharacterSheetData): List | undefined => {
  const id = local(sheet.backgroundId ?? '') || (sheet.background ?? '').trim().toLowerCase()
  return BACKGROUND_LIST[id]
}

export function migrateMagicInitiate<T extends CharacterSheetData>(sheet: T): T {
  const slots = sheet.asiSlotChoices ?? []
  const choices = sheet.choices ?? {}
  const slotHits = slots.some((s) => s.kind === 'feat' && !!s.featId && isOld(s.featId))
  const choiceHits = Object.values(choices).some((picks) => picks.some(isOld))
  if (!slotHits && !choiceHits) return sheet

  const fromBackground = backgroundList(sheet)
  const next: T = { ...sheet }

  if (slotHits) {
    next.asiSlotChoices = slots.map((s) => {
      if (s.kind !== 'feat' || !s.featId || !isOld(s.featId)) return s
      // A level-0 slot is the background's origin feat.
      const list = s.level === 0 && fromBackground ? fromBackground : listForSpells(s.chosenSpellIds ?? [], s.chosenAbility)
      return { ...s, featId: newId(list) }
    })
  }

  if (choiceHits) {
    const out: Record<string, string[]> = { ...choices }
    for (const [key, picks] of Object.entries(choices)) {
      if (!picks.some(isOld)) continue
      const seen = new Map<string, number>()
      out[key] = picks.map((pick) => {
        const repeat = seen.get(pick) ?? 0
        seen.set(pick, repeat + 1)
        if (!isOld(pick)) return pick
        // The feat's own picks live under "<choice key>/<feat id>[@n]#<its choice>".
        const oldPrefix = `${key}/${pick}${repeat ? `@${repeat}` : ''}`
        const nested = Object.keys(choices).filter((k) => k.startsWith(`${oldPrefix}#`))
        const spells = nested.filter((k) => !k.endsWith('#spell-ability')).flatMap((k) => choices[k])
        const ability = choices[`${oldPrefix}#spell-ability`]?.[0] as Ability | undefined
        const list = key.startsWith('background:') && fromBackground ? fromBackground : listForSpells(spells, ability)
        const replaced = pick.includes(':') ? `${pick.slice(0, pick.indexOf(':'))}:${newId(list)}` : newId(list)
        const newPrefix = `${key}/${replaced}${repeat ? `@${repeat}` : ''}`
        for (const k of nested) {
          out[`${newPrefix}${k.slice(oldPrefix.length)}`] = choices[k]
          delete out[k]
        }
        return replaced
      })
    }
    next.choices = out
  }
  return next
}
