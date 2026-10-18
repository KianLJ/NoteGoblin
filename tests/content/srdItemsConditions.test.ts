import { describe, expect, it } from 'vitest'
import { MAGIC_ITEMS } from '@shared/compendium'
import { deriveCharacter, type CharacterBuild } from '@shared/content/engine'
import { restResources } from '@shared/content/resourceMath'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'
import { MAGIC_ITEM_RULE_IDS } from '@shared/content/srd/items'

const SRD = `${SRD_PACK_ID}:`
const SCORES = { str: 14, dex: 16, con: 14, int: 10, wis: 14, cha: 16 }
const derive = (b: Partial<CharacterBuild> = {}) => deriveCharacter({ abilityScores: SCORES, classes: [{ classId: `${SRD}fighter`, level: 5 }], ...b }, [srdPack()])
type Equipment = NonNullable<CharacterBuild['equipment']>
/** Worn (and attuned) unless said otherwise. */
const wearing = (...ids: string[]): Equipment => ids.map((id) => ({ key: id, itemId: `${SRD}${id}`, equipped: true, attuned: true }))

describe('SRD magic items on the sheet', () => {
  it('only names real SRD magic items', () => {
    const ids = new Set(MAGIC_ITEMS.map((m) => m.id))
    expect(MAGIC_ITEM_RULE_IDS.filter((id) => !ids.has(id))).toEqual([])
  })

  it('Cloak of Protection: +1 AC and saves, only while worn and attuned', () => {
    const base = derive()
    const cloak = derive({ equipment: wearing('cloak-of-protection') })
    expect(cloak.armorClass).toBe(base.armorClass + 1)
    expect(cloak.saves.wis.bonus).toBe(base.saves.wis.bonus + 1)
    expect(cloak.saves.str.bonus).toBe(base.saves.str.bonus + 1)
    const unattuned = derive({ equipment: [{ key: 'c', itemId: `${SRD}cloak-of-protection`, equipped: true }] })
    expect(unattuned.armorClass).toBe(base.armorClass)
  })

  it('score-setting items raise a lower score and leave a higher one alone; Ioun stones cap at 20', () => {
    expect(derive({ equipment: wearing('belt-of-giant-strength-hill') }).abilities.str.score).toBe(21)
    expect(derive({ equipment: wearing('gauntlets-of-ogre-power') }).abilities.str.score).toBe(19)
    expect(derive({ abilityScores: { ...SCORES, str: 20 }, equipment: wearing('gauntlets-of-ogre-power') }).abilities.str.score).toBe(20)
    expect(derive({ equipment: wearing('amulet-of-health') }).abilities.con.score).toBe(19)
    expect(derive({ equipment: wearing('ioun-stone-of-agility') }).abilities.dex.score).toBe(18)
    expect(derive({ abilityScores: { ...SCORES, dex: 19 }, equipment: wearing('ioun-stone-of-agility') }).abilities.dex.score).toBe(20)
  })

  it('+N armour adds to AC on top of the armour worn', () => {
    const plate = derive({ equipment: wearing('plate-armor') })
    expect(derive({ equipment: wearing('plate-armor', 'armor-2') }).armorClass).toBe(plate.armorClass + 2)
  })

  it('a "+2 weapon (any)" asks which weapon it is and boosts that weapon’s attacks', () => {
    const equipment = [...wearing('weapon-2', 'longsword', 'dagger')]
    const d = derive({ equipment })
    const choice = d.choices.find((c) => c.sourceKey === 'item:weapon-2')!
    expect(choice.options.map((o) => o.id)).toContain(`${SRD}longsword`)
    const picked = derive({ equipment, choices: { [choice.key]: [`${SRD}longsword`] } })
    const longsword = (x: typeof d) => x.attacks.find((a) => a.id === 'longsword')!
    expect(longsword(picked).attackBonus).toBe(longsword(d).attackBonus + 2)
    expect(longsword(picked).damage).toBe('1d8 + 4')
    expect(picked.attacks.find((a) => a.id === 'dagger')!.attackBonus).toBe(d.attacks.find((a) => a.id === 'dagger')!.attackBonus)
  })

  it('a magic weapon with one possible base needs no pick (Dagger of Venom)', () => {
    const plain = derive({ equipment: wearing('dagger') }).attacks.find((a) => a.id === 'dagger')!
    const venom = derive({ equipment: wearing('dagger', 'dagger-of-venom') }).attacks.find((a) => a.id === 'dagger')!
    expect(venom.attackBonus).toBe(plain.attackBonus + 1)
  })

  it('Ring of Resistance resists the picked damage type; the named rings resist their own', () => {
    const ring = derive({ equipment: wearing('ring-of-resistance') })
    const choice = ring.choices.find((c) => c.sourceKey === 'item:ring-of-resistance')!
    expect(choice.options).toHaveLength(10)
    expect(derive({ equipment: wearing('ring-of-resistance'), choices: { [choice.key]: ['fire'] } }).damageRelations.resistances).toContain('fire')
    expect(derive({ equipment: wearing('ring-of-resistance-cold') }).damageRelations.resistances).toContain('cold')
  })

  it('Armor of Vulnerability: resistance to the picked type, vulnerability to the other two', () => {
    const d = derive({ equipment: wearing('armor-of-vulnerability') })
    const choice = d.choices.find((c) => c.sourceKey === 'item:armor-of-vulnerability')!
    const picked = derive({ equipment: wearing('armor-of-vulnerability'), choices: { [choice.key]: ['piercing'] } })
    expect(picked.damageRelations.resistances).toContain('piercing')
    expect(picked.damageRelations.vulnerabilities).toEqual(['bludgeoning', 'slashing'])
  })

  it('wands and staffs have charges that regain their SRD amount at dawn', () => {
    const d = derive({ classes: [{ classId: `${SRD}wizard`, level: 5 }], equipment: wearing('wand-of-fireballs') })
    const charges = d.resources.find((r) => r.name === 'Wand of Fireballs charges')!
    expect(charges).toMatchObject({ max: 7, recharge: 'dawn', regain: '1d6 + 1' })
    // A roll of 1 on the d6 gives back 2 of the 6 spent charges.
    const after = restResources('long', [charges], { resourceUsed: { [charges.id]: 6 }, resourceTemp: {} }, () => 0)
    expect(after.resourceUsed[charges.id]).toBe(4)
    const talisman = derive({ equipment: wearing('talisman-of-pure-good') }).resources.find((r) => r.name === 'Talisman of Pure Good charges')!
    expect(talisman).toMatchObject({ max: 7, recharge: 'none' })
  })

  it('spellcasting items: Wand of the War Mage and Robe of the Archmagi', () => {
    const wizard = (equipment: Equipment = []) => derive({ classes: [{ classId: `${SRD}wizard`, level: 5 }], equipment })
    const base = wizard()
    expect(wizard(wearing('wand-of-the-war-mage-2')).spellcasting.attackBonus).toBe(base.spellcasting.attackBonus! + 2)
    const robe = wizard(wearing('robe-of-the-archmagi'))
    expect(robe.spellcasting.dc).toBe(base.spellcasting.dc! + 2)
    expect(robe.spellcasting.attackBonus).toBe(base.spellcasting.attackBonus! + 2)
    expect(robe.armorClass).toBe(15 + 3)
  })

  it('speeds, senses and checks', () => {
    expect(derive({ equipment: wearing('ring-of-swimming') }).speeds.swim).toBe(40)
    expect(derive({ equipment: wearing('winged-boots') }).speeds.fly).toBe(30)
    expect(derive({ equipment: wearing('goggles-of-night') }).senses.darkvision?.range).toBe(60)
    const base = derive()
    const luck = derive({ equipment: wearing('stone-of-good-luck-luckstone') })
    expect(luck.skills.stealth.bonus).toBe(base.skills.stealth.bonus + 1)
    expect(luck.initiative).toBe(base.initiative + 1)
    expect(luck.saves.con.bonus).toBe(base.saves.con.bonus + 1)
  })

  it('Boots of Speed double walking speed while clicked on', () => {
    const boots = derive({ equipment: wearing('boots-of-speed') })
    expect(boots.toggles.map((t) => t.id)).toContain('boots-of-speed')
    expect(boots.speeds.walk).toBe(30)
    expect(derive({ equipment: wearing('boots-of-speed'), activeToggles: ['boots-of-speed'] }).speeds.walk).toBe(60)
  })
})

