import { afterEach, describe, expect, it } from 'vitest'
import { emptyCharacterSheet } from '@shared/dnd5e'
import { deriveSheet, setActivePacks } from '@shared/content/sheet'
import { parsePack } from '@shared/content/validate'
import { srdPack } from '@shared/content/srd'

// A homebrew class that repeats one feature (same id) at levels 4 and 8 — each must be its own pick.
const asi = {
  id: 'asi-or-feat',
  name: 'Ability Score Increase or Feat',
  effects: [{ do: { kind: 'grantChoice', choice: { id: 'feat', label: 'Feat', from: { kind: 'feats', featIds: ['srd-5.2.1:ability-score-improvement', 'srd-5.2.1:alert'] } } } }]
}
const pack = parsePack(
  {
    formatVersion: 1,
    id: 'repeat-test',
    name: 'Repeat test',
    version: '1.0.0',
    dependsOn: ['srd-5.2.1'],
    classes: [{ id: 'striker', name: 'Striker', hitDie: 8, levels: [{ level: 4, features: [asi] }, { level: 8, features: [asi] }] }]
  },
  [srdPack()]
)

afterEach(() => setActivePacks([]))

describe('a feature repeated at several levels', () => {
  it('gives each level its own choice, keeping picks made before the fix on the first', () => {
    setActivePacks([pack])
    const sheet = {
      ...emptyCharacterSheet(),
      classes: [{ className: 'Striker', level: 8, classId: 'repeat-test:striker' }],
      // Picked at level 4 under the plain feature id (as before repeats were told apart).
      choices: {
        'class:repeat-test:striker:asi-or-feat#feat': ['srd-5.2.1:ability-score-improvement'],
        'class:repeat-test:striker:asi-or-feat#feat/srd-5.2.1:ability-score-improvement#scores': ['dex', 'dex']
      }
    }
    const { derived } = deriveSheet(sheet)
    const feats = derived.choices.filter((c) => c.key.endsWith('#feat') && c.classId)
    expect(feats.map((c) => [c.level, c.picks.length, c.remaining])).toEqual([
      [4, 1, 0],
      [8, 0, 1]
    ])
    expect(derived.abilities.dex.score).toBe(emptyCharacterSheet().abilityScores.dex + 2)
  })
})
