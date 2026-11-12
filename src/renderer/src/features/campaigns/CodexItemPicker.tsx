import { useEffect, useMemo, useRef, useState } from 'react'
import { EQUIPMENT, MAGIC_ITEMS } from '@shared/compendium'
import { codexEntries } from '@shared/content/codexContent'
import type { CodexRef } from '@shared/codexRef'
import { useActivePackRegistry } from '../content/pickerContent'
import './codexItemPicker.css'

/** Asks the canvas around `from` to open a Codex entry in a box of its own (Canvas.tsx listens). */
export const OPEN_CODEX_ENTRY_EVENT = 'gb-open-codex-entry'
export function openCodexEntry(from: HTMLElement, ref: CodexRef): void {
  from.dispatchEvent(new CustomEvent(OPEN_CODEX_ENTRY_EVENT, { bubbles: true, detail: ref }))
}

interface Choice extends CodexRef {
  group: string
  hint: string
}

const MAX_SHOWN = 40

/** Every item the Codex has: SRD weapons, armour and gear, SRD magic items, and the active packs' items. */
function useItemChoices(): Choice[] {
  const { packs, registry } = useActivePackRegistry()
  return useMemo(() => {
    const gear: Choice[] = EQUIPMENT.map((e) => ({
      kind: 'equipment',
      id: e.id,
      name: e.name,
      group: e.category === 'Weapon' ? 'Weapons' : e.category === 'Armor' ? 'Armour' : 'Gear',
      hint: [e.damageDice ? `${e.damageDice} ${e.damageType ?? ''}`.trim() : '', e.cost].filter(Boolean).join(' · ')
    }))
    const magic: Choice[] = MAGIC_ITEMS.map((m) => ({ kind: 'magicItem', id: m.id, name: m.name, group: 'Magic items', hint: [m.rarity, m.category].filter(Boolean).join(' · ') }))
    const homebrew: Choice[] = codexEntries(registry, packs)
      .filter((e) => e.kind === 'items')
      .map((e) => ({ kind: 'homebrew', id: e.key, name: e.name, group: 'Homebrew items', hint: e.packName }))
    return [...homebrew, ...magic, ...gear]
  }, [packs, registry])
}

/**
 * "+ From the Codex": a search over every item the Codex has — weapons, armour, gear, magic items and the active
 * packs' items — that hands back the one picked. For quest rewards and the party stash.
 */
export function CodexItemPicker({ onPick, label = '+ From the Codex' }: { onPick: (ref: CodexRef) => void; label?: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const all = useItemChoices()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open])

  const q = query.trim().toLowerCase()
  const shown = useMemo(() => {
    const hits = q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all
    // Names starting with what's typed first.
    return [...hits].sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))).slice(0, MAX_SHOWN)
  }, [all, q])
  useEffect(() => setActive(0), [q])

  function pick(c: Choice | undefined): void {
    if (!c) return
    onPick({ kind: c.kind, id: c.id, name: c.name })
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="gb-codex-pick" ref={box}>
      <button type="button" className="gb-stash-act" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div className="gb-codex-pick-pop" role="dialog" aria-label="Pick an item from the Codex">
          <input
            className="gb-input"
            autoFocus
            value={query}
            placeholder="A longsword, a bag of holding…"
            aria-label="Find an item"
            role="combobox"
            aria-expanded="true"
            aria-controls="gb-codex-pick-list"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => (shown.length ? (a + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length : 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                pick(shown[active])
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                setOpen(false)
              }
            }}
          />
          <ul className="gb-codex-pick-list" id="gb-codex-pick-list" role="listbox">
            {shown.length === 0 && <li className="gb-stash-hint">No item called “{query.trim()}”.</li>}
            {shown.map((c, i) => (
              <li
                key={`${c.kind}:${c.id}`}
                role="option"
                aria-selected={i === active}
                className="gb-codex-pick-item"
                onMouseMove={() => i !== active && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
              >
                <span className="gb-codex-pick-name">{c.name}</span>
                <span className="gb-codex-pick-hint">
                  {c.group}
                  {c.hint ? ` · ${c.hint}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
