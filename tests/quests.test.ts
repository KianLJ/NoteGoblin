import { describe, expect, it } from 'vitest'
import { normalizeQuests, questsForPlayer, rewardLabels, splitReward } from '../shared/quests'

describe('quest log', () => {
  it('keeps real quests, fills in defaults, and drops anything else', () => {
    const doc = normalizeQuests({
      quests: [
        { id: 'a', title: 'Find the ogre', detail: 'Brakka', status: 'done', shared: true, noteTitle: ' Brakka ' },
        { id: 'b', title: 'Secret', status: 'nonsense' },
        { title: 'no id' },
        'junk',
        null
      ]
    })
    expect(doc.quests).toEqual([
      { id: 'a', title: 'Find the ogre', detail: 'Brakka', status: 'done', shared: true, noteTitle: 'Brakka' },
      { id: 'b', title: 'Secret', detail: '', status: 'active', shared: false }
    ])
  })

  it('keeps a giver and sensible rewards, dropping nonsense amounts', () => {
    const [q] = normalizeQuests({ quests: [{ id: 'a', title: 'T', giver: ' Aldric ', rewardGold: 250.7, rewardXp: -5, rewardItems: ' A silver key ' }] }).quests
    expect(q).toMatchObject({ giver: 'Aldric', rewardGold: 250, rewardItems: 'A silver key' })
    expect(q.rewardXp).toBeUndefined()
    expect(rewardLabels(q)).toEqual(['250 gp', 'A silver key'])
    expect(normalizeQuests({ quests: [{ id: 'b', title: 'T', rewardGold: Infinity, rewardXp: '300' }] }).quests[0]).not.toHaveProperty('rewardGold')
  })

  it('splits a reward evenly, rounding down, and says what is left over', () => {
    expect(splitReward(1500, 4)).toEqual({ each: 375, leftover: 0 })
    expect(splitReward(1000, 3)).toEqual({ each: 333, leftover: 1 })
    expect(splitReward(450, 1)).toEqual({ each: 450, leftover: 0 })
    expect(splitReward(100, 0)).toEqual({ each: 0, leftover: 100 })
  })

  it('remembers a quest has paid out', () => {
    expect(normalizeQuests({ quests: [{ id: 'a', title: 'T', rewarded: true }, { id: 'b', title: 'U', rewarded: 'yes' }] }).quests.map((q) => q.rewarded)).toEqual([true, undefined])
  })

  it('starts empty from nothing usable', () => {
    expect(normalizeQuests(null)).toEqual({ quests: [] })
    expect(normalizeQuests({ quests: 'x' })).toEqual({ quests: [] })
  })

  it('players only get the shared quests', () => {
    const doc = normalizeQuests({ quests: [{ id: 'a', title: 'Known', shared: true }, { id: 'b', title: 'Hidden', shared: false }] })
    expect(questsForPlayer(doc).quests.map((q) => q.title)).toEqual(['Known'])
  })
})
