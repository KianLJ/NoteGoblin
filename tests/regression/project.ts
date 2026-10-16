// Projects the engine's DerivedCharacter onto legacyDerive.ts's
// LegacyDerived shape, so the SRD pack can be checked against the baseline
// snapshot field for field. Only the mapping lives here — every number comes
// from deriveCharacter.

import { deriveCharacter, type DerivedCharacter } from '@shared/content/engine'
import { evaluateDice } from '@shared/content/formula'
import { LEGACY_HOMEBREW_PACK_ID, legacySheetToBuild, type LegacyBuildOptions } from '@shared/content/legacy'
import { buildRegistry, type Registry } from '@shared/content/registry'
import type { CharacterSheetData } from '@shared/dnd5e'
import type { LegacyAttack, LegacyDerived } from './legacyDerive'

type Mode = 'advantage' | 'disadvantage'
const withMode = (mode: Mode | undefined): { mode?: Mode } => (mode ? { mode } : {})

export function projectToLegacy(derived: DerivedCharacter, registry: Registry, equipment: { key?: string; itemId: string }[]): LegacyDerived {
  const abilityScores = {} as LegacyDerived['abilityScores']
  const abilityModifiers = {} as LegacyDerived['abilityModifiers']
  const saves = {} as LegacyDerived['saves']
  for (const [a, v] of Object.entries(derived.abilities) as Array<[keyof LegacyDerived['abilityScores'], DerivedCharacter['abilities']['str']]>) {
    abilityScores[a] = v.score
    abilityModifiers[a] = v.mod
    const save = derived.saves[a]
    saves[a] = { bonus: save.bonus, proficient: !!save.proficiency, ...withMode(save.mode) }
  }

  const skills: LegacyDerived['skills'] = {}
  for (const s of Object.values(derived.skills)) {
    const proficiency = s.proficiency === 'proficient' || s.proficiency === 'expertise' ? s.proficiency : undefined
    skills[s.name] = { bonus: s.bonus, ...(proficiency ? { proficiency } : {}), ...withMode(s.mode) }
  }

  // Legacy shows the weapon's own dice and every flat bonus (ability, Rage) separately.
  const attacks: LegacyAttack[] = derived.attacks.map((a) => {
    const itemId = equipment.find((e) => e.key === a.itemKey)?.itemId
    const base = a.kind === 'unarmed' ? '1' : (itemId && registry.get('items', itemId)?.def.weapon?.damage) || '0'
    return {
      name: a.name,
      ability: a.ability as LegacyAttack['ability'],
      attackBonus: a.attackBonus,
      damageDice: base === '0' ? '' : base,
      damageBonus: a.damageDice.flat - evaluateDice(base, () => 0).flat,
      damageType: a.damageType
    }
  })

  // Legacy sums every slot pool (Pact Magic included) into one table.
  const spellSlots: Record<number, number> = {}
  for (const pool of Object.values(derived.spellcasting.slots)) for (const [lvl, n] of Object.entries(pool)) spellSlots[Number(lvl)] = (spellSlots[Number(lvl)] ?? 0) + n

  // Unrecognised (stub) classes never had a hit die to show.
  const hitDice = derived.hitDice.filter((h) => !h.classId.startsWith(`${LEGACY_HOMEBREW_PACK_ID}:`)).map((h) => `${h.count}d${h.die}`)

  return {
    level: derived.level,
    proficiencyBonus: derived.proficiencyBonus,
    abilityScores,
    abilityModifiers,
    saves,
    skills,
    abilityCheckModes: { ...derived.checkModes },
    passivePerception: derived.skills.perception.passive,
    armorClass: derived.armorClass,
    initiative: derived.initiative,
    ...(derived.initiativeMode ? { initiativeMode: derived.initiativeMode } : {}),
    speed: derived.speeds.walk,
    maxHp: derived.maxHp,
    hitDice: hitDice.length ? hitDice.join(' + ') : '—',
    resistances: derived.damageRelations.resistances,
    spellSaveDc: derived.spellcasting.dc,
    spellAttackBonus: derived.spellcasting.attackBonus,
    spellSlots,
    spellCap: derived.spellcasting.preparedLimit ?? derived.spellcasting.knownLimit,
    cantripCap: derived.spellcasting.cantripsLimit,
    resources: derived.resources.map((r) => ({ id: r.id, max: r.max, recharge: r.recharge as 'short' | 'long', ...(r.actionType ? { actionType: r.actionType } : {}) })),
    // A toggle that spends a resource is what the legacy sheet called an activatable resource (Rage), not a toggle feature.
    toggles: derived.toggles.filter((t) => !t.cost).map((t) => t.id),
    resourceActions: derived.actions.map((a) => a.id),
    ...(derived.attackMode ? { attackMode: derived.attackMode } : {}),
    attacks,
    notes: derived.notes.map((n) => `${n.source}: ${n.text}`)
  }
}

/** Legacy sheet → adapter → deriveCharacter → LegacyDerived. */
export function engineDerive(sheet: CharacterSheetData, options?: LegacyBuildOptions): { projected: LegacyDerived; derived: DerivedCharacter } {
  const { build, packs } = legacySheetToBuild(sheet, options)
  const registry = buildRegistry(packs)
  const derived = deriveCharacter(build, registry)
  return { projected: projectToLegacy(derived, registry, build.equipment ?? []), derived }
}
