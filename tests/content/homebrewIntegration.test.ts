// Everything added since 0.6.0 that a homebrew pack can use, in one pack:
// it must validate cleanly and work on a character the same way the SRD's
// versions do.
import { describe, expect, it } from 'vitest'
import { deriveCharacter, type CharacterBuild } from '@shared/content/engine'
import { answersToEntry, blankAnswers, type SpellAnswers, type WeaponAnswers } from '@shared/content/guided'
import { restResources } from '@shared/content/resourceMath'
import { spellNumbers } from '@shared/content/spellNumbers'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'
import { parsePack, validatePack } from '@shared/content/validate'

const bolt: SpellAnswers = { ...(blankAnswers('spell', 'ember-bolt') as SpellAnswers), name: 'Ember Bolt', level: 0, delivery: 'attack', damage: '1d10', damageType: 'Fire', lists: ['warden'] }
const mend: SpellAnswers = { ...(blankAnswers('spell', 'ember-mend') as SpellAnswers), name: 'Ember Mend', level: 1, delivery: 'none', healing: '1d8', upcastDice: '1d8', lists: ['warden'] }
const blade: WeaponAnswers = { ...(blankAnswers('weapon', 'ember-blade') as WeaponAnswers), name: 'Ember Blade', magicBonus: 0, mastery: 'Topple' }

const input = {
  formatVersion: 1,
  id: 'embers',
  name: 'Embers',
  dependsOn: [SRD_PACK_ID],
  vocabulary: { conditions: [{ id: 'scorched', name: 'Scorched', effects: [{ do: { kind: 'rollMode', target: 'attack', mode: 'disadvantage' } }] }] },
  classes: [
    {
      id: 'warden',
      name: 'Warden',
      hitDie: 10,
      saves: ['str', 'wis'],
      weaponProficiencies: ['simple', 'martial'],
      spellcasting: { ability: 'wis', slots: { rows: [[2], [3], [4, 2]] }, cantrips: '2', prepared: '@wis.mod + @classLevel' },
      levels: [
        {
          level: 1,
          features: [
            {
              id: 'training',
              name: 'Training',
              effects: [
                // An empty abilities list offers all six.
                { do: { kind: 'grantChoice', choice: { id: 'asi', label: 'Training', from: { kind: 'abilities', abilities: [] }, onPick: [{ do: { kind: 'modify', target: 'ability.$pick.score', op: 'add', value: '1' } }] } } },
                { do: { kind: 'grantChoice', choice: { id: 'skill', label: 'Skill', count: '2', from: { kind: 'skills' }, onPick: [{ do: { kind: 'proficiency', category: 'skill', value: '$pick' } }] } } },
                { do: { kind: 'grantChoice', choice: { id: 'expertise', label: 'Expertise', count: '1', from: { kind: 'skills', proficientOnly: true }, onPick: [{ do: { kind: 'proficiency', category: 'skill', value: '$pick', level: 'expertise' } }] } } },
                { do: { kind: 'grantChoice', choice: { id: 'weapon-mastery', label: 'Weapon Mastery', count: '1', from: { kind: 'weapons', range: 'melee', proficientOnly: true }, onPick: [{ do: { kind: 'weaponMastery', itemId: '$pick' } }] } } },
                { do: { kind: 'grantChoice', choice: { id: 'weapon', label: 'Favoured Weapon', from: { kind: 'weapons' }, onPick: [{ do: { kind: 'proficiency', category: 'weapon', value: '$pick' } }] } } }
              ]
            }
          ]
        }
      ]
    }
  ],
  spells: [answersToEntry(bolt), answersToEntry(mend)],
  items: [
    answersToEntry(blade),
    {
      id: 'ember-ring',
      name: 'Ember Ring',
      description: 'Warm against the skin.',
      category: 'Ring',
      requiresAttunement: true,
      effectsWhen: 'attuned',
      charges: { id: 'charges', name: 'Charges', max: '4', recharge: 'dawn', regain: '1' },
      effects: [{ do: { kind: 'modify', target: 'ac', op: 'add', value: '1' } }]
    }
  ]
}

