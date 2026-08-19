import type { Database as DatabaseType } from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

export type MessageChannel = 'party' | 'whisper'

export interface MessageRow {
  id: string
  campaign_id: string
  channel: MessageChannel
  sender_user_id: string
  /** Only set for a 'whisper' — always the other side of the DM<->one-player thread (see campaignService.ts's sendMessage for how that's enforced). Null for 'party'. */
  recipient_user_id: string | null
  body: string
  created_at: string
}

export class MessageRepo {
  constructor(private db: DatabaseType) {}

  /**
   * Every message a given viewer is allowed to see in this campaign — every
   * party message, plus only the whisper thread(s) they're actually a party
   * to (as sender or recipient). A whisper is always DM<->one player, so
   * this single query naturally returns every whisper thread for the DM
   * (they're on one side of all of them) and just their own thread for a
   * player — no separate "am I the DM" branch needed.
   */
  listVisibleTo(campaignId: string, viewerUserId: string): MessageRow[] {
    return this.db
      .prepare(
        `SELECT * FROM messages
         WHERE campaign_id = ?
           AND (channel = 'party' OR (channel = 'whisper' AND (sender_user_id = ? OR recipient_user_id = ?)))
         ORDER BY created_at ASC`
      )
      .all(campaignId, viewerUserId, viewerUserId) as MessageRow[]
  }

  findById(id: string): MessageRow | undefined {
    return this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined
  }

  create(input: {
    campaignId: string
    channel: MessageChannel
    senderUserId: string
    recipientUserId: string | null
    body: string
  }): MessageRow {
    const id = uuid()
    this.db
      .prepare(
        'INSERT INTO messages (id, campaign_id, channel, sender_user_id, recipient_user_id, body) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, input.campaignId, input.channel, input.senderUserId, input.recipientUserId, input.body)
    return this.findById(id)!
  }
}
