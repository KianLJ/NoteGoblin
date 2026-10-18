import { afterEach, describe, expect, it } from 'vitest'
import { deriveSheet, setActivePacks } from '@shared/content/sheet'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'
import { parsePack } from '@shared/content/validate'
import { emptyCharacterSheet, type CharacterSheetData } from '@shared/dnd5e'

const pack = parsePack(
  {
    formatVersion: 1,
    id: 'relics',
    name: 'Relics',
    dependsOn: [SRD_PACK_ID],
    items: [
      {
        id: 'storm-ring',
        name: 'Storm Ring',
        description: 'Hums with thunder.',
        category: 'Ring',
        requiresAttunement: true,
        effectsWhen: 'attuned',
        charges: { id: 'charges', name: 'Charges', max: '3', recharge: 'dawn' },
        effects: [{ do: { kind: 'note', text: 'You hear distant thunder.' } }, { do: { kind: 'modify', target: 'ac', op: 'add', value: '1' } }]
      }
    ]
  },
  [srdPack()]
)

const withRing = (equipped: boolean, attuned: boolean): CharacterSheetData => ({
  ...emptyCharacterSheet(),
  classes: [{ className: 'Fighter', level: 3 }],
  equipment: [{ id: 'r1', name: 'Storm Ring', quantity: 1, weight: 0, notes: '', packItemId: 'relics:storm-ring', equipped, attuned }]
})

describe('attunement', () => {
  afterEach(() => setActivePacks([]))

  it('an attunement item works only when equipped and attuned, charges and reminder included', () => {
    setActivePacks([pack])
    const off = deriveSheet(withRing(true, false)).derived
    const on = deriveSheet(withRing(true, true)).derived
    expect(on.armorClass).toBe(off.armorClass + 1)
    expect(off.resources.map((r) => r.name)).not.toContain('Storm Ring charges')
    expect(on.resources.find((r) => r.name === 'Storm Ring charges')?.max).toBe(3)
    expect(off.notes.map((n) => n.text)).not.toContain('You hear distant thunder.')
    expect(on.notes.map((n) => n.text)).toContain('You hear distant thunder.')
    // Attuned but taken off: nothing applies.
    expect(deriveSheet(withRing(false, true)).derived.armorClass).toBe(off.armorClass)
  })
})