describe('SRD conditions on the sheet', () => {
  const withCondition = (id: string) => derive({ conditions: [{ id }] })

  it('Poisoned: disadvantage on attack rolls and ability checks', () => {
    const d = withCondition('poisoned')
    expect(d.attacks.every((a) => a.mode === 'disadvantage')).toBe(true)
    expect(d.checkModes.str).toBe('disadvantage')
    expect(d.checkModes.cha).toBe('disadvantage')
  })

  it('Restrained: Speed 0, disadvantage on attacks and Dexterity saves', () => {
    const d = withCondition('restrained')
    expect(d.speeds.walk).toBe(0)
    expect(d.attacks[0].mode).toBe('disadvantage')
    expect(d.saves.dex.mode).toBe('disadvantage')
    expect(d.saves.str.mode).toBeUndefined()
  })

  it('Invisible: advantage on attacks and initiative', () => {
    const d = withCondition('invisible')
    expect(d.attacks[0].mode).toBe('advantage')
    expect(d.initiativeMode).toBe('advantage')
  })

  it('Prone and Blinded: disadvantage on attacks; Frightened on checks too', () => {
    expect(withCondition('prone').attacks[0].mode).toBe('disadvantage')
    expect(withCondition('blinded').attacks[0].mode).toBe('disadvantage')
    expect(withCondition('frightened').checkModes.wis).toBe('disadvantage')
  })

  it('Paralyzed, Stunned, Unconscious: auto-fail Str/Dex saves as a reminder; Paralyzed and Unconscious stop you', () => {
    for (const id of ['paralyzed', 'stunned', 'unconscious', 'petrified']) {
      const d = withCondition(id)
      expect(d.notes.some((n) => /Strength and Dexterity saving throws/.test(n.text))).toBe(true)
      expect(d.initiativeMode).toBe('disadvantage')
    }
    expect(withCondition('paralyzed').speeds.walk).toBe(0)
    expect(withCondition('stunned').speeds.walk).toBe(30)
  })

  it('Petrified: resistance to all damage and immunity to Poisoned', () => {
    const d = withCondition('petrified')
    expect(d.damageRelations.resistances).toEqual(expect.arrayContaining(['fire', 'poison', 'slashing', 'psychic']))
    expect(d.conditionImmunities).toContain('poisoned')
  })

  it('advantage from Invisible and disadvantage from Poisoned cancel out', () => {
    expect(derive({ conditions: [{ id: 'invisible' }, { id: 'poisoned' }] }).attacks[0].mode).toBeUndefined()
  })
})
