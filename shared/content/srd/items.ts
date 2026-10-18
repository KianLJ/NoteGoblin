// SRD equipment and magic items as pack items. Armour's AC, Strength
// requirement and Stealth disadvantage — computed in code by
// compendium.ts's computeArmorClassFromEquipment / armorSpeedPenalty /
// armorStealthDisadvantage — become the item's own effects.
//
// Magic items get effects for the rules with numbers the sheet tracks (AC,
// saves, ability scores, speeds, resistances, attack and damage bonuses,
// charges); the rest stays rules text. The SRD's magic weapons and armour are
// entries of their own rather than a property of a mundane item, so a magic
// weapon's bonus goes to the matching weapon the character has equipped —
// "Weapon (any sword)" asks which sword it is.

import { EQUIPMENT, MAGIC_ITEMS, type CompendiumEquipment } from '../../compendium'
import { SKILLS } from '../../dnd5e'
import type { AttackFilter, ContentPackInput, Effect, ResourceDef } from '../schema'
import { ABILITY_LIST, NO_ARMOR_OR_SHIELD, NO_BODY_ARMOR, note, skillId } from './common'

type ItemInput = NonNullable<ContentPackInput['items']>[number]
type OptionListInput = NonNullable<ContentPackInput['optionLists']>[number]

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

// ---------------------------------------------------------------------------
// Magic item effects

const add = (target: string, value: number | string): Effect => ({ do: { kind: 'modify', target, op: 'add', value: String(value) } })
const atLeast = (target: string, value: number | string): Effect => ({ do: { kind: 'modify', target, op: 'atLeast', value: String(value) } })
const resist = (damageType: string): Effect => ({ do: { kind: 'damageRelation', damageType, relation: 'resistance' } })
const language = (name: string): Effect => ({ do: { kind: 'proficiency', category: 'language', value: name } })
const ac = (n: number): Effect => add('ac', n)
const saves = (n: number): Effect[] => ABILITY_LIST.map((a) => add(`save.${a}`, n))
const spellAttack = (n: number): Effect => add('spell.attack', n)
/** "+N to ability checks": every skill and initiative (plain ability checks have no number on the sheet). */
const checks = (n: number): Effect[] => [...SKILLS.map((s) => add(`skill.${skillId(s.id)}`, n)), add('initiative', n)]
/** "Your Strength score is 19 while you wear this" — no effect if it's already higher. */
const scoreAtLeast = (ability: string, score: number): Effect => atLeast(`ability.${ability}.score`, score)
/** "Your Dexterity score increases by 2, to a maximum of 20" — the usual cap of 20 applies. */
const scorePlus = (ability: string, n: number): Effect => add(`ability.${ability}.score`, n)
const toggle = (id: string, name: string, actionType: string, effects: Effect[]): Effect => ({ do: { kind: 'grantToggle', toggle: { id, name, actionType, effects } } })

const SWORDS = ['greatsword', 'longsword', 'rapier', 'scimitar', 'shortsword']
const SLASHING_SWORDS = ['greatsword', 'longsword', 'scimitar']
const AXES = ['battleaxe', 'greataxe', 'handaxe']

const onWeapons = (itemIds: string[]): AttackFilter => ({ item: { itemIds } })

function attackBonus(n: number, appliesTo: AttackFilter): Effect[] {
  return [
    { do: { kind: 'modify', target: 'attack.bonus', op: 'add', value: String(n), appliesTo } },
    { do: { kind: 'modify', target: 'attack.damage', op: 'add', value: String(n), appliesTo } }
  ]
}

/**
 * A magic weapon's effects on the equipped weapon it is. One possible base
 * ("Weapon (dagger)") applies straight away; several ("any sword", "any")
 * ask which one it is, and the effects go to that weapon's attacks.
 */
function magicWeapon(bases: string[] | 'any', bonus: number, extra: (appliesTo: AttackFilter) => Effect[] = () => []): Effect[] {
  const effects = (appliesTo: AttackFilter): Effect[] => [...(bonus ? attackBonus(bonus, appliesTo) : []), ...extra(appliesTo)]
  if (bases !== 'any' && bases.length === 1) return effects(onWeapons(bases))
  return [
    {
      do: {
        kind: 'grantChoice',
        choice: {
          id: 'weapon',
          label: 'Which weapon is it?',
          from: { kind: 'weapons', ...(bases === 'any' ? {} : { itemIds: bases }) },
          onPick: effects(onWeapons(['$pick']))
        }
      }
    }
  ]
}

