import { describe, expect, it } from 'vitest'
import { TERM_DEFAULTS, termsFor, terminologyConflicts } from '@shared/content/terms'
import { buildRegistry } from '@shared/content/registry'
import { registryForPacks } from '@shared/content/migrate'
import { packKey } from '@shared/content/packKey'
import { srdPack } from '@shared/content/srd'
import { crToNumeric, monsterEntry, packMonsterRecords } from '@shared/content/monsters'
import { legacySheetToBuild } from '@shared/content/legacy'
import { deriveCharacter } from '@shared/content/engine'
import { parsePack } from '@shared/content/validate'
import { emptyCharacterSheet } from '@shared/dnd5e'
import type { ContentPack, ContentPackInput } from '@shared/content/schema'

const pack = (input: Partial<ContentPackInput> & { id: string }): ContentPack => parsePack({ formatVersion: 1, name: input.id, dependsOn: ['srd-5.2.1'], ...input }, [srdPack()])

describe('terminology', () => {
  it('renames, falls back, and shortens ability names', () => {
    const terms = termsFor({ spellSlots: 'Technique Slots', 'ability.cha': 'Cursed Energy Control', 'ability.cha.short': 'CE', 'ability.wis': 'Insight' })
    expect(terms.t('spellSlots')).toBe('Technique Slots')
    expect(terms.t('hitDice')).toBe(TERM_DEFAULTS.hitDice)
    expect(terms.t('species', 'Race')).toBe('Race')
    expect(terms.t('nothing.here')).toBe('nothing.here')
    expect(terms.ability('cha')).toBe('Cursed Energy Control')
    expect(terms.abilityShort('cha')).toBe('CE')
    expect(terms.abilityShort('wis')).toBe('Ins')
    expect(terms.ability('str', 'Strength')).toBe('Strength')
  })

  it('reports concepts more than one pack renames, the later pack winning', () => {
    const conflicts = terminologyConflicts([
      { id: 'a', name: 'A', terminology: { spellSlots: 'Technique Slots', subclass: 'Lineage' } },
      { id: 'b', name: 'B', terminology: { spellSlots: 'Mana Wells', subclass: 'Lineage' } }
    ])
    expect(conflicts).toEqual([
      {
        key: 'spellSlots',
        packs: [
          { id: 'a', name: 'A', label: 'Technique Slots' },
          { id: 'b', name: 'B', label: 'Mana Wells' }
        ],
        winner: 'b'
      }
    ])
  })

  it('follows load order in the registry', () => {
    const a = pack({ id: 'a', terminology: { spellSlots: 'Technique Slots' } })
    const b = pack({ id: 'b', terminology: { spellSlots: 'Mana Wells' } })
    expect(buildRegistry([srdPack(), a, b]).terminology.spellSlots).toBe('Mana Wells')
    expect(buildRegistry([srdPack(), b, a]).terminology.spellSlots).toBe('Technique Slots')
  })
})

describe('pack conditions on the sheet', () => {
  it('applies an active pack condition’s effects', () => {
    const p = pack({
      id: 'cond',
      vocabulary: { conditions: [{ id: 'cursed', name: 'Cursed', maxLevel: 3, effects: [{ do: { kind: 'modify', target: 'ac', op: 'add', value: '-@condition.cursed.level' } }] }] }
    })
    const sheet = { ...emptyCharacterSheet(), activeConditions: [{ id: 'cursed', level: 2 }] }
    const { build } = legacySheetToBuild(sheet, { packs: [srdPack(), p] })
    expect(build.conditions).toEqual([{ id: 'cursed', level: 2 }])
    const plain = deriveCharacter(legacySheetToBuild(emptyCharacterSheet(), { packs: [srdPack(), p] }).build, [srdPack(), p])
    const cursed = deriveCharacter(build, [srdPack(), p])
    expect(cursed.armorClass).toBe(plain.armorClass - 2)
  })
})

describe('pack caches', () => {
  it('key packs by content, so an edit without a version bump is seen', () => {
    const before = pack({ id: 'edit', version: '1.0.0', feats: [{ id: 'one', name: 'One' }] })
    const after = pack({ id: 'edit', version: '1.0.0', feats: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }] })
    expect(packKey(before)).not.toBe(packKey(after))
    expect(packKey(before)).toBe(packKey(before))
    expect(registryForPacks([srdPack(), before]).get('feats', 'edit:two')).toBeUndefined()
    expect(registryForPacks([srdPack(), after]).get('feats', 'edit:two')?.def.name).toBe('Two')
  })
})

describe('pack monsters', () => {
  it('lists pack creatures as bestiary entries, keeping a moved creature’s old index', () => {
    const p = pack({
      id: 'beasts',
      name: 'Beasts',
      monsters: [
        { id: 'cave-bear', name: 'Cave Bear', type: 'beast', cr: '2', actions: [{ name: 'Bite', desc: 'Hit: 8 (1d8 + 4).' }] },
        { id: 'old', name: 'Old Friend', cr: '1/4', index: 'custom-123' }
      ] as unknown as ContentPackInput['monsters']
    })
    const records = packMonsterRecords(buildRegistry([srdPack(), p]), [p])
    expect(records.map((r) => [r.name, r.index, r.crNumeric, r.xp, r.packName])).toEqual([
      ['Cave Bear', 'pack:beasts:cave-bear', 2, 450, 'Beasts'],
      ['Old Friend', 'custom-123', 0.25, 50, 'Beasts']
    ])
    expect(records[0].actions).toEqual([{ name: 'Bite', desc: 'Hit: 8 (1d8 + 4).' }])
    expect(records[1].traits).toEqual([])
    expect(crToNumeric('1/8')).toBe(0.125)
  })

  it('turns a statblock into an entry that validates', () => {
    const entry = monsterEntry({ name: 'Cave Bear', type: 'beast', cr: '2', index: 'custom-9', crNumeric: 2, xp: 450, traits: [], actions: [], reactions: [], legendary_actions: [] }, ['cave-bear'])
    expect(entry.id).toBe('cave-bear-2')
    expect(entry).not.toHaveProperty('crNumeric')
    expect(entry.index).toBe('custom-9')
    expect(() => pack({ id: 'mine', monsters: [entry] as unknown as ContentPackInput['monsters'] })).not.toThrow()
  })
})
