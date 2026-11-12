import { describe, expect, it } from 'vitest'
import { addCoins, takeCoins, hasItemsToStash, coinLabel, questIsFor, coinsPhrase, hasPayout, normalizeQuests, questsForPlayer, rewardLabels, splitReward } from '../shared/quests'

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
    expect(q).toMatchObject({ giver: 'Aldric', rewardCoins: { gp: 250 }, rewardItems: 'A silver key' })
    expect(q.rewardXp).toBeUndefined()
    expect(rewardLabels(q)).toEqual(['250 gp', 'A silver key'])
    expect(normalizeQuests({ quests: [{ id: 'b', title: 'T', rewardGold: Infinity, rewardXp: '300' }] }).quests[0]).not.toHaveProperty('rewardCoins')
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
    expect(questsForPlayer(doc, 'u1').quests.map((q) => q.title)).toEqual(['Known'])
  })

  it('keeps notes and hints, and players only get the ones shown', () => {
    const doc = normalizeQuests({
      quests: [
        {
          id: 'a',
          title: 'Known',
          shared: true,
          hints: [{ id: 'h1', text: ' The key is under the altar ', shown: true }, { id: 'h2', text: 'Aldric lies', shown: false }, { id: 'h3', text: '  ' }, 'junk']
        },
        { id: 'b', title: 'No hints shown', shared: true, hints: [{ id: 'h4', text: 'secret' }] }
      ]
    })
    expect(doc.quests[0].hints).toEqual([
      { id: 'h1', text: 'The key is under the altar', shown: true },
      { id: 'h2', text: 'Aldric lies', shown: false }
    ])
    const player = questsForPlayer(doc, 'u1').quests
    expect(player[0].hints).toEqual([{ id: 'h1', text: 'The key is under the altar', shown: true }])
    expect(player[1]).not.toHaveProperty('hints')
    expect(doc.quests[0].hints).toHaveLength(2)
  })

  it('pays in any currency, named as the packs name it', () => {
    const [q] = normalizeQuests({ quests: [{ id: 'a', title: 'T', rewardCoins: { sp: 30, gp: 2, credits: 40, cp: 0, 'bad id!': 5, pp: 'x' } }] }).quests
    expect(q.rewardCoins).toEqual({ sp: 30, gp: 2, credits: 40 })
    expect(hasPayout(q)).toBe(true)
    const packs = [{ id: 'gp', name: 'Gold' }, { id: 'credits', name: 'Credits' }]
    expect(rewardLabels(q, packs)).toEqual(['2 gp', '30 sp', '40 Credits'])
    expect(coinLabel('gp', [{ id: 'gp', name: 'Crowns' }])).toBe('Crowns')
    expect(coinsPhrase({ gp: 2, sp: 5 })).toBe('2 gp and 5 sp')
    // A share lands in the character's coins, or its pack currencies.
    expect(addCoins({ currency: { cp: 0, sp: 1, ep: 0, gp: 10, pp: 0 }, packCurrency: { credits: 5 } }, { gp: 2, sp: 30, credits: 40 })).toEqual({
      currency: { cp: 0, sp: 31, ep: 0, gp: 12, pp: 0 },
      packCurrency: { credits: 45 }
    })
    // An old log's rewardGold is read as gp.
    expect(normalizeQuests({ quests: [{ id: 'b', title: 'U', rewardGold: 100 }] }).quests[0].rewardCoins).toEqual({ gp: 100 })
  })

  it('a quest for some of the party reaches only them', () => {
    const doc = normalizeQuests({
      quests: [
        { id: 'a', title: 'Everyone', shared: true },
        { id: 'b', title: 'Ann and Bram', shared: true, forPlayers: ['ann', 'bram', 'ann', 7] },
        { id: 'c', title: 'Just Cass', shared: true, forPlayers: ['cass'] }
      ]
    })
    expect(doc.quests[1].forPlayers).toEqual(['ann', 'bram'])
    expect(questsForPlayer(doc, 'ann').quests.map((q) => q.title)).toEqual(['Everyone', 'Ann and Bram'])
    expect(questsForPlayer(doc, 'cass').quests.map((q) => q.title)).toEqual(['Everyone', 'Just Cass'])
    expect(questIsFor(doc.quests[2], 'ann')).toBe(false)
  })

  it('takes coins out of a purse, but no more than are in it', () => {
    const purse = { currency: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 }, packCurrency: { credits: 5 } }
    expect(takeCoins(purse, 'gp', 4)?.currency.gp).toBe(6)
    expect(takeCoins(purse, 'credits', 5)?.packCurrency).toEqual({ credits: 0 })
    expect(takeCoins(purse, 'gp', 11)).toBeNull()
    expect(takeCoins(purse, 'sp', 0)).toBeNull()
  })

  it('pays items from the Codex, once, and lists them with the rest', () => {
    const [q] = normalizeQuests({
      quests: [{ id: 'a', title: 'T', rewardCoins: { gp: 5 }, rewardEntries: [{ kind: 'equipment', id: 'longsword', name: 'Longsword' }, { kind: 'magicItem', id: 'x', name: '' }, { kind: 'spell', id: 'f', name: 'Fireball' }] }]
    }).quests
    expect(q.rewardEntries).toEqual([{ kind: 'equipment', id: 'longsword', name: 'Longsword' }])
    expect(rewardLabels(q)).toEqual(['5 gp', 'Longsword'])
    expect(hasItemsToStash(q)).toBe(true)
    expect(hasItemsToStash({ ...q, itemsStashed: true })).toBe(false)
  })
})
