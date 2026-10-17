import { describe, expect, it } from 'vitest'
import { buildRegistry } from '@shared/content/registry'
import { parsePack, validatePack } from '@shared/content/validate'
import { core, coreInput, frontier } from './packs'

const other = parsePack({
  formatVersion: 1,
  id: 'other',
  name: 'Other',
  items: [{ id: 'dagger', name: 'Bone Dagger', category: 'Weapon' }]
})

describe('registry', () => {
  it('orders packs by dependency regardless of enable order', () => {
    expect(buildRegistry([frontier, core]).packs.map((p) => p.id)).toEqual(['core', 'frontier'])
  })

  it('warns about a missing dependency but keeps the pack', () => {
    const r = buildRegistry([frontier])
    expect(r.diagnostics.map((d) => d.message)).toContain('Pack "Arcane Frontier" needs pack "core", which isn\'t enabled.')
    expect(r.get('classes', 'channeler')?.fullId).toBe('frontier:channeler')
  })

  it('applies overrides under the original id and hides entries', () => {
    const r = buildRegistry([core, frontier])
    const longsword = r.get('items', 'longsword')!
    expect(longsword).toMatchObject({ fullId: 'core:longsword', packId: 'frontier' })
    expect(longsword.def.weapon?.damage).toBe('1d10')
    expect(r.get('feats', 'tough')).toBeUndefined()
    expect(r.all('items').filter((i) => i.def.name === 'Longsword')).toHaveLength(1)
  })

  it('resolves local ids against the referring pack and its dependencies first', () => {
    const r = buildRegistry([core, frontier, other])
    expect(r.get('items', 'dagger', 'frontier')?.fullId).toBe('core:dagger')
    expect(r.get('items', 'dagger', 'other')?.fullId).toBe('other:dagger')
    expect(r.get('items', 'dagger')?.fullId).toBe('other:dagger')
    expect(r.get('items', 'core:dagger')?.def.name).toBe('Dagger')
  })

  it('merges vocabulary and lets later packs win terminology', () => {
    const r = buildRegistry([core, frontier])
    expect(r.vocabulary.skills.map((s) => s.id)).toEqual(['athletics', 'stealth', 'perception', 'arcana', 'arcane-sense'])
    expect(r.terminology.spellSlots).toBe('Mana Wells')
  })
})

describe('validatePack', () => {
  it('accepts the test packs', () => {
    expect(validatePack(coreInput).issues).toEqual([])
  })

  it('reports shape errors with paths', () => {
    const result = validatePack({ formatVersion: 1, id: 'bad pack', name: 'Bad', classes: [{ id: 'x', name: 'X' }] })
    expect(result.ok).toBe(false)
    expect(result.issues.map((i) => i.path)).toEqual(expect.arrayContaining(['id', 'classes[0].hitDie']))
  })

  it('reports formula and reference errors at the exact field', () => {
    const result = validatePack(
      {
        formatVersion: 1,
        id: 'broken',
        name: 'Broken',
        dependsOn: ['core'],
        subclasses: [{ id: 'ghost', name: 'Ghost', classId: 'nobody' }],
        feats: [
          {
            id: 'f',
            name: 'F',
            effects: [
              { do: { kind: 'modify', target: 'ac', op: 'add', value: '2 +' } },
              { do: { kind: 'grantChoice', choice: { id: 'c', label: 'C', from: { kind: 'optionList', listId: 'missing' } } } },
              { do: { kind: 'grantToggle', toggle: { id: 't', name: 'T', cost: { resourceId: 'mana' } } } }
            ]
          }
        ]
      },
      [core]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      { severity: 'error', path: 'subclasses[0].classId', message: 'No class "nobody" in this pack or its dependencies.' },
      { severity: 'error', path: 'feats[0].effects[0].do.value', message: 'Formula ended early (at character 4)' },
      { severity: 'error', path: 'feats[0].effects[1].do.choice.from.listId', message: 'No pick list "missing" in this pack or its dependencies.' },
      { severity: 'warning', path: 'feats[0].effects[2].do.toggle.cost.resourceId', message: 'No resource "mana" is granted anywhere in this pack.' }
    ])
  })
})
