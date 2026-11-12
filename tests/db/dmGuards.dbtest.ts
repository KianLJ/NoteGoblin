import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { getHostDb } from '../../src/server/db/hostDb'
import { initVaultConfig } from '../../src/server/files/vaultConfig'
import { UserRepo } from '../../src/server/repositories/userRepo'
import * as svc from '../../src/server/services/campaignService'
import { CALENDAR_TEMPLATES } from '../../shared/calendarTemplates'

// What a player's requests over the relay can and can't do to the DM's campaign
// (sessionHost.ts's dispatch hands every one straight to these services with
// the player's relay userId). Runs against a real host database in a temp
// folder, through Electron's own Node — see scripts/test-db.mjs.

const DM = 'dm-user'
const PLAYER = 'player-user'
const OUTSIDER = 'outsider-user'

let db: DatabaseType
let campaignId: string

function data<T>(result: svc.ServiceResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.status}: ${result.error}`)
  return result.data
}

function denied(result: svc.ServiceResult<unknown>): void {
  expect(result.ok).toBe(false)
  if (!result.ok) expect([403, 404]).toContain(result.status)
}

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'notegoblin-dbtest-'))
  initVaultConfig(dir)
  db = getHostDb(dir)
  const users = new UserRepo(db)
  users.ensureWithId(DM, 'The DM')
  users.ensureWithId(PLAYER, 'A Player')
  users.ensureWithId(OUTSIDER, 'An Outsider')
  campaignId = data(svc.createCampaign(db, DM, 'Guard Test')).id
  data(svc.joinCampaign(db, campaignId, PLAYER))
})

describe('campaign-level actions are the DM’s alone', () => {
  it('a player can’t rename, delete or switch the table’s campaign', () => {
    denied(svc.renameCampaign(db, campaignId, PLAYER, 'Mine now'))
    denied(svc.deleteCampaign(db, campaignId, PLAYER))
    denied(svc.setActiveCampaign(db, campaignId, PLAYER))
  })

  it('a player can’t edit or delete the calendar; the DM can', () => {
    const config = CALENDAR_TEMPLATES[0].build()
    denied(svc.saveCalendar(db, campaignId, PLAYER, config))
    data(svc.saveCalendar(db, campaignId, DM, config))
    denied(svc.deleteCalendar(db, campaignId, PLAYER))
  })

  it('a player can’t create, change or delete session decks and scenes; the DM can', () => {
    denied(svc.createSessionDeck(db, campaignId, PLAYER, 'Session 1'))
    const deck = data(svc.createSessionDeck(db, campaignId, DM, 'Session 1'))
    denied(svc.updateSessionDeck(db, campaignId, deck.id, PLAYER, { title: 'Hijacked' }))
    denied(svc.addSceneToDeck(db, campaignId, deck.id, PLAYER, 'Ambush'))
    const scene = data(svc.addSceneToDeck(db, campaignId, deck.id, DM, 'Ambush'))
    denied(svc.removeSceneFromDeck(db, campaignId, deck.id, PLAYER, scene.id))
    denied(svc.deleteSessionDeck(db, campaignId, deck.id, PLAYER))
  })

  it('a player can’t change the quest log, and only ever gets its shared quests', () => {
    const doc = { quests: [{ id: 'a', title: 'Known', detail: '', status: 'active', shared: true }, { id: 'b', title: 'The twist', detail: '', status: 'active', shared: false }] }
    denied(svc.saveQuests(db, campaignId, PLAYER, doc))
    data(svc.saveQuests(db, campaignId, DM, doc))
    expect(data(svc.getQuests(db, campaignId, PLAYER)).quests.map((q) => q.title)).toEqual(['Known'])
    expect(data(svc.getQuests(db, campaignId, DM)).quests).toHaveLength(2)
    denied(svc.getQuests(db, campaignId, OUTSIDER))
  })

  it('a quest that has paid out stays paid, even if an older copy is saved over it', () => {
    data(svc.saveQuests(db, campaignId, DM, { quests: [{ id: 'p', title: 'Paid', detail: '', status: 'done', shared: true, rewardGold: 10, rewarded: true }] }))
    data(svc.saveQuests(db, campaignId, DM, { quests: [{ id: 'p', title: 'Paid', detail: '', status: 'done', shared: true, rewardGold: 10 }] }))
    expect(data(svc.getQuests(db, campaignId, DM)).quests[0].rewarded).toBe(true)
  })

  it('a quest’s giver and rewards survive a save and a re-read', () => {
    const quest = { id: 'r', title: 'Paid work', detail: '', status: 'active', shared: true, giver: 'The reeve', rewardGold: 1500, rewardXp: 450, rewardItems: 'A key' }
    data(svc.saveQuests(db, campaignId, DM, { quests: [quest] }))
    expect(data(svc.getQuests(db, campaignId, DM)).quests[0]).toMatchObject({ giver: 'The reeve', rewardCoins: { gp: 1500 }, rewardXp: 450, rewardItems: 'A key' })
    expect(data(svc.getQuests(db, campaignId, PLAYER)).quests[0]).toMatchObject({ rewardCoins: { gp: 1500 }, rewardXp: 450 })
  })

  it('a player can’t see a scene before the DM presents it', () => {
    const deck = data(svc.createSessionDeck(db, campaignId, DM, 'Session 2'))
    const scene = data(svc.addSceneToDeck(db, campaignId, deck.id, DM, 'Secret door'))
    const seen = data(svc.listNotes(db, campaignId, PLAYER, true)).map((n) => n.id)
    expect(seen).not.toContain(scene.id)
  })
})

describe('notes and folders', () => {
  it('a player can’t write DM-only notes or folders', () => {
    denied(svc.createNote(db, campaignId, PLAYER, { title: 'Spoilers', bodyMarkdown: '', visibility: 'dm' }))
    denied(svc.createFolder(db, campaignId, PLAYER, { name: 'Spoilers', visibility: 'dm' }))
  })

  it('a player never sees the DM’s notes, and can’t edit or delete them', () => {
    const secret = data(svc.createNote(db, campaignId, DM, { title: 'The twist', bodyMarkdown: 'It was the innkeeper.', visibility: 'dm' }))
    const party = data(svc.createNote(db, campaignId, DM, { title: 'Town map', bodyMarkdown: '', visibility: 'shared' }))
    const seen = data(svc.listNotes(db, campaignId, PLAYER, true)).map((n) => n.id)
    expect(seen).not.toContain(secret.id)
    expect(seen).toContain(party.id)
    denied(svc.updateNote(db, campaignId, secret.id, PLAYER, { title: 'Nope' }))
    denied(svc.updateNote(db, campaignId, party.id, PLAYER, { title: 'Nope' }))
    denied(svc.deleteNote(db, campaignId, party.id, PLAYER))
  })

  it('the DM can’t see or touch a player’s private note', () => {
    const diary = data(svc.createNote(db, campaignId, PLAYER, { title: 'Diary', bodyMarkdown: '', visibility: 'private' }))
    expect(data(svc.listNotes(db, campaignId, DM)).map((n) => n.id)).not.toContain(diary.id)
    denied(svc.updateNote(db, campaignId, diary.id, DM, { title: 'Read it' }))
    denied(svc.deleteNote(db, campaignId, diary.id, DM))
  })

  it('a note id from another campaign can’t be edited through this one', () => {
    const other = data(svc.createCampaign(db, PLAYER, 'Player’s own'))
    const theirs = data(svc.createNote(db, other.id, PLAYER, { title: 'Theirs', bodyMarkdown: '', visibility: 'shared' }))
    denied(svc.updateNote(db, campaignId, theirs.id, DM, { title: 'Crossed over' }))
  })
})

describe('someone who never joined', () => {
  it('can’t read or write anything', () => {
    denied(svc.listNotes(db, campaignId, OUTSIDER, true))
    denied(svc.listFolders(db, campaignId, OUTSIDER))
    denied(svc.createNote(db, campaignId, OUTSIDER, { title: 'Hi', bodyMarkdown: '', visibility: 'shared' }))
    denied(svc.listMessages(db, campaignId, OUTSIDER))
    denied(svc.getCalendar(db, campaignId, OUTSIDER))
    denied(svc.getStash(db, campaignId, OUTSIDER))
    denied(svc.changeStash(db, campaignId, OUTSIDER, { op: 'add', name: 'A gift' }))
  })
})

describe('the reputation tracker', () => {
  it('only the DM changes it, and a player sees only the shown entries, without the DM’s notes', () => {
    denied(svc.saveReputation(db, campaignId, PLAYER, { entries: [] }))
    data(
      svc.saveReputation(db, campaignId, DM, {
        entries: [
          { id: 'a', name: 'The Ember Guard', kind: 'faction', standing: 3, shared: true, secret: 'Corrupt' },
          { id: 'b', name: 'The Night Court', kind: 'faction', standing: -5, shared: false }
        ]
      })
    )
    const seen = data(svc.getReputation(db, campaignId, PLAYER)).entries
    expect(seen.map((e) => e.name)).toEqual(['The Ember Guard'])
    expect(seen[0]).not.toHaveProperty('secret')
    expect(data(svc.getReputation(db, campaignId, DM)).entries).toHaveLength(2)
    denied(svc.getReputation(db, campaignId, OUTSIDER))
  })
})

describe('the maps', () => {
  it('only the DM changes them; a player sees only shown maps and pins, and under fog only the fogged copy', () => {
    denied(svc.saveMaps(db, campaignId, PLAYER, { maps: [] }))
    denied(svc.setMapImage(db, campaignId, PLAYER, 'w', 'data:image/png;base64,AAAA'))
    expect(svc.setMapImage(db, campaignId, DM, 'w', 'javascript:alert(1)').ok).toBe(false)
    data(
      svc.saveMaps(db, campaignId, DM, {
        maps: [
          { id: 'w', name: 'The World', shared: true, fog: true, pins: [{ id: 'a', x: 0.5, y: 0.5, label: 'Cinderhold', shared: true }, { id: 'b', x: 0.2, y: 0.2, label: 'The lair' }] },
          { id: 's', name: 'Secret dungeon', shared: false }
        ]
      })
    )
    data(svc.setMapImage(db, campaignId, DM, 'w', 'data:image/png;base64,REAL'))
    const seen = data(svc.getMaps(db, campaignId, PLAYER)).maps
    expect(seen.map((m) => m.name)).toEqual(['The World'])
    expect(seen[0].pins.map((p) => p.label)).toEqual(['Cinderhold'])
    // Under fog, nothing until the DM's app has made the fogged copy — never the real picture.
    expect(seen[0].imageId).toBeNull()
    expect(data(svc.getMapImage(db, campaignId, PLAYER, 'w'))).toBeNull()
    data(svc.setMapImage(db, campaignId, DM, 'w', 'data:image/jpeg;base64,FOGGED', true))
    expect(data(svc.getMapImage(db, campaignId, PLAYER, 'w'))).toBe('data:image/jpeg;base64,FOGGED')
    expect(data(svc.getMapImage(db, campaignId, DM, 'w'))).toBe('data:image/png;base64,REAL')
    denied(svc.getMapImage(db, campaignId, PLAYER, 's'))
    denied(svc.getMaps(db, campaignId, OUTSIDER))
    // Taking a map away takes its picture.
    data(svc.saveMaps(db, campaignId, DM, { maps: [{ id: 's', name: 'Secret dungeon' }] }))
    expect(data(svc.getMapImage(db, campaignId, DM, 's'))).toBeNull()
  })
})

describe('the party stash', () => {
  it('anyone at the table adds and takes things, and the stash is kept', () => {
    const stash = data(svc.changeStash(db, campaignId, PLAYER, { op: 'add', name: 'Bag of holding' }))
    const bag = stash.items.find((i) => i.name === 'Bag of holding')!
    data(svc.changeStash(db, campaignId, PLAYER, { op: 'take', id: bag.id }))
    data(svc.changeStash(db, campaignId, DM, { op: 'coins', coin: 'gp', delta: 25 }))
    const seen = data(svc.getStash(db, campaignId, PLAYER))
    expect(seen.items.find((i) => i.id === bag.id)?.heldBy).toBe(PLAYER)
    expect(seen.coins.gp).toBe(25)
    const nope = svc.changeStash(db, campaignId, PLAYER, { op: 'coins', coin: 'gp', delta: -100 })
    expect(nope.ok).toBe(false)
  })
})
