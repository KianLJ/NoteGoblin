import { describe, expect, it } from 'vitest'
import { attackText, damageWithAverage, markEntry, markInitiative, markSaves, markSkills, rollsInBonusLine, rollsInEntry, type StatblockRoll } from '../shared/statblockRolls'

function rolls(html: string): StatblockRoll[] {
  return [...html.matchAll(/data-statblock-roll="([^"]*)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')))
}

describe('statblock rolls', () => {
  it('turns an attack bonus and its damage into rolls', () => {
    const html = markEntry('Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.', 'Scimitar')
    expect(rolls(html)).toEqual([
      { kind: 'check', label: 'Scimitar Attack', modifier: 4 },
      { kind: 'damage', label: 'Scimitar Damage', expr: '1d6 + 2' }
    ])
    expect(html).toContain('reach 5 ft.')
    // The average goes in the damage chip, solid, with its dice in brackets beside it.
    expect(html).toContain('<b>5</b><span>(1d6 + 2)</span></button> slashing')
    expect(html).toContain('<b>+4</b><span>to hit</span></button>, reach')
  })

  it('reads the 2024 attack line and a negative bonus', () => {
    expect(rolls(markEntry('Melee Attack Roll: −1, reach 5 ft. Hit: 2 (1d4) bludgeoning damage.', 'Slam'))).toEqual([
      { kind: 'check', label: 'Slam Attack', modifier: -1 },
      { kind: 'damage', label: 'Slam Damage', expr: '1d4' }
    ])
  })

  it('leaves an existing dice button and the insides of tags alone', () => {
    const html = markEntry('<button data-dice-roll="x">1d10</button> then <span title="2d6">3d8 + 1</span>', 'Bite')
    expect(rolls(html)).toEqual([{ kind: 'damage', label: 'Bite Damage', expr: '3d8 + 1' }])
    expect(html).toContain('<button data-dice-roll="x">1d10</button>')
    expect(html).toContain('title="2d6"')
  })

  it('makes each save, skill and the initiative bonus rollable', () => {
    expect(rolls(markSaves('Dex +5, Wis −1'))).toEqual([
      { kind: 'check', label: 'Dex Save', modifier: 5 },
      { kind: 'check', label: 'Wis Save', modifier: -1 }
    ])
    expect(rolls(markSkills('Perception +4, Sleight of Hand +6')).map((r) => r.label)).toEqual(['Perception Check', 'Sleight of Hand Check'])
    expect(rolls(markInitiative('+2 (12)'))).toEqual([{ kind: 'check', label: 'Initiative', modifier: 2 }])
  })

  it('writes an attack the statblock turns into rolls, and lists the rolls an entry gets', () => {
    expect(damageWithAverage('1d6+2')).toEqual({ expr: '1d6 + 2', average: 5 })
    expect(damageWithAverage('2d8 - 1')).toEqual({ expr: '2d8 - 1', average: 8 })
    expect(damageWithAverage('d6')).toBeNull()
    const text = attackText({ ranged: false, toHit: 4, distance: '5', dice: '1d6+2', damageType: 'slashing' })
    expect(text).toBe('Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.')
    expect(rollsInEntry(text, 'Scimitar')).toEqual([
      { kind: 'check', label: 'Scimitar Attack', modifier: 4 },
      { kind: 'damage', label: 'Scimitar Damage', expr: '1d6 + 2' }
    ])
    // Text with < or & in it still reads back.
    expect(rollsInEntry('Bites <hard> & deals 2d4 damage', 'Bite')).toEqual([{ kind: 'damage', label: 'Bite Damage', expr: '2d4' }])
    expect(rollsInBonusLine('Dex +5, Wis +3')).toBe(2)
    expect(rollsInBonusLine('Dex 5')).toBe(0)
  })
})
