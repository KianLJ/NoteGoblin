import { afterEach, describe, expect, it } from 'vitest'
import { deriveCharacter } from '@shared/content/engine'
import { buildPickerContent } from '@shared/content/pickerContent'
import { setActivePacks } from '@shared/content/sheet'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'
import { parsePack } from '@shared/content/validate'

const pack = parsePack(
  {
    formatVersion: 1,
    id: 'frontier',
    name: 'Frontier',
    dependsOn: [SRD_PACK_ID],
    backgrounds: [
      {
        id: 'drifter',
        name: 'Drifter',
        features: [
          {
            id: 'ability-scores',
            name: 'Ability Scores',
            // No abilities ticked in the Workshop: all six.
            effects: [{ do: { kind: 'grantChoice', choice: { id: 'scores', label: 'Ability score increases', count: '3', from: { kind: 'abilities', abilities: [] }, allowRepeats: true, maxRepeats: 2, onPick: [{ do: { kind: 'modify', target: 'ability.$pick.score', op: 'add', value: '1' } }] } } }]
          },
          {
            id: 'arms',
            name: 'Arms Training',
            effects: [{ do: { kind: 'grantChoice', choice: { id: 'weapon', label: 'Weapon Proficiency', from: { kind: 'weapons', categories: ['martial'] }, onPick: [{ do: { kind: 'proficiency', category: 'weapon', value: '$pick' } }] } } }]
          }
        ]
      }
    ]
  },
  [srdPack()]
)

const wizard = (choices: Record<string, string[]> = {}) =>
  deriveCharacter(
    {
      abilityScores: { str: 14, dex: 12, con: 12, int: 15, wis: 10, cha: 8 },
      backgroundId: 'frontier:drifter',
      classes: [{ classId: `${SRD_PACK_ID}:wizard`, level: 1 }],
      choices,
      equipment: [{ itemId: `${SRD_PACK_ID}:longsword`, equipped: true }]
    },
    [srdPack(), pack]
  )

describe('choice sources', () => {
  afterEach(() => setActivePacks([]))

  it('treats an empty filter list as "all", as the Workshop says', () => {
    const scores = wizard().choices.find((c) => c.key.endsWith('#scores'))!
    expect(scores.options.map((o) => o.id)).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha'])
  })

  it('offers weapons to pick a proficiency from, and the pick makes the weapon proficient', () => {
    const before = wizard()
    const weapon = before.choices.find((c) => c.key.endsWith('#weapon'))!
    expect(weapon.options.some((o) => o.name === 'Longsword')).toBe(true)
    expect(weapon.options.some((o) => o.name === 'Dagger')).toBe(false)
    expect(before.attacks.find((a) => a.name === 'Longsword')?.proficient).toBe(false)
    const after = wizard({ [weapon.key]: [`${SRD_PACK_ID}:longsword`] })
    expect(after.attacks.find((a) => a.name === 'Longsword')?.proficient).toBe(true)
    expect(after.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  })

  it('the character creator offers a homebrew background’s abilities', () => {
    setActivePacks([pack])
    expect(buildPickerContent().backgrounds.find((b) => b.name === 'Drifter')?.abilityScores).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha'])
  })
})
