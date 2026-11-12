import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Modal } from '../../ui/Modal'
import { rankByName } from '@shared/rankByName'
import { useAllMonsters } from '../../data/useAllMonsters'
import type { PackMonster } from '../../data/packMonsters'
import { formatCr } from '../../data/bestiary'
import { FileIcon, StatblockIcon } from '../campaigns/icons'
import type { Quest } from '@shared/quests'
import { REP_KIND_LABEL, standingLabel, type RepEntry } from '@shared/reputation'
import type { WorldMapDoc } from '@shared/worldMap'
import { focusMapPin } from '../campaigns/WorldMap'
import { TOOL_ICONS } from './toolIcons'
import { BrowserIcon, keptPagesFor } from '../browser/BrowserPanel'
import { useBrowserAccount } from '../browser/browserAccount'

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** A quest's mark in the results: the quest log's scroll. */
function QuestGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 2.5h7.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 12.5V4a1.5 1.5 0 0 1 1-1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/** One thing the search can jump to. */
export interface SearchTarget {
  id: string
  name: string
  /** A few words after the name: "Scene", "DM only", "Tool". */
  hint?: string
  icon: ReactNode
  onSelect: () => void
}

interface QuickSearchProps {
  open: boolean
  onClose: () => void
  notes: SearchTarget[]
  tools: SearchTarget[]
  /** Puts a creature's statblock on the canvas; leave out to not search creatures. */
  onOpenMonster?: (monster: PackMonster) => void
  /**
   * The campaign's quest log, reputation tracker and maps to search (what this viewer can see of them), and opening
   * each one's box.
   */
  quests?: { campaignId: string | null; sessionId: string | null; onOpen: () => void; onOpenTool?: (tool: 'reputation' | 'worldmap') => void }
  /** Opens one of your kept Browser pages; leave out to not search them. */
  onOpenPage?: (url: string) => void
}

const MAX_NOTES = 8
const MAX_MONSTERS = 6

/**
 * Ctrl+K: one box that jumps to any note, quest (or hint), person or power, map (or pin on one), tool, kept web page
 * or creature on the canvas. Type to narrow it down, ↑/↓ to pick,
 * Enter to open. With nothing typed it lists the first few notes, then the tools.
 */
export function QuickSearch({ open, onClose, ...rest }: QuickSearchProps): JSX.Element {
  return (
    <Modal open={open} onClose={onClose} width={520}>
      {open && <SearchBody onClose={onClose} {...rest} />}
    </Modal>
  )
}

