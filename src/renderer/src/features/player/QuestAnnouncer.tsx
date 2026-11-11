import { useEffect, useRef, useState } from 'react'
import type { Quest, QuestHint } from '@shared/quests'
import { playSfx } from '../audio/soundEffects'
import { RewardChips, useCoinNames } from '../campaigns/QuestLog'

type Announcement = { kind: 'quest'; quest: Quest } | { kind: 'hint'; quest: Quest; hint: QuestHint }

/**
 * A player's side of the DM showing the party something in the quest log: a new quest unrolls as a scroll in the
 * middle of the canvas, and a newly shown hint slides in at the top. What the log held when the campaign opened
 * counts as already seen, so only what the DM shows during play is announced. One at a time, in order.
 */
export function QuestAnnouncer({ sessionId, campaignId, onOpenQuests }: { sessionId: string | null; campaignId: string | null; onOpenQuests: () => void }): JSX.Element | null {
  const [queue, setQueue] = useState<Announcement[]>([])
  const coinNames = useCoinNames()
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    seen.current = null
    setQueue([])
    if (!campaignId) return
    let stale = false
    const read = (): void => {
      void window.goblin.quests.get(campaignId, sessionId ?? undefined).then((r) => {
        if (stale || !r.ok) return
        const quests = r.data.quests.filter((q) => q.shared)
        const keys = (q: Quest): string[] => [`q:${q.id}`, ...(q.hints ?? []).filter((h) => h.shown).map((h) => `h:${h.id}`)]
        if (!seen.current) {
          seen.current = new Set(quests.flatMap(keys))
          return
        }
        const known = seen.current
        const fresh: Announcement[] = []
        for (const q of quests) {
          if (q.status !== 'active') {
            keys(q).forEach((k) => known.add(k))
            continue
          }
          if (!known.has(`q:${q.id}`)) fresh.push({ kind: 'quest', quest: q })
          // A new quest shows its hints itself; only hints on a quest the party already had get their own notice.
          else for (const h of q.hints ?? []) if (h.shown && !known.has(`h:${h.id}`)) fresh.push({ kind: 'hint', quest: q, hint: h })
          keys(q).forEach((k) => known.add(k))
        }
        if (fresh.length) {
          // A new quest goes ahead of any hints waiting (or showing — that one comes back after).
          setQueue((prev) => {
            const all = [...prev, ...fresh]
            return [...all.filter((a) => a.kind === 'quest'), ...all.filter((a) => a.kind === 'hint')]
          })
          playSfx('sceneAdvance')
        }
      })
    }
    read()
    const off = window.goblin.campaigns.onChanged((e) => {
      if (e.campaignId === campaignId) read()
    })
    return () => {
      stale = true
      off()
    }
  }, [sessionId, campaignId])

  const current = queue[0] ?? null
  const next = (): void => setQueue((prev) => prev.slice(1))

  // A hint is a passing notice: it goes by itself.
  useEffect(() => {
    if (current?.kind !== 'hint') return
    const t = setTimeout(next, 9000)
    return () => clearTimeout(t)
  }, [current])

  if (!current) return null
  if (current.kind === 'hint') {
    return (
      <div className="gb-quest-clue" role="status" key={current.hint.id}>
        <button type="button" className="gb-quest-reward-close" aria-label="Close" onClick={next}>
          ×
        </button>
        <span className="gb-quest-reward-eyebrow">New hint · {current.quest.title}</span>
        <span className="gb-quest-clue-text">{current.hint.text}</span>
      </div>
    )
  }

  const q = current.quest
  return (
    <div className="gb-quest-herald" role="dialog" aria-labelledby={`gb-herald-${q.id}`} key={q.id} onKeyDown={(e) => e.key === 'Escape' && next()}>
      <div className="gb-quest-herald-scroll">
        <span className="gb-quest-herald-seal" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
            <path d="M4 2.5h7.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 12.5V4a1.5 1.5 0 0 1 1-1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="gb-quest-herald-eyebrow">A new quest</span>
        <h2 id={`gb-herald-${q.id}`}>{q.title || 'Untitled quest'}</h2>
        {q.giver && <span className="gb-quest-herald-giver">from {q.giver}</span>}
        {q.detail && <p>{q.detail}</p>}
        <RewardChips quest={q} coinNames={coinNames} className="gb-quest-herald-rewards" />
        {q.hints && q.hints.length > 0 && (
          <ul className="gb-quest-herald-hints">
            {q.hints.map((h) => (
              <li key={h.id}>{h.text}</li>
            ))}
          </ul>
        )}
        <div className="gb-quest-herald-actions">
          <button type="button" className="gb-quest-herald-later" onClick={next}>
            Later
          </button>
          <button
            type="button"
            className="gb-quest-herald-open"
            onClick={() => {
              next()
              onOpenQuests()
            }}
          >
            Open the quest log
          </button>
        </div>
      </div>
    </div>
  )
}
