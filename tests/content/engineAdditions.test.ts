// The universal engine additions: archetypes, variable spends, restores,
// point-buy choices, counters, ability aliases, companions and the new
// stats (damage reduction, crit threshold, reactions, attacks per action,
// senses, @highestClassLevel) plus multiclass rules.

import { describe, expect, it } from 'vitest'
import { deriveCharacter, type CharacterBuild } from '@shared/content/engine'
import { parsePack, validatePack } from '@shared/content/validate'
import type { ContentPack, ContentPackInput } from '@shared/content/schema'
import { core } from './packs'

const SCORES = { str: 16, dex: 12, con: 14, int: 10, wis: 15, cha: 8 }

const homebrewInput: ContentPackInput = {
  formatVersion: 1,
  id: 'hb',
  name: 'Additions',
  dependsOn: ['core'],
  vocabulary: {
    counters: [{ id: 'breakthroughs', name: 'Breakthroughs', max: '3' }],
    abilityAliases: [{ id: 'ce', name: 'Cursed Energy ability', options: ['wis', 'cha'] }],
    senses: [{ id: 'cursed-sight', name: 'Cursed Sight' }]
  },
  optionLists: [
    {
      id: 'body',
      name: 'Body Improvements',
      options: [
        { id: 'tough', name: 'Tough Skin', cost: '2', group: 'defence', effects: [{ do: { kind: 'modify', target: 'ac', op: 'add', value: '1' } }] },
        { id: 'quick', name: 'Quick Feet', cost: '1', group: 'speed', effects: [{ do: { kind: 'modify', target: 'speed.walk', op: 'add', value: '5' } }] },
        { id: 'hard', name: 'Hardened', cost: '1', group: 'defence' }
      ]
    }
  ],
  archetypes: [
    {
      id: 'blood',
      name: 'Blood Manipulation',
      tags: ['innate'],
      levelBasis: 'highestClass',
      columns: [{ id: 'blood-dice', label: 'Blood Dice', values: [1, 1, 2, 2, 2, 3] }],
      levels: [
        {
          level: 1,
          features: [
            {
              id: 'piercing',
              name: 'Piercing Blood',
              effects: [
                {
                  do: {
                    kind: 'grantAction',
                    action: {
                      id: 'piercing-blood',
                      name: 'Piercing Blood',
                      actionType: 'action',
                      spend: { resourceId: 'ce', max: '@alias.ce.mod' },
                      damage: '(@spent + @table.blood-dice)d8',
                      range: '30 + 10 * @spent',
                      saveDc: '8 + @prof + @alias.ce.mod'
                    }
                  }
                }
              ]
            }
          ]
        },
        { level: 3, features: [{ id: 'flowing', name: 'Flowing Red Scale' }] },
        { level: 6, features: [{ id: 'convergence', name: 'Convergence' }] }
      ]
    },
    { id: 'shadows', name: 'Ten Shadows', tags: ['innate'] }
  ],
  classes: [
    {
      id: 'sorcerer',
      name: 'Jujutsu Sorcerer',
      hitDie: 8,
      saves: ['wis', 'cha'],
      multiclass: 'never',
      levels: [
        {
          level: 1,
          features: [
            {
              id: 'ce-pool',
              name: 'Cursed Energy',
              effects: [
                { do: { kind: 'grantResource', resource: { id: 'ce', name: 'Cursed Energy', max: '@classLevel * 2', recharge: 'long', shortRestRegain: 'floor(@classLevel / 2)', display: 'pool' } } },
                {
                  do: {
                    kind: 'grantAction',
                    action: { id: 'focus', name: 'Focus', actionType: 'bonus', restores: [{ resourceId: 'ce', amount: '@prof', temporary: true }, { resourceId: 'ce', amount: '1d4' }] }
                  }
                }
              ]
            },
            { id: 'technique', name: 'Innate Technique', effects: [{ do: { kind: 'grantChoice', choice: { id: 'pick', label: 'Innate Technique', from: { kind: 'archetypes', tags: ['innate'] } } } }] },
            {
              id: 'body',
              name: 'Body Improvements',
              effects: [
                {
                  do: {
                    kind: 'grantChoice',
                    choice: {
                      id: 'improvements',
                      label: 'Body Improvements',
                      budget: '@classLevel',
                      allowRepeats: true,
                      groups: [{ id: 'defence', label: 'Defence', max: '1' }],
                      from: { kind: 'optionList', listId: 'body' }
                    }
                  }
                }
              ]
            },
            {
              id: 'hardy',
              name: 'Hardy',
              effects: [
                { do: { kind: 'damageReduction', amount: '@prof', damageTypes: ['bludgeoning'], label: 'Hardy' } },
                { do: { kind: 'modify', target: 'crit.threshold', op: 'add', value: '-1' } },
                { do: { kind: 'modify', target: 'reactions', op: 'add', value: '1' } },
                { do: { kind: 'modify', target: 'attacks.perAction', op: 'set', value: '1 + (@highestClassLevel >= 5)' } },
                { do: { kind: 'modify', target: 'sense.cursed-sight', op: 'set', value: '60' } },
                { do: { kind: 'modify', target: 'alias.ce.score', op: 'add', value: '@counter.breakthroughs' } }
              ]
            },
            {
              id: 'shikigami',
              name: 'Shikigami',
              effects: [
                {
                  do: {
                    kind: 'grantCompanion',
                    companion: {
                      id: 'dog',
                      name: 'Divine Dog',
                      ac: '12 + @prof',
                      hp: '5 * @classLevel + @self.con.mod',
                      abilities: { str: '14', con: '12 + floor(@classLevel / 2)' },
                      attacks: [{ name: 'Bite', bonus: '@self.str.mod + @prof', damage: '1d6 + @self.str.mod', damageType: 'piercing' }],
                      summonCost: { resourceId: 'ce', amount: '2' },
                      states: ['Totality']
                    }
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

const hb: ContentPack = parsePack(homebrewInput, [core])
const PACKS = [core, hb]
const TECH = 'class:hb:sorcerer:technique#pick'
const BODY = 'class:hb:sorcerer:body#improvements'

function derive(build: Partial<CharacterBuild>) {
  return deriveCharacter({ abilityScores: SCORES, classes: [{ classId: 'sorcerer', level: 4 }], ...build }, PACKS)
}
const errors = (d: ReturnType<typeof derive>) => d.diagnostics.filter((x) => x.severity === 'error')

describe('archetypes', () => {
  it('unlocks features by the chosen level basis and reads its own table', () => {
    const d = derive({ choices: { [TECH]: ['hb:blood'] } })
    expect(errors(d)).toEqual([])
    expect(d.archetypes).toEqual([expect.objectContaining({ id: 'hb:blood', level: 4, choiceKey: TECH, className: 'Jujutsu Sorcerer' })])
    const names = d.features.filter((f) => f.archetypeId === 'hb:blood').map((f) => f.name)
    expect(names).toEqual(['Blood Manipulation', 'Piercing Blood', 'Flowing Red Scale'])
    // Level 4 → blood dice 2; at the minimum spend of 1: 3d8.
    expect(d.actions.find((a) => a.id === 'piercing-blood')!.damage).toBe('3d8')
  })

  it('lists archetypes by tag and blocks a unique one taken elsewhere', () => {
    const d = derive({})
    const choice = d.choices.find((c) => c.key === TECH)!
    expect(choice.options.map((o) => o.id)).toEqual(['hb:blood', 'hb:shadows'])
    const picked = derive({ choices: { [TECH]: ['hb:blood'] } }).choices.find((c) => c.key === TECH)!
    expect(picked.options.find((o) => o.id === 'hb:blood')!.blocked).toBeUndefined()
  })
})

describe('variable spend and restores', () => {
  it('scales every formula with @spent between min and max', () => {
    const d = derive({ choices: { [TECH]: ['hb:blood'] } })
    const a = d.actions.find((x) => x.id === 'piercing-blood')!
    // CE ability defaults to Wisdom (15 → +2).
    expect(a.spend).toEqual({ resourceId: 'ce', min: 1, max: 2 })
    expect(a.scaling!.map((s) => [s.spent, s.damage, s.range])).toEqual([
      [1, '3d8', 40],
      [2, '4d8', 50]
    ])
    expect(a.saveDc).toBe(12)
  })

  it('describes restores and short-rest regain, and counts temporary points', () => {
    const d = derive({ resourceTemp: { ce: 3 }, resourceUsed: { ce: 5 } })
    expect(d.actions.find((a) => a.id === 'focus')!.restores).toEqual([
      { resourceId: 'ce', amount: '2', value: 2, temporary: true },
      { resourceId: 'ce', amount: '1d4', temporary: false }
    ])
    expect(d.resources.find((r) => r.id === 'ce')).toEqual(expect.objectContaining({ max: 8, used: 5, temp: 3, shortRestRegain: 2 }))
  })
})

describe('point-buy choices', () => {
  it('spends a budget and caps groups', () => {
    const d = derive({ choices: { [BODY]: ['tough', 'quick'] } })
    const c = d.choices.find((x) => x.key === BODY)!
    expect(c).toEqual(expect.objectContaining({ budget: 4, spent: 3, remaining: 1 }))
    expect(c.groups).toEqual([{ id: 'defence', label: 'Defence', max: 1, used: 1 }])
    expect(c.options.find((o) => o.id === 'hard')!.blocked).toBe('Defence is full')
    expect(c.options.find((o) => o.id === 'tough')!.blocked).toBe('Not enough points')
    expect(c.options.find((o) => o.id === 'quick')!.blocked).toBeUndefined()
    expect(d.speeds.walk).toBe(35)
  })

  it('warns when over budget or over a group cap', () => {
    const d = derive({ choices: { [BODY]: ['tough', 'hard', 'tough'] } })
    const messages = d.diagnostics.map((x) => x.message)
    expect(messages).toContain('Body Improvements: the picks cost 5 but only 4 points are available.')
    expect(messages).toContain('Body Improvements: 3 picks from Defence, but the limit is 1.')
  })
})

describe('counters, aliases and new stats', () => {
  it('reads counters (clamped) and points aliases at the chosen ability', () => {
    const d = derive({ counters: { breakthroughs: 9 }, abilityAliases: { ce: 'cha' } })
    expect(d.counters).toEqual([{ id: 'breakthroughs', name: 'Breakthroughs', description: '', value: 3, min: 0, max: 3 }])
    // cha 8 + 3 breakthroughs through the alias.
    expect(d.abilities.cha.score).toBe(11)
    expect(d.abilities.wis.score).toBe(15)
    expect(d.abilityAliases).toEqual([expect.objectContaining({ id: 'ce', ability: 'cha', chosen: true })])
  })

  it('derives damage reduction, crit threshold, reactions, attacks per action and senses', () => {
    const d = derive({ classes: [{ classId: 'sorcerer', level: 5 }] })
    expect(errors(d)).toEqual([])
    expect(d.damageReductions).toEqual([{ amount: 3, damageTypes: ['bludgeoning'], label: 'Hardy', source: 'Hardy' }])
    expect(d.critThreshold).toBe(19)
    expect(d.reactions).toBe(2)
    expect(d.attacksPerAction).toBe(2)
    expect(d.senses).toEqual({ 'cursed-sight': { name: 'Cursed Sight', range: 60 } })
  })

  it('warns when a never-multiclass class is combined with another', () => {
    const d = derive({ classes: [{ classId: 'sorcerer', level: 2 }, { classId: 'core:fighter', level: 1 }] })
    expect(d.diagnostics.map((x) => x.message)).toContain("Jujutsu Sorcerer can't be multiclassed — a character with it can't take levels in another class.")
  })
})

describe('companions', () => {
  it('scales with the owner and tracks state and HP', () => {
    const d = derive({ companions: { dog: { state: 'Totality', currentHp: 7 } } })
    expect(errors(d)).toEqual([])
    const dog = d.companions[0]
    // con 12 + 2 = 14 (+2); hp 5*4 + 2.
    expect(dog).toEqual(expect.objectContaining({ id: 'dog', ac: 14, maxHp: 22, currentHp: 7, state: 'Totality', summonCost: { resourceId: 'ce', amount: 2 } }))
    expect(dog.states).toEqual(['summoned', 'dismissed', 'defeated', 'Totality'])
    expect(dog.attacks).toEqual([{ name: 'Bite', bonus: 4, damage: '1d6 + 2', damageType: 'piercing' }])
    expect(derive({}).companions[0].state).toBe('dismissed')
  })
})

describe('validation', () => {
  it('accepts the additions and checks their formulas', () => {
    expect(validatePack(homebrewInput, [core]).issues.filter((i) => i.severity === 'error')).toEqual([])
    const broken = structuredClone(homebrewInput)
    broken.archetypes![0].levels![0].features[0].effects![0] = { do: { kind: 'damageReduction', amount: '1 +' } }
    expect(validatePack(broken, [core]).issues.some((i) => i.severity === 'error' && i.path.includes('amount'))).toBe(true)
  })
})

describe('example JJK pack', () => {
  it('imports and derives a Limitless sorcerer without errors', async () => {
    const { readFileSync } = await import('node:fs')
    const { readPackFile } = await import('@shared/content/packFiles')
    const { srdPack } = await import('@shared/content/srd')
    const read = readPackFile(readFileSync('docs/examples/jujutsu-codex.ngpack.json', 'utf8'))
    if (!read.ok) throw new Error('example pack should import')
    const d = deriveCharacter(
      {
        abilityScores: { ...SCORES, cha: 16 },
        classes: [{ classId: 'jujutsu-codex:jujutsu-sorcerer', level: 6 }],
        choices: { 'class:jujutsu-codex:jujutsu-sorcerer:innate-technique#technique': ['limitless'] }
      },
      [srdPack(), read.pack]
    )
    expect(d.diagnostics.filter((x) => x.severity === 'error')).toEqual([])
    expect(d.actions.map((a) => a.id)).toEqual(expect.arrayContaining(['cursed-burst', 'focus-breath', 'lapse-blue']))
    expect(d.critThreshold).toBe(19)
  })
})

describe('formula previews', () => {
  it('evaluates formulas against a derived character, in class and archetype scope', () => {
    const d = deriveCharacter(
      { abilityScores: SCORES, classes: [{ classId: 'sorcerer', level: 4 }], choices: { [TECH]: ['hb:blood'] } },
      PACKS,
      {
        probes: [
          { formula: '@prof + @wis.mod' },
          { formula: '@classLevel * 2', inClass: true },
          { formula: '@classLevel' },
          { formula: '(@spent + @table.blood-dice)d8', archetypeId: 'hb:blood', spent: 2 },
          { formula: '@archetypeLevel', archetypeId: 'hb:blood' },
          { formula: '@nope.thing' }
        ],
        keepEvaluator: true
      }
    )
    expect(d.probes).toEqual([
      { ok: true, value: 4 },
      { ok: true, value: 8 },
      { ok: false, error: '@classLevel only works inside a class or subclass feature' },
      { ok: true, value: 0, dice: '4d8' },
      { ok: true, value: 4 },
      { ok: false, error: 'Unknown reference @nope.thing' }
    ])
    expect(d.evaluate!({ formula: '@resource.ce.max' })).toEqual({ ok: true, value: 8 })
  })
})
