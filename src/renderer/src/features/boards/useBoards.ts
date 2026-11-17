import { useCallback, useEffect, useRef, useState } from 'react'
import { applyBoardChange, type BoardActor, type BoardChange, type CampaignBoards } from '@shared/boards'
import { useMyUserId } from '../account/avatar'

export interface BoardsApi {
  doc: CampaignBoards
  /** You, as changes are made in your name (the DM's own app also passes `isDm`). */
  me: BoardActor
  /** Makes a change: shown here at once, then sent; if it's refused, the error comes back and the collections are read again. */
  change: (c: BoardChange) => Promise<string | null>
  sessionId: string | null
  campaignId: string
}

/**
 * A campaign's shared collections, kept in step with everyone else's: read
 * once, then every change anyone makes is applied as it arrives.
 * `sessionId`: a player's session (their reads and changes go to the DM).
 */
export function useBoards(campaignId: string | null, sessionId: string | null, isDm: boolean): BoardsApi | null {
  const [doc, setDoc] = useState<CampaignBoards | null>(null)
  const docRef = useRef<CampaignBoards | null>(null)
  docRef.current = doc
  const relayId = useMyUserId()
  const [localId, setLocalId] = useState<{ id: string; name: string } | null>(null)
  useEffect(() => {
    void window.goblin.identity.getCurrent().then((i) => i && setLocalId({ id: i.id, name: i.displayName }))
  }, [])
  // The DM's own app works as its local identity; a player as their relay account.
  const me: BoardActor = { id: (sessionId ? relayId : localId?.id) ?? '', name: localId?.name ?? 'You', isDm }

  const load = useCallback(async () => {
    if (!campaignId) return
    const r = await window.goblin.boards.get(campaignId, sessionId ?? undefined)
    if (r.ok) setDoc(r.data)
  }, [campaignId, sessionId])

  useEffect(() => {
    setDoc(null)
    void load()
  }, [load])

  useEffect(() => {
    if (!campaignId) return
    return window.goblin.boards.onChange(({ sessionId: from, campaignId: cid, change, actor }) => {
      if (cid !== campaignId || (sessionId && from !== sessionId) || (!sessionId && from !== null)) return
      setDoc((d) => {
        if (!d) return d
        const r = applyBoardChange(d, change, actor)
        return r.ok ? r.doc : d
      })
    })
  }, [campaignId, sessionId])

  const meRef = useRef(me)
  meRef.current = me
  const change = useCallback(
    async (c: BoardChange): Promise<string | null> => {
      if (!campaignId) return 'No campaign open.'
      const d = docRef.current
      if (d) {
        const local = applyBoardChange(d, c, meRef.current)
        if (!local.ok) return local.error
        setDoc(local.doc)
      }
      const r = await window.goblin.boards.change(campaignId, c, sessionId ?? undefined)
      if (r.ok) return null
      void load()
      return r.error
    },
    [campaignId, sessionId, load]
  )

  if (!campaignId || !doc) return null
  return { doc, me, change, sessionId, campaignId }
}
