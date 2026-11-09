import { useEffect, useState } from 'react'
import type { BestiaryMonster } from '../../data/bestiary'
import type { NotesWorkspace } from '../campaigns/useNotesWorkspace'

export type DmTabRef = { kind: 'note'; id: string } | { kind: 'monster'; id: string }

/**
 * The classic DM screen's main-pane state: the open monster statblock tabs,
 * the order of the header's tab strip (notes and monsters mixed, drag to
 * reorder), and which player's sheet is showing instead of a tab.
 */
export function useClassicDmTabs(workspace: NotesWorkspace) {
  const [viewedPlayerUserId, setViewedPlayerUserId] = useState<string | null>(null)
  // Enemy statblock tabs opened from the Initiative tracker — a separate open list from note tabs (each keyed by
  // the monster's index, deduped the same way notes dedupe by note id). null: no monster tab is the active view.
  const [monsterTabs, setMonsterTabs] = useState<BestiaryMonster[]>([])
  const [activeMonsterTab, setActiveMonsterTab] = useState<string | null>(null)

  function openMonsterTab(monster: BestiaryMonster): void {
    setMonsterTabs((prev) => (prev.some((m) => m.index === monster.index) ? prev : [...prev, monster]))
    setActiveMonsterTab(monster.index)
    setViewedPlayerUserId(null)
  }

  function closeMonsterTab(index: string): void {
    setMonsterTabs((prev) => {
      const next = prev.filter((m) => m.index !== index)
      setActiveMonsterTab((current) => (current === index ? (next[next.length - 1]?.index ?? null) : current))
      return next
    })
  }

  // The tab strip mixes two lists (note tabs, monster tabs) that one drag can reorder against each other.
  // Reconciled, not recomputed, when either changes: existing positions survive, a new tab goes on the end.
  const [dmTabOrder, setDmTabOrder] = useState<DmTabRef[]>([])
  useEffect(() => {
    setDmTabOrder((prev) => {
      const noteIds = new Set(workspace.tabNotes.map((n) => n.id))
      const monsterIds = new Set(monsterTabs.map((m) => m.index))
      const kept = prev.filter((t) => (t.kind === 'note' ? noteIds.has(t.id) : monsterIds.has(t.id)))
      const keptNoteIds = new Set(kept.filter((t) => t.kind === 'note').map((t) => t.id))
      const keptMonsterIds = new Set(kept.filter((t) => t.kind === 'monster').map((t) => t.id))
      const newNotes: DmTabRef[] = workspace.tabNotes.filter((n) => !keptNoteIds.has(n.id)).map((n) => ({ kind: 'note', id: n.id }))
      const newMonsters: DmTabRef[] = monsterTabs.filter((m) => !keptMonsterIds.has(m.index)).map((m) => ({ kind: 'monster', id: m.index }))
      return [...kept, ...newNotes, ...newMonsters]
    })
  }, [workspace.tabNotes, monsterTabs])

  function moveDmTab(dragged: DmTabRef, target: DmTabRef): void {
    if (dragged.kind === target.kind && dragged.id === target.id) return
    setDmTabOrder((prev) => {
      const withoutDragged = prev.filter((t) => !(t.kind === dragged.kind && t.id === dragged.id))
      const targetIndex = withoutDragged.findIndex((t) => t.kind === target.kind && t.id === target.id)
      if (targetIndex === -1) return prev
      return [...withoutDragged.slice(0, targetIndex), dragged, ...withoutDragged.slice(targetIndex)]
    })
  }

  /** null deactivates every monster tab (a note shows instead); activating one drops the player-sheet view. */
  function selectMonsterTab(index: string | null): void {
    setActiveMonsterTab(index)
    if (index) setViewedPlayerUserId(null)
  }

  return { viewedPlayerUserId, setViewedPlayerUserId, monsterTabs, activeMonsterTab, setActiveMonsterTab, openMonsterTab, closeMonsterTab, dmTabOrder, moveDmTab, selectMonsterTab }
}
