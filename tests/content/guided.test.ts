import { describe, expect, it } from 'vitest'
import { deriveCharacter, type CharacterBuild } from '@shared/content/engine'
import {
  GUIDED_KINDS,
  answersToEntry,
  blankAnswers,
  describeAnswers,
  describeChanges,
  entryToAnswers,
  placeAnswers,
  removeGuidedEntry,
  guidedKindFor,
  mergeIntoEntry,
  spellDice,
  type ArmorAnswers,
  type FeatAnswers,
  type GuidedAnswers,
  type MagicItemAnswers,
  type SpeciesAnswers,
  type SpellAnswers,
  type WeaponAnswers
} from '@shared/content/guided'
import { srdPack, SRD_PACK_ID } from '@shared/content/srd'
import { parsePack, validatePack } from '@shared/content/validate'

const flame: WeaponAnswers = {
  ...(blankAnswers('weapon', 'flame-tongue') as WeaponAnswers),
  name: 'Flame Tongue',
  damage: '1d8',
  damageType: 'Slashing',
  versatileDamage: '1d10',
  properties: ['Versatile'],
  magicBonus: 1,
  extraDamage: { dice: '2d6', damageType: 'Fire' },
  attunement: true
}
const cloak: MagicItemAnswers = {
  ...(blankAnswers('magicItem', 'cloak-of-embers') as MagicItemAnswers),
  name: 'Cloak of Embers',
  itemType: 'Cloak',
  attunement: true,
  benefits: [
    { type: 'ac', amount: 1 },
    { type: 'allSaves', amount: 1 },
    { type: 'damage', relation: 'resistance', damageTypes: ['fire', 'cold'] },
    { type: 'moveSpeed', mode: 'fly', feet: 0 },
    { type: 'sense', sense: 'darkvision', feet: 60 },
    { type: 'advantage', target: 'initiative' },
    { type: 'skills', skills: ['stealth'], expertise: false },
    { type: 'hp', amount: 1, perLevel: true },
    { type: 'abilitySet', ability: 'str', score: 19 },
    { type: 'spells', spellIds: [`${SRD_PACK_ID}:misty-step`] },
    { type: 'note', text: 'Glows faintly.' }
  ],
  charges: { count: 3, recharge: 'dawn', regain: '1d3' }
}
const plate: ArmorAnswers = { ...(blankAnswers('armor', 'emberplate') as ArmorAnswers), name: 'Emberplate', armorType: 'heavy', baseAc: 18, magicBonus: 2, strength: 15, stealthDisadvantage: true }
const shield: ArmorAnswers = { ...(blankAnswers('armor', 'ward-shield') as ArmorAnswers), name: 'Ward Shield', armorType: 'shield', baseAc: 2, magicBonus: 1 }
const bolt: SpellAnswers = { ...(blankAnswers('spell', 'cinder-bolt') as SpellAnswers), name: 'Cinder Bolt', level: 0, delivery: 'attack', damage: '1d10', damageType: 'Fire', lists: ['wizard'] }
const blast: SpellAnswers = { ...(blankAnswers('spell', 'ash-storm') as SpellAnswers), name: 'Ash Storm', level: 3, damage: '8d6', upcastDice: '1d6', material: 'a pinch of ash', concentration: true }
const mend: SpellAnswers = { ...(blankAnswers('spell', 'ember-mend') as SpellAnswers), name: 'Ember Mend', level: 1, delivery: 'none', healing: '2d8', upcastDice: '2d8' }
const feat: FeatAnswers = {
  ...(blankAnswers('feat', 'fireheart') as FeatAnswers),
  name: 'Fireheart',
  abilityIncrease: { abilities: ['con', 'cha'], amount: 1 },
  benefits: [{ type: 'initiative', amount: 2 }, { type: 'proficiency', category: 'language', values: ['Primordial'] }]
}
const species: SpeciesAnswers = {
  ...(blankAnswers('species', 'cinderfolk') as SpeciesAnswers),
  name: 'Cinderfolk',
  speed: 35,
  darkvision: 60,
  traits: [{ id: 'ashen-hide', name: 'Ashen Hide', description: 'Your skin shrugs off flame.', benefits: [{ type: 'damage', relation: 'resistance', damageTypes: ['fire'] }], extras: [] }]
}
const all: GuidedAnswers[] = [flame, cloak, plate, shield, bolt, blast, mend, feat, species]