// Mounted only while open, so the creature list is only built when someone's searching.
function SearchBody({ onClose, notes, tools, onOpenMonster, quests, onOpenPage }: Omit<QuickSearchProps, 'open'>): JSX.Element {
  const [query, setQuery] = useState('')
  // The quest log, read when the search opens.
  const [questLog, setQuestLog] = useState<Quest[]>([])
  useEffect(() => {
    if (!quests?.campaignId) return
    let live = true
    void window.goblin.quests.get(quests.campaignId, quests.sessionId ?? undefined).then((r) => {
      if (live && r.ok) setQuestLog(r.data.quests)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quests?.campaignId, quests?.sessionId])
  // The people and powers, and the maps' pins, read alongside the quests.
  const [people, setPeople] = useState<RepEntry[]>([])
  const [maps, setMaps] = useState<WorldMapDoc[]>([])
  useEffect(() => {
    if (!quests?.campaignId) return
    let live = true
    void window.goblin.reputation.get(quests.campaignId, quests.sessionId ?? undefined).then((r) => live && r.ok && setPeople(r.data.entries))
    void window.goblin.worldMap.get(quests.campaignId, quests.sessionId ?? undefined).then((r) => live && r.ok && setMaps(r.data.maps))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quests?.campaignId, quests?.sessionId])
  const account = useBrowserAccount()
  const pages = useMemo(() => (onOpenPage ? keptPagesFor(account) : []), [onOpenPage, account])
  const [active, setActive] = useState(0)
  const { monsters } = useAllMonsters()
  const listRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => {
    const q = query.trim()
    const creatures: SearchTarget[] =
      onOpenMonster && q
        ? rankByName(monsters, q)
            .slice(0, MAX_MONSTERS)
            .map((m) => ({ id: `monster:${m.index}`, name: m.name, hint: `CR ${formatCr(m.crNumeric)}${m.packName ? ` · ${m.packName}` : ''}`, icon: <StatblockIcon />, onSelect: () => onOpenMonster(m) }))
        : []
    // Quests, their hints and kept pages only once something's typed, like creatures.
    const openQuests = (): void => quests?.onOpen()
    const questItems: SearchTarget[] = q
      ? rankByName(
          questLog.map((x) => ({ id: `quest:${x.id}`, name: x.title || 'Untitled quest', hint: x.status === 'active' ? (x.giver ? `Quest · from ${x.giver}` : 'Quest') : 'Finished quest', icon: <QuestGlyph />, onSelect: openQuests })),
          q
        ).slice(0, MAX_NOTES)
      : []
    const hintItems: SearchTarget[] = q
      ? rankByName(
          questLog.flatMap((x) => (x.hints ?? []).map((h) => ({ id: `hint:${h.id}`, name: h.text, hint: `Hint · ${x.title}`, icon: <QuestGlyph />, onSelect: openQuests }))),
          q
        ).slice(0, MAX_NOTES)
      : []
    const pageItems: SearchTarget[] =
      q && onOpenPage
        ? rankByName(
            pages.map((p) => ({ id: `page:${p.url}`, name: p.title || p.url, hint: hostOf(p.url), icon: <BrowserIcon />, onSelect: () => onOpenPage(p.url) })),
            q
          ).slice(0, MAX_NOTES)
        : []
    const peopleItems: SearchTarget[] = q
      ? rankByName(
          people.map((p) => ({ id: `rep:${p.id}`, name: p.name, hint: `${REP_KIND_LABEL[p.kind]} · ${standingLabel(p.standing)}`, icon: TOOL_ICONS.reputation, onSelect: () => quests?.onOpenTool?.('reputation') })),
          q
        ).slice(0, MAX_NOTES)
      : []
    const pinItems: SearchTarget[] = q
      ? rankByName(
          maps.flatMap((m) =>
            [{ id: `map:${m.id}`, name: m.name, hint: 'Map', pin: null as string | null, map: m.id }, ...m.pins.filter((p) => p.label).map((p) => ({ id: `pin:${m.id}:${p.id}`, name: p.label, hint: `Pin · ${m.name}`, pin: p.id, map: m.id }))].map((t) => ({
              id: t.id,
              name: t.name,
              hint: t.hint,
              icon: TOOL_ICONS.worldmap,
              onSelect: () => {
                focusMapPin(t.map, t.pin)
                quests?.onOpenTool?.('worldmap')
              }
            }))
          ),
          q
        ).slice(0, MAX_NOTES)
      : []
    return [
      { label: 'Notes', items: rankByName(notes, q).slice(0, MAX_NOTES) },
      { label: 'Quests', items: [...questItems, ...hintItems].slice(0, MAX_NOTES) },
      { label: 'People and powers', items: peopleItems },
      { label: 'Maps', items: pinItems },
      { label: 'Tools', items: rankByName(tools, q) },
      { label: 'Kept pages', items: pageItems },
      { label: 'Creatures', items: creatures }
    ].filter((g) => g.items.length > 0)
  }, [query, notes, tools, monsters, onOpenMonster, questLog, quests, pages, onOpenPage, people, maps])

  const flat = groups.flatMap((g) => g.items)
  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function choose(target: SearchTarget | undefined): void {
    if (!target) return
    onClose()
    target.onSelect()
  }

  let index = -1
  return (
    <div className="gb-search">
      <input
        autoFocus
        className="gb-input gb-search-input"
        placeholder={onOpenMonster ? 'Find a note, quest, tool or creature' : 'Find a note, quest or tool'}
        aria-label="Search"
        role="combobox"
        aria-expanded="true"
        aria-controls="gb-search-results"
        aria-activedescendant={flat[active] ? `gb-search-${active}` : undefined}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            const step = e.key === 'ArrowDown' ? 1 : -1
            setActive((a) => (flat.length ? (a + step + flat.length) % flat.length : 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            choose(flat[active])
          }
        }}
      />
      <div className="gb-search-results" id="gb-search-results" role="listbox" ref={listRef}>
        {flat.length === 0 && <p className="gb-search-empty">Nothing called “{query.trim()}”.</p>}
        {groups.map((g) => (
          <div key={g.label} role="group" aria-label={g.label}>
            <div className="gb-search-group">{g.label}</div>
            {g.items.map((t) => {
              index += 1
              const i = index
              return (
                <div
                  key={t.id}
                  id={`gb-search-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className="gb-search-item"
                  onMouseMove={() => i !== active && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(t)}
                >
                  <span className="gb-search-icon">{t.icon}</span>
                  <span className="gb-search-name">{t.name}</span>
                  {t.hint && <span className="gb-search-hint">{t.hint}</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="gb-search-keys" aria-hidden="true">
        <span><kbd>↑</kbd><kbd>↓</kbd> pick</span>
        <span><kbd>Enter</kbd> open</span>
        <span><kbd>Esc</kbd> close</span>
      </div>
    </div>
  )
}

/**
 * Ctrl+K (⌘K on a Mac) toggles the search — from anywhere, a note's editor included — while `root` is on screen
 * (so a workspace kept mounted behind Combat or the Workshop doesn't answer).
 */
export function useQuickSearchKey(root: RefObject<HTMLElement>, setOpen: (update: (open: boolean) => boolean) => void): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'k') return
      if (!root.current || root.current.offsetParent === null) return
      e.preventDefault()
      e.stopPropagation()
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [root, setOpen])
}

/** The corner's search button: a magnifier that slides out its shortcut on hover, like the switcher beside it. */
export function QuickSearchButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button type="button" className="gb-switcher-trigger gb-switcher-trigger--icon" onClick={onClick} aria-label="Search (Ctrl+K)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <span className="gb-switcher-trigger-name">Search · Ctrl K</span>
    </button>
  )
}

/** A note as something to jump to. */
export function noteTarget(note: { id: string; title: string; visibility: string; sceneDeckId: string | null }, onSelect: () => void): SearchTarget {
  return {
    id: `note:${note.id}`,
    name: note.title || 'Untitled',
    hint: note.sceneDeckId ? 'Scene' : note.visibility === 'dm' ? 'DM only' : note.visibility === 'private' ? 'Private' : undefined,
    icon: <FileIcon />,
    onSelect
  }
}