/** A choice of damage type from one of the option lists below (Ring of Resistance, Armor of Resistance…). */
function resistanceChoice(listId: string, label: string): Effect {
  return { do: { kind: 'grantChoice', choice: { id: 'damage-type', label, from: { kind: 'optionList', listId } } } }
}

const RESISTANCE_TYPES = ['acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder']
const PHYSICAL_TYPES = ['bludgeoning', 'piercing', 'slashing']
const DRAGON_SCALES: Array<[string, string]> = [
  ['black', 'acid'],
  ['blue', 'lightning'],
  ['brass', 'fire'],
  ['bronze', 'lightning'],
  ['copper', 'acid'],
  ['gold', 'fire'],
  ['green', 'poison'],
  ['red', 'fire'],
  ['silver', 'cold'],
  ['white', 'cold']
]
const capitalize = (s: string): string => s[0].toUpperCase() + s.slice(1)

const LIST_IDS = { resistance: 'magic-item-resistance', vulnerability: 'armor-of-vulnerability', dragonScale: 'dragon-scale-mail' } as const

/** The option lists magic items pick from. */
export function srdItemOptionLists(): OptionListInput[] {
  return [
    {
      id: LIST_IDS.resistance,
      name: 'Damage Resistance',
      description: 'The damage type a Ring or Armor of Resistance protects against.',
      options: RESISTANCE_TYPES.map((t) => ({ id: t, name: capitalize(t), description: `Resistance to ${t} damage.`, effects: [resist(t)] }))
    },
    {
      id: LIST_IDS.vulnerability,
      name: 'Armor of Vulnerability',
      description: 'The damage type the armor resists. Its curse leaves you vulnerable to the other two.',
      options: PHYSICAL_TYPES.map((t) => {
        const others = PHYSICAL_TYPES.filter((o) => o !== t)
        return {
          id: t,
          name: capitalize(t),
          description: `Resistance to ${t} damage; while cursed, vulnerability to ${others.join(' and ')} damage.`,
          effects: [resist(t), ...others.map((o): Effect => ({ do: { kind: 'damageRelation', damageType: o, relation: 'vulnerability' } }))]
        }
      })
    },
    {
      id: LIST_IDS.dragonScale,
      name: 'Dragon Scale Mail',
      description: 'The kind of dragon that provided the scales, which sets the damage type the armor resists.',
      options: DRAGON_SCALES.map(([dragon, t]) => ({ id: dragon, name: `${capitalize(dragon)} dragon`, description: `Resistance to ${t} damage.`, effects: [resist(t)] }))
    }
  ]
}

const DRAGON_SCALE_NOTE = note('Advantage on saving throws against the Frightful Presence and breath weapons of dragons.')

