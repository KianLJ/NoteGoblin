/**
 * A campaign's quest log: the plot threads the DM is tracking, each open, done or failed. One JSON document per
 * campaign (campaign_quests), written by the DM and read by players — who only ever get the ones marked shared.
 */

import { readCodexRef, type CodexRef } from './codexRef'

export type QuestStatus = 'active' | 'done' | 'failed'

/** A note or hint on a quest: a reminder, a clue. The DM writes them, and shows each to the party when they need it. */
export interface QuestHint {
  id: string
  text: string
  /** The party can see it. */
  shown: boolean
}

export interface Quest {
  id: string
  title: string
  /** A line or two: who gave it, what's needed. */
  detail: string
  status: QuestStatus
  /** Players can see it. Off: the DM's own thread, not yet known to the party. */
  shared: boolean
  /** Only these players (user ids) have it, and share its reward; none means the whole party. */
  forPlayers?: string[]
  /** A note to open with it — by title, like a [[link]]. */
  noteTitle?: string
  /** Who gave it: "Brother Aldric", "the Harbourmaster". */
  giver?: string
  /**
   * What the party gets for it: coins by currency id — the standard cp/sp/ep/gp/pp or any a pack adds — then
   * experience points, and anything else (an item, a favour). (Older logs had a single `rewardGold`; it's read as gp.)
   */
  rewardCoins?: Record<string, number>
  rewardXp?: number
  rewardItems?: string
  /** Items from the Codex it pays: weapons, armour, gear, magic items. They go into the party stash when it's done. */
  rewardEntries?: CodexRef[]
  /** Its Codex items have gone into the party stash (once). */
  itemsStashed?: boolean
  /** The coins and XP have been handed out (once, when it was first completed with the party connected). */
  rewarded?: boolean
  /** Notes and hints, in order. A player only gets the shown ones. */
  hints?: QuestHint[]
}

export interface CampaignQuests {
  quests: Quest[]
}

const MAX_QUESTS = 300
const MAX_TITLE = 200
const MAX_DETAIL = 2000
const MAX_HINTS = 30
const MAX_HINT = 500
const MAX_COIN_KINDS = 12
const COIN_ID = /^[A-Za-z0-9_.:-]{1,64}$/

/** The standard coins, worth the most first — the order a quest lists them in, before any a pack adds. */
export const STANDARD_COINS = ['pp', 'gp', 'ep', 'sp', 'cp'] as const
const STANDARD_COIN_NAMES: Record<string, string> = { pp: 'Platinum', gp: 'Gold', ep: 'Electrum', sp: 'Silver', cp: 'Copper' }

/** A currency as the campaign's packs name it (their vocabulary.currencies). */
export interface CoinName {
  id: string
  name: string
}

/** A quest log as it can be trusted: anything that isn't a quest dropped, every field the right type and size. */
export function normalizeQuests(raw: unknown): CampaignQuests {
  const list = typeof raw === 'object' && raw !== null && Array.isArray((raw as { quests?: unknown }).quests) ? (raw as { quests: unknown[] }).quests : []
  const quests: Quest[] = []
  for (const q of list.slice(0, MAX_QUESTS)) {
    if (typeof q !== 'object' || q === null) continue
    const r = q as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id || typeof r.title !== 'string') continue
    const quest: Quest = {
      id: r.id.slice(0, 64),
      title: r.title.slice(0, MAX_TITLE),
      detail: typeof r.detail === 'string' ? r.detail.slice(0, MAX_DETAIL) : '',
      status: r.status === 'done' || r.status === 'failed' ? r.status : 'active',
      shared: r.shared === true
    }
    if (typeof r.noteTitle === 'string' && r.noteTitle.trim()) quest.noteTitle = r.noteTitle.trim().slice(0, MAX_TITLE)
    if (typeof r.giver === 'string' && r.giver.trim()) quest.giver = r.giver.trim().slice(0, MAX_TITLE)
    const coins: Record<string, number> = {}
    if (typeof r.rewardCoins === 'object' && r.rewardCoins !== null) {
      for (const [id, v] of Object.entries(r.rewardCoins as Record<string, unknown>).slice(0, MAX_COIN_KINDS)) {
        const amount = reward(v)
        if (amount && COIN_ID.test(id)) coins[id] = amount
      }
    }
    const legacyGold = reward(r.rewardGold)
    if (legacyGold && !coins.gp) coins.gp = legacyGold
    if (Object.keys(coins).length) quest.rewardCoins = coins
    const xp = reward(r.rewardXp)
    if (xp) quest.rewardXp = xp
    if (typeof r.rewardItems === 'string' && r.rewardItems.trim()) quest.rewardItems = r.rewardItems.trim().slice(0, MAX_TITLE)
    if (r.rewarded === true) quest.rewarded = true
    const entries = Array.isArray(r.rewardEntries) ? r.rewardEntries.map(readCodexRef).filter((e): e is CodexRef => !!e).slice(0, 20) : []
    if (entries.length) quest.rewardEntries = entries
    if (r.itemsStashed === true) quest.itemsStashed = true
    if (Array.isArray(r.forPlayers)) {
      const ids = [...new Set(r.forPlayers.filter((id): id is string => typeof id === 'string' && !!id && id.length <= 128))].slice(0, 50)
      if (ids.length) quest.forPlayers = ids
    }
    const hints = Array.isArray(r.hints) ? r.hints.map(hint).filter((h): h is QuestHint => !!h).slice(0, MAX_HINTS) : []
    if (hints.length) quest.hints = hints
    quests.push(quest)
  }
  return { quests }
}

