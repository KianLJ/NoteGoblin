/**
 * A campaign's quest log: the plot threads the DM is tracking, each open, done or failed. One JSON document per
 * campaign (campaign_quests), written by the DM and read by players — who only ever get the ones marked shared.
 */

export type QuestStatus = 'active' | 'done' | 'failed'

export interface Quest {
  id: string
  title: string
  /** A line or two: who gave it, what's needed. */
  detail: string
  status: QuestStatus
  /** Players can see it. Off: the DM's own thread, not yet known to the party. */
  shared: boolean
  /** A note to open with it — by title, like a [[link]]. */
  noteTitle?: string
  /** Who gave it: "Brother Aldric", "the Harbourmaster". */
  giver?: string
  /** What the party gets for it: gold pieces, experience points, and anything else (an item, a favour). */
  rewardGold?: number
  rewardXp?: number
  rewardItems?: string
  /** The gold and XP have been handed out (once, when it was first completed with the party connected). */
  rewarded?: boolean
}

export interface CampaignQuests {
  quests: Quest[]
}

const MAX_QUESTS = 300
const MAX_TITLE = 200
const MAX_DETAIL = 2000

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
    const gold = reward(r.rewardGold)
    if (gold) quest.rewardGold = gold
    const xp = reward(r.rewardXp)
    if (xp) quest.rewardXp = xp
    if (typeof r.rewardItems === 'string' && r.rewardItems.trim()) quest.rewardItems = r.rewardItems.trim().slice(0, MAX_TITLE)
    if (r.rewarded === true) quest.rewarded = true
    quests.push(quest)
  }
  return { quests }
}

/** A reward amount: a whole number from 1 up to a million, or nothing. */
function reward(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.min(1_000_000, Math.floor(v)) : undefined
}

/** A quest's rewards as short labels — "250 gp", "300 XP", then the rest. */
export function rewardLabels(q: Quest): string[] {
  return [q.rewardGold ? `${q.rewardGold.toLocaleString()} gp` : '', q.rewardXp ? `${q.rewardXp.toLocaleString()} XP` : '', q.rewardItems ?? ''].filter(Boolean)
}

/** A reward split evenly between `people`: what each gets (rounded down), and what's left over. */
export function splitReward(total: number, people: number): { each: number; leftover: number } {
  if (people < 1 || total < 1) return { each: 0, leftover: Math.max(0, total) }
  const each = Math.floor(total / people)
  return { each, leftover: total - each * people }
}

/** What a player is sent: only the shared quests. */
export function questsForPlayer(doc: CampaignQuests): CampaignQuests {
  return { quests: doc.quests.filter((q) => q.shared) }
}