const MAGIC_ITEM_EFFECTS: Record<string, Effect[]> = {
  // Armour and shields
  'armor-1': [ac(1)],
  'armor-2': [ac(2)],
  'armor-3': [ac(3)],
  'armor-of-resistance': [resistanceChoice(LIST_IDS.resistance, 'Damage type')],
  'armor-of-vulnerability': [resistanceChoice(LIST_IDS.vulnerability, 'Damage type')],
  'dragon-scale-mail': [ac(1), DRAGON_SCALE_NOTE, resistanceChoice(LIST_IDS.dragonScale, 'Kind of dragon')],
  ...Object.fromEntries(DRAGON_SCALES.map(([dragon, t]) => [`dragon-scale-mail-${dragon}`, [ac(1), DRAGON_SCALE_NOTE, resist(t)]])),
  'dwarven-plate': [ac(2)],
  'elven-chain': [ac(1)],
  'glamoured-studded-leather-armor': [ac(1)],
  'demon-armor': [
    ac(1),
    language('Abyssal'),
    { do: { kind: 'grantAttack', attack: { id: 'demon-armor-claws', name: 'Unarmed Strike (Demon Armor)', range: 'melee', abilities: ['str'], damage: '1d8', damageType: 'Slashing' } } },
    ...attackBonus(1, { attackIds: ['demon-armor-claws'] })
  ],
  'spellguard-shield': [note('Advantage on saving throws against spells and other magical effects; spell attacks have disadvantage against you.')],

  // Weapons
  'weapon-1': magicWeapon('any', 1),
  'weapon-2': magicWeapon('any', 2),
  'weapon-3': magicWeapon('any', 3),
  'berserker-axe': [...magicWeapon(AXES, 1), add('hp.max', '@level')],
  'dagger-of-venom': magicWeapon(['dagger'], 1),
  defender: magicWeapon(SWORDS, 3),
  'dragon-slayer': magicWeapon(SWORDS, 1),
  'dwarven-thrower': magicWeapon(['warhammer'], 3),
  'flame-tongue': magicWeapon(SWORDS, 0, (appliesTo) => [
    toggle('flame-tongue', 'Flame Tongue', 'bonus', [{ do: { kind: 'extraDamage', damage: '2d6', damageType: 'Fire', appliesTo } }])
  ]),
  'frost-brand': [...magicWeapon(SWORDS, 0, (appliesTo) => [{ do: { kind: 'extraDamage', damage: '1d6', damageType: 'Cold', appliesTo } }]), resist('fire')],
  'giant-slayer': magicWeapon([...AXES, ...SWORDS], 1),
  'hammer-of-thunderbolts': magicWeapon(['maul'], 1),
  'holy-avenger': magicWeapon(SWORDS, 3),
  'luck-blade': [...magicWeapon(SWORDS, 1), ...saves(1)],
  'mace-of-smiting': magicWeapon(['mace'], 1),
  'nine-lives-stealer': magicWeapon(SWORDS, 2),
  'rod-of-lordly-might': magicWeapon(['mace'], 3),
  'scimitar-of-speed': magicWeapon(['scimitar'], 2),
  'sun-blade': magicWeapon(['longsword'], 2),
  'vorpal-sword': magicWeapon(SLASHING_SWORDS, 3),

  // Staffs and wands
  'staff-of-fire': [resist('fire')],
  'staff-of-frost': [resist('cold')],
  'staff-of-power': [...magicWeapon(['quarterstaff'], 2), ac(2), ...saves(2), spellAttack(2)],
  'staff-of-striking': magicWeapon(['quarterstaff'], 3),
  'staff-of-the-magi': [...magicWeapon(['quarterstaff'], 2), spellAttack(2), note('Advantage on saving throws against spells.')],
  'staff-of-the-woodlands': [...magicWeapon(['quarterstaff'], 2), spellAttack(2)],
  'staff-of-thunder-and-lightning': magicWeapon(['quarterstaff'], 2),
  'wand-of-the-war-mage-1': [spellAttack(1)],
  'wand-of-the-war-mage-2': [spellAttack(2)],
  'wand-of-the-war-mage-3': [spellAttack(3)],
  'rod-of-alertness': [{ do: { kind: 'rollMode', target: 'skill:perception', mode: 'advantage' } }, { do: { kind: 'rollMode', target: 'initiative', mode: 'advantage' } }],

  // Rings
  'ring-of-protection': [ac(1), ...saves(1)],
  'ring-of-resistance': [resistanceChoice(LIST_IDS.resistance, 'Damage type')],
  ...Object.fromEntries(RESISTANCE_TYPES.map((t) => [`ring-of-resistance-${t}`, [resist(t)]])),
  'ring-of-swimming': [atLeast('speed.swim', 40)],
  'ring-of-warmth': [resist('cold')],
  'ring-of-elemental-command-air': [resist('lightning'), atLeast('speed.fly', '@speed.walk'), language('Auran')],
  'ring-of-elemental-command-earth': [resist('acid'), language('Terran')],
  'ring-of-elemental-command-fire': [{ do: { kind: 'damageRelation', damageType: 'fire', relation: 'immunity' } }, language('Ignan')],
  'ring-of-elemental-command-water': [atLeast('speed.swim', '@speed.walk'), language('Aquan')],

  // Wondrous items
  'amulet-of-health': [scoreAtLeast('con', 19)],
  'gauntlets-of-ogre-power': [scoreAtLeast('str', 19)],
  'headband-of-intellect': [scoreAtLeast('int', 19)],
  'belt-of-giant-strength-hill': [scoreAtLeast('str', 21)],
  'belt-of-giant-strength-stone': [scoreAtLeast('str', 23)],
  'belt-of-giant-strength-frost': [scoreAtLeast('str', 23)],
  'belt-of-giant-strength-fire': [scoreAtLeast('str', 25)],
  'belt-of-giant-strength-cloud': [scoreAtLeast('str', 27)],
  'belt-of-giant-strength-storm': [scoreAtLeast('str', 29)],
  'belt-of-dwarvenkind': [
    scorePlus('con', 2),
    note('Advantage on Charisma (Persuasion) checks made to interact with dwarves.'),
    ...[resist('poison'), language('Dwarvish'), note('Advantage on saving throws against poison.')].map((e): Effect => ({ ...e, when: { kind: 'not', of: { kind: 'hasEntry', entryId: 'dwarf' } } }))
  ],
  'ioun-stone-of-agility': [scorePlus('dex', 2)],
  'ioun-stone-of-fortitude': [scorePlus('con', 2)],
  'ioun-stone-of-insight': [scorePlus('wis', 2)],
  'ioun-stone-of-intellect': [scorePlus('int', 2)],
  'ioun-stone-of-leadership': [scorePlus('cha', 2)],
  'ioun-stone-of-strength': [scorePlus('str', 2)],
  'ioun-stone-of-mastery': [add('prof', 1)],
  'ioun-stone-of-protection': [ac(1)],
  'boots-of-speed': [toggle('boots-of-speed', 'Boots of Speed', 'bonus', [{ do: { kind: 'modify', target: 'speed.walk', op: 'multiply', value: '2' } }])],
  'boots-of-striding-and-springing': [atLeast('speed.walk', 30)],
  'boots-of-the-winterlands': [resist('cold')],
  'bracers-of-archery': [
    { do: { kind: 'proficiency', category: 'weapon', value: 'longbow' } },
    { do: { kind: 'proficiency', category: 'weapon', value: 'shortbow' } },
    { do: { kind: 'modify', target: 'attack.damage', op: 'add', value: '2', appliesTo: { range: 'ranged', item: { itemIds: ['longbow', 'shortbow'] } } } }
  ],
  'bracers-of-defense': [{ when: NO_ARMOR_OR_SHIELD, do: { kind: 'modify', target: 'ac', op: 'add', value: '2' } }],
  'brooch-of-shielding': [resist('force'), note('Immunity to damage from the Magic Missile spell.')],
  'cloak-of-arachnida': [resist('poison'), atLeast('speed.climb', '@speed.walk')],
  'cloak-of-protection': [ac(1), ...saves(1)],
  'cloak-of-the-bat': [{ do: { kind: 'rollMode', target: 'skill:stealth', mode: 'advantage' } }],
  'cloak-of-the-manta-ray': [toggle('cloak-of-the-manta-ray', 'Manta Ray Hood', 'action', [atLeast('speed.swim', 60)])],
  'goggles-of-night': [add('sense.darkvision', 60)],
  'helm-of-brilliance': [resist('fire')],
  'mantle-of-spell-resistance': [note('Advantage on saving throws against spells.')],
  'periapt-of-proof-against-poison': [{ do: { kind: 'damageRelation', damageType: 'poison', relation: 'immunity' } }, { do: { kind: 'conditionImmunity', conditionId: 'poisoned' } }],
  'robe-of-eyes': [atLeast('sense.darkvision', 120)],
  'robe-of-stars': saves(1),
  'robe-of-the-archmagi': [
    { when: NO_BODY_ARMOR, do: { kind: 'acFormula', label: 'Robe of the Archmagi', formula: '15 + @dex.mod' } },
    add('spell.dc', 2),
    spellAttack(2),
    note('Advantage on saving throws against spells and other magical effects.')
  ],
  'scarab-of-protection': [note('Advantage on saving throws against spells.')],
  'slippers-of-spider-climbing': [atLeast('speed.climb', '@speed.walk')],
  'stone-of-good-luck-luckstone': [...saves(1), ...checks(1)],
  'winged-boots': [atLeast('speed.fly', '@speed.walk')],
  'wings-of-flying': [toggle('wings-of-flying', 'Wings of Flying', 'action', [atLeast('speed.fly', 60)])]
}

