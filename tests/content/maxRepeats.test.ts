import { describe, expect, it } from 'vitest'
import { emptyCharacterSheet } from '@shared/dnd5e'
import { deriveSheet } from '@shared/content/sheet'

describe('a background’s ability score increases', () => {
  it('tells the pickers an ability can be picked at most twice (+2), never three times', () => {
    const { derived } = deriveSheet({ ...emptyCharacterSheet(), background: 'Sage' })
    const scores = derived.choices.find((c) => c.key.startsWith('background:') && c.key.endsWith('#scores'))
    expect(scores).toMatchObject({ count: 3, allowRepeats: true, maxRepeats: 2 })
  })
})