const W = (id: string): string => `embers:${id}`
const build = (extra: Partial<CharacterBuild> = {}): CharacterBuild => ({
  abilityScores: { str: 16, dex: 12, con: 14, int: 10, wis: 16, cha: 8 },
  classes: [{ classId: W('warden'), level: 3 }],
  ...extra
})

describe('a homebrew pack using the 0.6 additions', () => {
  const pack = parsePack(input as never, [srdPack()])
  const derive = (extra: Partial<CharacterBuild> = {}) => deriveCharacter(build(extra), [srdPack(), pack], { keepEvaluator: true })

  it('validates with no errors', () => {
    expect(validatePack(input, [srdPack()]).issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('choices: empty filters offer everything; Expertise, Weapon Mastery and weapon proficiency work', () => {
    const d = derive({ equipment: [{ key: 'b', itemId: W('ember-blade'), equipped: true }] })
    const pick = (label: string) => d.choices.find((c) => c.label === label)!
    expect(pick('Training').options).toHaveLength(6)
    const choices = {
      [pick('Training').key]: ['str'],
      [pick('Skill').key]: ['athletics', 'perception'],
      [pick('Expertise').key]: ['athletics'],
      [pick('Weapon Mastery').key]: [W('ember-blade')],
      [pick('Favoured Weapon').key]: [`${SRD_PACK_ID}:longbow`]
    }
    expect(pick('Weapon Mastery').options.some((o) => o.name === 'Longbow')).toBe(false)
    const picked = derive({ choices, equipment: [{ key: 'b', itemId: W('ember-blade'), equipped: true }] })
    expect(picked.abilities.str.score).toBe(17)
    expect(picked.skills.athletics.proficiency).toBe('expertise')
    expect(picked.attacks.find((a) => a.name === 'Ember Blade')?.mastery).toBe('Topple')
    expect(picked.proficiencies.weapon.map((w) => w.toLowerCase())).toContain(`${SRD_PACK_ID}:longbow`)
    expect(picked.diagnostics.filter((x) => x.severity === 'error')).toEqual([])
  })

  it('spells: a homebrew cantrip scales and a healing spell upcasts with the spellcasting modifier', () => {
    const d = derive()
    const spell = (id: string) => pack.spells.find((s) => s.id === id)!
    expect(spellNumbers(d, spell('ember-bolt'))).toMatchObject({ attackBonus: 2 + 3, damage: '1d10', damageType: 'Fire' })
    expect(spellNumbers(derive({ classes: [{ classId: W('warden'), level: 5 }] }), spell('ember-bolt')).damage).toBe('2d10')
    expect(spellNumbers(d, spell('ember-mend'), 2).healing).toBe('2d8 + 3')
  })

  it('items: charges only while attuned and equipped, regaining their dawn amount', () => {
    const off = derive({ equipment: [{ key: 'r', itemId: W('ember-ring'), equipped: true }] })
    expect(off.resources.some((r) => r.name === 'Ember Ring charges')).toBe(false)
    const on = derive({ equipment: [{ key: 'r', itemId: W('ember-ring'), equipped: true, attuned: true }] })
    const charges = on.resources.find((r) => r.name === 'Ember Ring charges')!
    expect(charges.max).toBe(4)
    expect(charges.description).toBe('Warm against the skin.')
    expect(on.armorClass).toBe(off.armorClass + 1)
    const after = restResources('long', on.resources, { resourceUsed: { [charges.id]: 3 }, resourceTemp: {} })
    expect(after.resourceUsed[charges.id]).toBe(2)
  })

  it('conditions: a pack condition applies its effects', () => {
    expect(derive({ conditions: [{ id: 'scorched' }] }).attackMode).toBe('disadvantage')
  })
})
