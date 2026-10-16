// Recomputes every derived number on the character sheet exactly the way
// OverviewTab.tsx, CombatTab.tsx and SpellsTab.tsx assemble them today, from
// the same shared/ helpers. This is the regression baseline the content
// engine (shared/content/) has to match once the SRD is rebuilt as a pack —
// see docs/homebrew-engine.md, phase 2. Keep it in lockstep with those tabs
// until they switch over to deriveCharacter.

import {
  ABILITIES,
  SKILLS,
  abilityModifier,
  activeFeatIds,
  applyExhaustionToMaxHp,
  applyExhaustionToSpeed,
  computeInitiative,
  computeMaxHp,
  computeSpeed,
  hitDiceDisplay,
  passivePerception,
  preparedSpellLimit,
  proficiencyBonus,
  resourceActionsForCharacter,
  resourcesForCharacter,
  savingThrowBonus,
  skillBonus,
  spellAttackBonus,
  spellSaveDC,
  toggleFeaturesForCharacter,
  type Ability,
  type CharacterSheetData
} from '@shared/dnd5e'
import {
  UNARMED_STRIKE,
  activeBuffMeleeDamageBonus,
  activeBuffResistances,
  armorSpeedPenalty,
  cantripsKnownLimit,
  classFeatureSpeedBonus,
  computeArmorClassFromEquipment,
  effectiveAbilityCheckAdvantage,
  effectiveAbilityScores,
  effectiveAttackAdvantage,
  effectiveInitiativeAdvantage,
  effectiveSavingThrowAdvantage,
  effectiveSavingThrowProficiencies,
  effectiveSkillAdvantage,
  effectiveSkillProficiencies,
  featNotes,
  featSpeedBonus,
  knownSpellsLimit,
  spellSlotsForClasses,
  suggestedAttackAbility,
  weaponAttackBonus,
  weaponAttacksFromEquipment
} from '@shared/compendium'

export interface LegacyAttack {
  name: string
  ability: 'str' | 'dex'
  attackBonus: number
  damageDice: string
  damageBonus: number
  damageType: string
}

export interface LegacyDerived {
  level: number
  proficiencyBonus: number
  abilityScores: Record<Ability, number>
  abilityModifiers: Record<Ability, number>
  saves: Record<Ability, { bonus: number; proficient: boolean; mode?: 'advantage' | 'disadvantage' }>
  skills: Record<string, { bonus: number; proficiency?: 'proficient' | 'expertise'; mode?: 'advantage' | 'disadvantage' }>
  abilityCheckModes: Partial<Record<Ability, 'advantage' | 'disadvantage'>>
  passivePerception: number
  armorClass: number
  initiative: number
  initiativeMode?: 'advantage' | 'disadvantage'
  speed: number
  maxHp: number
  hitDice: string
  resistances: string[]
  spellSaveDc: number | null
  spellAttackBonus: number | null
  spellSlots: Record<number, number>
  spellCap: number | null
  cantripCap: number | null
  resources: { id: string; max: number; recharge: 'short' | 'long'; actionType?: string }[]
  toggles: string[]
  resourceActions: string[]
  attackMode?: 'advantage' | 'disadvantage'
  attacks: LegacyAttack[]
  notes: string[]
}