function packOf(entries: GuidedAnswers[]): ReturnType<typeof parsePack> {
  const pack: Record<string, unknown> = { formatVersion: 1, id: 'guided', name: 'Guided', dependsOn: [SRD_PACK_ID] }
  for (const a of entries) {
    const kind = GUIDED_KINDS.find((k) => k.kind === a.kind)!.entryKind
    pack[kind] = [...((pack[kind] as unknown[]) ?? []), answersToEntry(a)]
  }
  return parsePack(pack as never, [srdPack()])
}

const fighter = (extra: Partial<CharacterBuild> = {}): CharacterBuild => ({
  abilityScores: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
  classes: [{ classId: `${SRD_PACK_ID}:fighter`, level: 5 }],
  ...extra
})

describe('guided answers', () => {
  it('every kind validates with no errors', () => {
    const pack: Record<string, unknown> = { formatVersion: 1, id: 'guided', name: 'Guided', dependsOn: [SRD_PACK_ID] }
    for (const a of all) {
      const kind = GUIDED_KINDS.find((k) => k.kind === a.kind)!.entryKind
      pack[kind] = [...((pack[kind] as unknown[]) ?? []), answersToEntry(a)]
    }
    const v = validatePack(pack as never, [srdPack()])
    expect(v.issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('reads its own entries back unchanged', () => {
    for (const a of all) {
      const entry = answersToEntry(a)
      const kind = guidedKindFor(GUIDED_KINDS.find((k) => k.kind === a.kind)!.entryKind, entry)
      expect(kind).toBe(a.kind)
      const back = entryToAnswers(kind!, entry)
      expect(answersToEntry(back)).toEqual(entry)
    }
  })

  it('keeps effects and fields it cannot show', () => {
    const odd = { when: { kind: 'level', min: 5 }, do: { kind: 'modify', target: 'ac', op: 'add', value: '1' } }
    const entry = { ...answersToEntry(cloak), source: 'Homebrew p. 3', effects: [...(answersToEntry(cloak).effects as unknown[]), odd] }
    const answers = entryToAnswers('magicItem', entry) as MagicItemAnswers
    expect(answers.extras).toEqual([odd])
    const merged = mergeIntoEntry({ ...answers, name: 'Renamed' }, entry)
    expect(merged.source).toBe('Homebrew p. 3')
    expect(merged.name).toBe('Renamed')
    expect(merged.effects).toContainEqual(odd)
  })

  it('a magic weapon attacks and hits harder', () => {
    const pack = packOf([flame])
    const d = deriveCharacter(fighter({ equipment: [{ itemId: 'guided:flame-tongue', equipped: true, attuned: true }] }), [srdPack(), pack])
    const attack = d.attacks.find((a) => a.name === 'Flame Tongue')!
    // +2 Str, +3 proficiency, +1 magic.
    expect(attack.attackBonus).toBe(6)
    expect(attack.damage).toBe('1d8 + 3')
    expect(attack.extraDamage).toEqual([{ damage: '2d6', damageType: 'Fire', source: 'Flame Tongue' }])
  })

  it('armour and a shield set Armor Class, with the Strength and Stealth drawbacks', () => {
    const pack = packOf([plate, shield])
    const d = deriveCharacter(
      fighter({
        equipment: [
          { itemId: 'guided:emberplate', equipped: true },
          { itemId: 'guided:ward-shield', equipped: true }
        ]
      }),
      [srdPack(), pack]
    )
    expect(d.diagnostics.filter((x) => x.severity === 'error')).toEqual([])
    expect(d.armorClass).toBe(18 + 2 + 3)
    expect(d.speeds.walk).toBe(20)
    expect(d.skills.stealth.mode).toBe('disadvantage')
  })

  it('a magic item applies its benefits while attuned', () => {
    const pack = packOf([cloak])
    const without = deriveCharacter(fighter(), [srdPack(), pack])
    const d = deriveCharacter(fighter({ equipment: [{ itemId: 'guided:cloak-of-embers', equipped: true, attuned: true }] }), [srdPack(), pack])
    expect(d.diagnostics.filter((x) => x.severity === 'error')).toEqual([])
    expect(d.armorClass).toBe(without.armorClass + 1)
    expect(d.saves.wis.bonus).toBe(without.saves.wis.bonus + 1)
    expect(d.damageRelations.resistances).toEqual(expect.arrayContaining(['fire', 'cold']))
    expect(d.speeds.fly).toBe(30)
    expect(d.senses.darkvision.range).toBe(60)
    expect(d.initiativeMode).toBe('advantage')
    expect(d.maxHp).toBe(without.maxHp + 5)
    expect(d.abilities.str.score).toBe(19)
    expect(d.resources.find((r) => r.name === 'Charges')?.max).toBe(3)
    expect(d.spellcasting.granted.map((s) => s.name)).toContain('Misty Step')
    // Not attuned: nothing applies.
    const loose = deriveCharacter(fighter({ equipment: [{ itemId: 'guided:cloak-of-embers', equipped: true }] }), [srdPack(), pack])
    expect(loose.armorClass).toBe(without.armorClass)
  })

  it('spells scale with slot level and character level', () => {
    expect(spellDice('8d6', 3, '1d6', false)).toBe('(8 + (@slotLevel - 3) * 1)d6')
    expect(spellDice('1d10', 0, '', true)).toBe('(1 * (1 + floor((@level + 1) / 6)))d10')
    expect(answersToEntry(blast)).toMatchObject({ components: 'V, S, M (a pinch of ash)', concentration: true, saveAbility: 'dex' })
    expect(answersToEntry(mend).healing).toBe('(2 + (@slotLevel - 1) * 2)d8 + @spell.mod')
    expect(describeAnswers(blast)).toEqual(['Dexterity saving throw: 8d6 fire damage', '+1d6 for each slot level above 3'])
  })

  it('a feat asks for its ability increase and grants its benefits', () => {
    const pack = packOf([feat])
    const entry = pack.feats[0]
    expect(entry.prerequisiteText).toBe('Level 4+')
    const effects = entry.effects as Array<{ do: { kind: string; choice?: { from: unknown } } }>
    expect(effects[0].do.choice?.from).toEqual({ kind: 'abilities', abilities: ['con', 'cha'] })
    expect(describeAnswers(feat)).toEqual(['+1 to your choice of Constitution or Charisma (up to 20)', '+2 to initiative', 'Speaks Primordial'])
  })

  it('a species gets its speed, darkvision and traits', () => {
    const pack = packOf([species])
    const d = deriveCharacter(fighter({ speciesId: 'guided:cinderfolk' }), [srdPack(), pack])
    expect(d.speeds.walk).toBe(35)
    expect(d.senses.darkvision.range).toBe(60)
    expect(d.damageRelations.resistances).toContain('fire')
  })

  it('describes what it changes on a character', () => {
    const pack = packOf([flame, cloak])
    const before = deriveCharacter(fighter(), [srdPack(), pack])
    const after = deriveCharacter(fighter({ equipment: [{ itemId: 'guided:flame-tongue', equipped: true, attuned: true }, { itemId: 'guided:cloak-of-embers', equipped: true, attuned: true }] }), [srdPack(), pack])
    const lines = describeChanges(before, after)
    // The cloak sets Strength to 19 (+4), which the sword uses too: +4 Str, +3 proficiency, +1 magic.
    expect(lines).toContain(`Armor Class: ${before.armorClass} → ${before.armorClass + 1}`)
    expect(lines).toContain('New attack — Flame Tongue: +8 to hit, 1d8 + 5 slashing + 2d6 fire')
    expect(lines).toContain('Resistant to cold, fire damage')
    expect(lines).toContain('Flying speed: 0 ft. → 30 ft.')
    expect(lines).toContain('Can cast Misty Step')
    expect(lines).toContain('Charges: 3')
    expect(lines).toContain('Glows faintly.')
  })

  it('saves new things under an id from their name, and edits in place', () => {
    const draft = { formatVersion: 1, id: 'my-homebrew', name: 'My Homebrew', dependsOn: [SRD_PACK_ID], items: [{ id: 'flame-tongue', name: 'Old', category: 'Weapon' }] }
    const first = placeAnswers(draft as never, { ...flame, id: 'new' }, null)
    expect(first.answers.id).toBe('flame-tongue-2')
    expect((first.draft.items as Array<{ id: string }>).map((i) => i.id)).toEqual(['flame-tongue', 'flame-tongue-2'])
    // The weapon's own bonus points at its final id.
    expect(JSON.stringify(first.draft.items![1])).toContain('"itemIds":["flame-tongue-2"]')
    const again = placeAnswers(first.draft, { ...first.answers, name: 'Flame Tongue II' }, 'flame-tongue-2')
    expect((again.draft.items as Array<{ name: string }>).map((i) => i.name)).toEqual(['Old', 'Flame Tongue II'])
  })

  it('deletes a guided thing from its pack', () => {
    const draft = { formatVersion: 1, id: 'my-homebrew', name: 'My Homebrew', dependsOn: [SRD_PACK_ID] }
    const placed = placeAnswers(placeAnswers(draft as never, { ...flame, id: 'new' }, null).draft, { ...cloak, id: 'new' }, null)
    const after = removeGuidedEntry(placed.draft, 'weapon', 'flame-tongue')
    expect((after.items as Array<{ id: string }>).map((i) => i.id)).toEqual(['cloak-of-embers'])
  })
})
