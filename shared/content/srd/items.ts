// SRD equipment and magic items as pack items. Armour's AC, Strength
// requirement and Stealth disadvantage — computed in code by
// compendium.ts's computeArmorClassFromEquipment / armorSpeedPenalty /
// armorStealthDisadvantage — become the item's own effects.

import { EQUIPMENT, MAGIC_ITEMS, type CompendiumEquipment } from '../../compendium'
import type { ContentPackInput, Effect } from '../schema'

type ItemInput = NonNullable<ContentPackInput['items']>[number]

function armorEffects(e: CompendiumEquipment): Effect[] {
  const base = e.armorClassBase ?? 10
  const effects: Effect[] = []
  if (e.armorCategory === 'Shield') {
    // A shield adds on top of whatever AC formula applies.
    effects.push({ do: { kind: 'modify', target: 'ac', op: 'add', value: String(base) } })
  } else {
    const dex = e.armorClassDexBonus ? (e.armorClassMaxBonus != null ? ` + min(@dex.mod, ${e.armorClassMaxBonus})` : ' + @dex.mod') : ''
    effects.push({ do: { kind: 'acFormula', label: e.name, formula: `${base}${dex}` } })
  }
  if (e.strMinimum) {
    effects.push({ when: { kind: 'formula', formula: `@str.score < ${e.strMinimum}` }, do: { kind: 'modify', target: 'speed.walk', op: 'add', value: '-10' } })
  }
  if (e.stealthDisadvantage) effects.push({ do: { kind: 'rollMode', target: 'skill:stealth', mode: 'disadvantage' } })
  return effects
}

function equipmentItem(e: CompendiumEquipment): ItemInput {
  const item: ItemInput = {
    id: e.id,
    name: e.name,
    description: e.description ?? '',
    category: e.category,
    cost: e.cost,
    ...(e.weight !== undefined ? { weight: e.weight } : {})
  }
  if (e.category === 'Weapon') {
    item.weapon = {
      category: (e.weaponCategory ?? 'simple').toLowerCase(),
      range: e.weaponRange === 'Ranged' ? 'ranged' : 'melee',
      // The Net deals no damage; '0' keeps it a weapon (it still shows as an attack, as it does today).
      damage: e.damageDice ?? '0',
      damageType: e.damageType ?? '',
      properties: e.properties ?? [],
      ...(e.normalRange !== undefined ? { normalRange: e.normalRange } : {}),
      ...(e.longRange !== undefined ? { longRange: e.longRange } : {})
    }
  }
  if (e.category === 'Armor' && e.armorCategory) {
    item.armor = {
      category: e.armorCategory.toLowerCase(),
      ...(e.strMinimum ? { strengthRequirement: e.strMinimum } : {}),
      stealthDisadvantage: !!e.stealthDisadvantage
    }
    item.effects = armorEffects(e)
  }
  return item
}

export function srdItems(): ItemInput[] {
  return [
    ...EQUIPMENT.map(equipmentItem),
    // Magic items carry rules text only — nothing on the sheet reads their mechanics yet.
    ...MAGIC_ITEMS.map((m): ItemInput => {
      const requiresAttunement = /requires attunement/i.test(m.description)
      return { id: m.id, name: m.name, description: m.description, category: m.category, rarity: m.rarity, requiresAttunement, effectsWhen: requiresAttunement ? 'attuned' : 'equipped' }
    })
  ]
}