export function legacyDerive(sheet: CharacterSheetData): LegacyDerived {
  const { classes, asiSlotChoices, equipment, activeBuffs, exhaustionLevel } = sheet

  // OverviewTab.tsx
  const activeFeats = activeFeatIds(classes, asiSlotChoices)
  const effScores = effectiveAbilityScores(sheet.abilityScores, classes, asiSlotChoices)
  const effSkillProficiencies = effectiveSkillProficiencies(sheet.skillProficiencies, activeFeats)
  const effSaveProficiencies = effectiveSavingThrowProficiencies(sheet.savingThrowProficiencies, activeFeats)
  const speedBonus = featSpeedBonus(activeFeats) + armorSpeedPenalty(equipment, effScores) + classFeatureSpeedBonus(classes, equipment)
  const skillModes = effectiveSkillAdvantage(activeFeats, equipment)
  const saveModes = effectiveSavingThrowAdvantage(activeFeats, activeBuffs, exhaustionLevel)

  const saves = {} as LegacyDerived['saves']
  const abilityModifiers = {} as LegacyDerived['abilityModifiers']
  for (const { id } of ABILITIES) {
    abilityModifiers[id] = abilityModifier(effScores[id])
    saves[id] = {
      bonus: savingThrowBonus(id, effScores, effSaveProficiencies, classes),
      proficient: effSaveProficiencies.includes(id),
      ...(saveModes[id] ? { mode: saveModes[id] } : {})
    }
  }
  const skills: LegacyDerived['skills'] = {}
  for (const { id } of SKILLS) {
    skills[id] = {
      bonus: skillBonus(id, effScores, effSkillProficiencies, classes),
      ...(effSkillProficiencies[id] ? { proficiency: effSkillProficiencies[id] } : {}),
      ...(skillModes[id] ? { mode: skillModes[id] } : {})
    }
  }

  // CombatTab.tsx
  const meleeBuffDamage = activeBuffMeleeDamageBonus(activeBuffs, classes)
  const attacks: LegacyAttack[] = [
    {
      name: UNARMED_STRIKE.name,
      ability: 'str',
      attackBonus: weaponAttackBonus('str', effScores, classes),
      damageDice: UNARMED_STRIKE.damage,
      damageBonus: abilityModifier(effScores.str),
      damageType: UNARMED_STRIKE.damageType
    },
    ...weaponAttacksFromEquipment(equipment).map(({ weapon }) => {
      const ability = suggestedAttackAbility(weapon, effScores)
      const buff = ability === 'str' && weapon.weaponRange !== 'Ranged' ? meleeBuffDamage : 0
      return {
        name: weapon.name,
        ability,
        attackBonus: weaponAttackBonus(ability, effScores, classes),
        damageDice: weapon.damageDice ?? '',
        damageBonus: abilityModifier(effScores[ability]) + buff,
        damageType: weapon.damageType ?? ''
      }
    })
  ]

  // SpellsTab.tsx
  const spellCap = preparedSpellLimit(classes, effScores) ?? knownSpellsLimit(classes)

  const initiativeMode = effectiveInitiativeAdvantage(activeFeats)
  const attackMode = effectiveAttackAdvantage(activeFeats, activeBuffs, exhaustionLevel)

  return {
    level: classes.reduce((sum, c) => sum + c.level, 0),
    proficiencyBonus: proficiencyBonus(classes),
    abilityScores: effScores,
    abilityModifiers,
    saves,
    skills,
    abilityCheckModes: effectiveAbilityCheckAdvantage(activeFeats, activeBuffs, exhaustionLevel),
    passivePerception: passivePerception(effScores, effSkillProficiencies, classes),
    armorClass: computeArmorClassFromEquipment(equipment, effScores, activeFeats, classes),
    initiative: computeInitiative(effScores),
    ...(initiativeMode ? { initiativeMode } : {}),
    speed: applyExhaustionToSpeed(computeSpeed(sheet.race) + speedBonus, exhaustionLevel),
    maxHp: applyExhaustionToMaxHp(computeMaxHp(classes, effScores), exhaustionLevel),
    hitDice: hitDiceDisplay(classes),
    resistances: [...new Set([...sheet.damageResistances, ...activeBuffResistances(activeBuffs)])].sort(),
    spellSaveDc: spellSaveDC(sheet.spellcastingAbility, effScores, classes),
    spellAttackBonus: spellAttackBonus(sheet.spellcastingAbility, effScores, classes),
    spellSlots: spellSlotsForClasses(classes),
    spellCap,
    cantripCap: cantripsKnownLimit(classes),
    resources: resourcesForCharacter(classes, effScores).map((r) => ({
      id: r.id,
      max: r.currentMax,
      recharge: r.currentRecharge,
      ...(r.actionType ? { actionType: r.actionType } : {})
    })),
    toggles: toggleFeaturesForCharacter(classes).map((t) => t.id),
    resourceActions: resourceActionsForCharacter(classes).map((a) => a.id),
    ...(attackMode ? { attackMode } : {}),
    attacks,
    notes: featNotes(activeFeats).map((n) => `${n.featName}: ${n.text}`)
  }
}