/** Charges as the SRD states them: [max, regained at dawn]. No regain = all of them come back; null = they never come back. */
const MAGIC_ITEM_CHARGES: Record<string, [number, string | null | undefined]> = {
  'cube-of-force': [36, '1d20'],
  'cubic-gate': [3, '1d3'],
  'eyes-of-charming': [3, undefined],
  'gem-of-brightness': [50, null],
  'gem-of-seeing': [3, '1d3'],
  'hammer-of-thunderbolts': [5, '1d4 + 1'],
  'helm-of-teleportation': [3, '1d3'],
  'mace-of-terror': [3, '1d3'],
  'medallion-of-thoughts': [3, '1d3'],
  'pipes-of-haunting': [3, '1d3'],
  'pipes-of-the-sewers': [3, '1d3'],
  'ring-of-animal-influence': [3, '1d3'],
  'ring-of-elemental-command': [5, '1d4 + 1'],
  'ring-of-elemental-command-air': [5, '1d4 + 1'],
  'ring-of-elemental-command-earth': [5, '1d4 + 1'],
  'ring-of-elemental-command-fire': [5, '1d4 + 1'],
  'ring-of-elemental-command-water': [5, '1d4 + 1'],
  'ring-of-evasion': [3, '1d3'],
  'ring-of-shooting-stars': [6, '1d6'],
  'ring-of-the-ram': [3, '1d3'],
  'ring-of-three-wishes': [3, null],
  'robe-of-scintillating-colors': [3, '1d3'],
  'scarab-of-protection': [12, null],
  'staff-of-charming': [10, '1d8 + 2'],
  'staff-of-fire': [10, '1d6 + 4'],
  'staff-of-frost': [10, '1d6 + 4'],
  'staff-of-healing': [10, '1d6 + 4'],
  'staff-of-power': [20, '2d8 + 4'],
  'staff-of-striking': [10, '1d6 + 4'],
  'staff-of-swarming-insects': [10, '1d6 + 4'],
  'staff-of-the-magi': [50, '4d6 + 2'],
  'staff-of-the-woodlands': [10, '1d6 + 4'],
  'staff-of-withering': [3, '1d3'],
  'talisman-of-pure-good': [7, null],
  'talisman-of-ultimate-evil': [6, null],
  'trident-of-fish-command': [3, '1d3'],
  'wand-of-binding': [7, '1d6 + 1'],
  'wand-of-enemy-detection': [7, '1d6 + 1'],
  'wand-of-fear': [7, '1d6 + 1'],
  'wand-of-fireballs': [7, '1d6 + 1'],
  'wand-of-lightning-bolts': [7, '1d6 + 1'],
  'wand-of-magic-detection': [3, '1d3'],
  'wand-of-magic-missiles': [7, '1d6 + 1'],
  'wand-of-paralysis': [7, '1d6 + 1'],
  'wand-of-polymorph': [7, '1d6 + 1'],
  'wand-of-secrets': [3, '1d3'],
  'wand-of-web': [7, '1d6 + 1'],
  'wand-of-wonder': [7, '1d6 + 1'],
  'orb-of-dragonkind': [7, '1d4 + 3']
}

function chargesFor(id: string): ResourceDef | undefined {
  const charges = MAGIC_ITEM_CHARGES[id]
  if (!charges) return undefined
  const [max, regain] = charges
  return { id: `${id}-charges`, name: 'Charges', max: String(max), recharge: regain === null ? 'none' : 'dawn', ...(regain ? { regain } : {}) }
}

export function srdItems(): ItemInput[] {
  return [
    ...EQUIPMENT.map(equipmentItem),
    ...MAGIC_ITEMS.map((m): ItemInput => {
      const requiresAttunement = /requires attunement/i.test(m.description)
      const charges = chargesFor(m.id)
      const effects = MAGIC_ITEM_EFFECTS[m.id]
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        category: m.category,
        rarity: m.rarity,
        requiresAttunement,
        effectsWhen: requiresAttunement ? 'attuned' : 'equipped',
        ...(charges ? { charges } : {}),
        ...(effects ? { effects } : {})
      }
    })
  ]
}

/** Ids with effects or charges, for tests that check every entry names a real SRD item. */
export const MAGIC_ITEM_RULE_IDS = [...new Set([...Object.keys(MAGIC_ITEM_EFFECTS), ...Object.keys(MAGIC_ITEM_CHARGES)])]