function hint(raw: unknown): QuestHint | null {
  if (typeof raw !== 'object' || raw === null) return null
  const h = raw as Record<string, unknown>
  if (typeof h.id !== 'string' || !h.id || typeof h.text !== 'string' || !h.text.trim()) return null
  return { id: h.id.slice(0, 64), text: h.text.trim().slice(0, MAX_HINT), shown: h.shown === true }
}

/** A reward amount: a whole number from 1 up to a million, or nothing. */
function reward(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.min(1_000_000, Math.floor(v)) : undefined
}

/**
 * How a coin reads after an amount: "gp" for a standard coin, or its name when a pack adds or renames it —
 * "250 Credits" if a pack calls gold Credits.
 */
export function coinLabel(id: string, currencies: CoinName[] = []): string {
  const name = currencies.find((c) => c.id === id)?.name?.trim()
  if (STANDARD_COIN_NAMES[id] && (!name || name === STANDARD_COIN_NAMES[id])) return id
  return name || id
}

/** Coins (a quest's, or a share of them) as [id, amount] pairs: the standard ones worth the most first, then the rest by id. */
export function coinList(coins: Record<string, number> | undefined): Array<[string, number]> {
  const rank = (id: string): number => {
    const i = (STANDARD_COINS as readonly string[]).indexOf(id)
    return i < 0 ? STANDARD_COINS.length : i
  }
  return Object.entries(coins ?? {})
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))
}

/** Coins as one phrase: "2 gp, 5 sp and 40 Credits". */
export function coinsPhrase(coins: Record<string, number> | undefined, currencies: CoinName[] = []): string {
  const parts = coinList(coins).map(([id, n]) => `${n.toLocaleString()} ${coinLabel(id, currencies)}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '')
}

/** A character's purse with `coins` added: the standard ones to its coins, a pack's to its pack currencies. */
export function addCoins(
  c: { currency?: Partial<Record<(typeof STANDARD_COINS)[number], number>>; packCurrency?: Record<string, number> },
  coins: Record<string, number>
): { currency: Record<(typeof STANDARD_COINS)[number], number>; packCurrency?: Record<string, number> } {
  const currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...c.currency }
  let packCurrency = c.packCurrency
  for (const [id, n] of coinList(coins)) {
    if ((STANDARD_COINS as readonly string[]).includes(id)) currency[id as (typeof STANDARD_COINS)[number]] += n
    else packCurrency = { ...packCurrency, [id]: (packCurrency?.[id] ?? 0) + n }
  }
  return packCurrency ? { currency, packCurrency } : { currency }
}

/** A character's purse with `n` of `coin` taken out — or null if they haven't got that many. */
export function takeCoins(
  c: { currency?: Partial<Record<(typeof STANDARD_COINS)[number], number>>; packCurrency?: Record<string, number> },
  coin: string,
  n: number
): { currency: Record<(typeof STANDARD_COINS)[number], number>; packCurrency?: Record<string, number> } | null {
  const currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...c.currency }
  const standard = (STANDARD_COINS as readonly string[]).includes(coin)
  const have = standard ? currency[coin as (typeof STANDARD_COINS)[number]] : (c.packCurrency?.[coin] ?? 0)
  if (n <= 0 || have < n) return null
  if (standard) {
    currency[coin as (typeof STANDARD_COINS)[number]] = have - n
    return c.packCurrency ? { currency, packCurrency: c.packCurrency } : { currency }
  }
  return { currency, packCurrency: { ...c.packCurrency, [coin]: have - n } }
}

/** The quest pays out something that's handed out automatically: coins or XP. */
export function hasPayout(q: Quest): boolean {
  return coinList(q.rewardCoins).length > 0 || !!q.rewardXp
}

/** The quest pays items (from the Codex, or written in) that haven't gone into the party stash yet. */
export function hasItemsToStash(q: Quest): boolean {
  return !q.itemsStashed && ((q.rewardEntries?.length ?? 0) > 0 || !!q.rewardItems)
}

/** A quest's rewards as short labels — "250 gp", "30 sp", "300 XP", then the rest. */
export function rewardLabels(q: Quest, currencies: CoinName[] = []): string[] {
  return [
    ...coinList(q.rewardCoins).map(([id, n]) => `${n.toLocaleString()} ${coinLabel(id, currencies)}`),
    q.rewardXp ? `${q.rewardXp.toLocaleString()} XP` : '',
    ...(q.rewardEntries ?? []).map((e) => e.name),
    q.rewardItems ?? ''
  ].filter(Boolean)
}

/** A reward split evenly between `people`: what each gets (rounded down), and what's left over. */
export function splitReward(total: number, people: number): { each: number; leftover: number } {
  if (people < 1 || total < 1) return { each: 0, leftover: Math.max(0, total) }
  const each = Math.floor(total / people)
  return { each, leftover: total - each * people }
}

/** The quest is the whole party's, or this player is one it's for. */
export function questIsFor(q: Quest, userId: string): boolean {
  return !q.forPlayers?.length || q.forPlayers.includes(userId)
}

/** What a player is sent: only the shared quests that are theirs, with only their shown hints. */
export function questsForPlayer(doc: CampaignQuests, userId: string): CampaignQuests {
  return {
    quests: doc.quests
      .filter((q) => q.shared && questIsFor(q, userId))
      .map((q) => {
        const out = { ...q }
        const hints = q.hints?.filter((h) => h.shown)
        if (hints?.length) out.hints = hints
        else delete out.hints
        return out
      })
  }
}
