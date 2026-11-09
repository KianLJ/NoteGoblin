import { useEffect, useMemo, useState } from 'react'
import { BESTIARY_TYPES, formatCr, type BestiaryMonster } from '../../data/bestiary'
import { removeCustomMonster, isCustomMonster } from '../../data/customBestiary'
import { PERSONAL_MONSTER_PACK_ID, moveLocalMonstersToPack, removePersonalMonster, type PackMonster } from '../../data/packMonsters'
import { useAllMonsters } from '../../data/useAllMonsters'
import { MonsterEditor, editsInPlace } from './MonsterEditor'
import { PencilIcon, PlusIcon, XIcon } from '../../ui/icons'
import './codex.css'
import { loadNpcs, createNpc, updateNpc, removeNpc, type Npc } from '../../data/npcs'
import { generateNpcName } from '../../data/npcNames'
import { renderStatblockHtml } from '../../statblock'
import { rollInlineDice } from '../dice/inlineDice'
import { CloseIcon } from '../campaigns/icons'
import { playSpellCastSfx, playMonsterSfx } from '../audio/sfxBoardEngine'
import { PLAYING_THE_GAME_TOPICS, type RuleTopic } from '../../data/playingTheGame'
import {
  ensureCustomEntitySfxLoaded,
  subscribeCustomEntitySfx,
  getCustomEntitySfxTitle,
  setCustomEntitySfx,
  removeCustomEntitySfx
} from '../audio/customEntitySfxStore'
import { RACES } from '@shared/dnd5e'
import { codexEntries, type CodexEntry } from '@shared/content/codexContent'
import { HomebrewDetail } from './HomebrewDetail'
import { WORKSHOP_SECTIONS } from '@shared/content/workshop'
import { createPortal } from 'react-dom'
import { popupLayer } from '../../ui/popupLayer'
import type { CanvasEntry, CodexEntryKind } from '../canvas/canvasEntries'
import { useActivePackRegistry } from '../content/pickerContent'
import {
  EQUIPMENT,
  MAGIC_ITEMS,
  SPELLS,
  spellLevelLabel,
  type CompendiumEquipment,
  type CompendiumMagicItem,
  type CompendiumSpell,
  type EquipmentCategory
} from '@shared/compendium'

interface BestiaryProps {
  onClose?: () => void
  /** Fills a workspace canvas box instead of covering the screen — no backdrop, no close button, Escape left alone. */
  embedded?: boolean
  /** Offers "Add to canvas" for the selected monster, NPC, equipment, spell or magic item — it gets a box of its own. */
  onAddToCanvas?: (entry: CanvasEntry) => void
  /** Present only when opened from a note's "Import from Bestiary" toolbar action — swaps the browse-only footer for an "Insert" button, restricts browsing to Monsters (the only category a note statblock can embed), and closes automatically once picked. */
  onPick?: (monster: BestiaryMonster) => void
  /** True only while a player is connected to a live campaign — monster stats are the DM's to reveal, not something to browse freely mid-game. Equipment/Spells/Magic Items stay open since none of that is secret. Never true for the DM's own view, or for a player who isn't currently connected to anyone. */
  hideMonsters?: boolean
  /** The hosted (DM) or joined (player) session id, if any — passed through to a Monsters/Spells row's click-to-play (see playMonsterSfx/playSpellCastSfx) so it reaches the rest of the table, not just whoever's browsing the Codex. */
  sessionId?: string | null
}

type Category = 'Monsters' | 'NPCs' | 'Equipment' | 'Spells' | 'Magic Items' | 'Homebrew' | 'Playing the Game'
const CATEGORIES: Category[] = ['Monsters', 'NPCs', 'Equipment', 'Spells', 'Magic Items', 'Homebrew', 'Playing the Game']
const EQUIPMENT_CATEGORIES: EquipmentCategory[] = ['Weapon', 'Armor', 'Adventuring Gear', 'Tools', 'Mounts and Vehicles']

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * A full-screen SRD reference browser — search + filters on the left, the
 * selected entry's full detail on the right. Monsters reuse the exact same
 * renderStatblockHtml/gb-statblock renderer a DM's ```statblock note block
 * already uses, so a monster looked up here and one pasted into a note look
 * identical. Equipment/Spells/Magic Items are new categories added on top of
 * the original monster-only Bestiary — same underlying compendium data
 * InventoryTab/CombatTab/SpellsTab already draw from, just browsable on its
 * own instead of only while building a character. Entirely local, no
 * network needed for any of it.
 */
export function Bestiary({ onClose, onPick, hideMonsters, sessionId = null, embedded = false, onAddToCanvas }: BestiaryProps): JSX.Element {
  useEffect(() => {
    void ensureCustomEntitySfxLoaded()
  }, [])
  const [category, setCategory] = useState<Category>(hideMonsters ? 'Equipment' : 'Monsters')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null)
  // Device-saved, pack (library + open campaign) and SRD creatures.
  const { monsters: everyMonster, refresh: refreshMonsters } = useAllMonsters()
  // The creature open in the monster editor, if any.
  const [editingMonster, setEditingMonster] = useState<PackMonster | null>(null)
  const [monsterNotice, setMonsterNotice] = useState<string | null>(null)
  const [movingMonsters, setMovingMonsters] = useState(false)
  const localMonsterCount = everyMonster.filter((m) => isCustomMonster(m.index)).length
  const [npcs, setNpcs] = useState(() => loadNpcs())
  const [editingNpcId, setEditingNpcId] = useState<string | 'new' | null>(null)
  const [npcDraft, setNpcDraft] = useState<Omit<Npc, 'id' | 'createdAt'>>({
    name: '',
    race: RACES[0].name,
    occupation: '',
    notes: '',
    portraitDataUrl: null
  })

  // Homebrew: everything the active content packs add (the open campaign's, or your library outside one).
  const { packs: activePacks, registry: packRegistry } = useActivePackRegistry()
  const homebrew = useMemo(() => codexEntries(packRegistry, activePacks).filter((e) => e.kind !== 'monsters'), [packRegistry, activePacks])
  const [packFilter, setPackFilter] = useState('')
  /** Spells: every source, only the SRD, or only homebrew from the active packs. */
  const [spellSource, setSpellSource] = useState<'' | 'srd' | 'homebrew'>('')
  const visibleCategories = (hideMonsters ? CATEGORIES.filter((c) => c !== 'Monsters' && c !== 'NPCs') : CATEGORIES).filter((c) => c !== 'Homebrew' || homebrew.length > 0)

  // Opened as a note's "Import from Bestiary" picker — only a monster can become a ```statblock block, so the
  // other categories would just be dead ends here. hideMonsters wins over a stale 'Monsters' category value
  // (e.g. the DM had it selected before a player joined mid-session, though that specific case can't happen
  // today since this prop is only ever true for a connected player's own view).
  const effectiveCategory: Category =
    onPick ? 'Monsters' : hideMonsters && (category === 'Monsters' || category === 'NPCs') ? 'Equipment' : category

  const allMonsters: PackMonster[] = everyMonster

  useEffect(() => {
    if (embedded) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, embedded])

  // Filters reset whenever the category changes — a leftover "Weapon" filter would just silently hide everything
  // once you switch to Spells, which has nothing called that.
  useEffect(() => {
    setQuery('')
    setTypeFilter('')
    setSpellSource('')
    setSelectedIndex(null)
    setEditingNpcId(null)
  }, [effectiveCategory])

  const filteredNpcs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...npcs]
      .filter((n) => {
        if (typeFilter && n.race !== typeFilter) return false
        if (q && !n.name.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [npcs, query, typeFilter])

  const filteredMonsters = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allMonsters
      .filter((m) => {
        if (typeFilter && m.type !== typeFilter) return false
        if (q && !m.name.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => a.crNumeric - b.crNumeric || a.name.localeCompare(b.name))
  }, [allMonsters, query, typeFilter])

  const filteredEquipment = useMemo(() => {
    const q = query.trim().toLowerCase()
    return EQUIPMENT.filter((e) => {
      if (typeFilter && e.category !== typeFilter) return false
      if (q && !e.name.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [query, typeFilter])

  // The active packs' spells sit in the Spells list too, beside the SRD's (and still under Homebrew).
  const homebrewSpells = useMemo(
    () => homebrew.filter((e) => e.kind === 'spells').map((entry) => ({ entry, level: packRegistry.get('spells', entry.fullId)?.def.level ?? 0 })),
    [homebrew, packRegistry]
  )
  const filteredSpells = useMemo(() => {
    const q = query.trim().toLowerCase()
    return SPELLS.filter((s) => {
      if (spellSource === 'homebrew') return false
      if (typeFilter && String(s.level) !== typeFilter) return false
      if (q && !s.name.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
  }, [query, typeFilter, spellSource])
  const filteredHomebrewSpells = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (spellSource === 'srd') return []
    return homebrewSpells
      .filter((s) => (!typeFilter || String(s.level) === typeFilter) && (!q || s.entry.name.toLowerCase().includes(q)))
      .sort((a, b) => a.level - b.level || a.entry.name.localeCompare(b.entry.name))
  }, [homebrewSpells, query, typeFilter, spellSource])

  const filteredMagicItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return MAGIC_ITEMS.filter((m) => {
      if (typeFilter && m.rarity !== typeFilter) return false
      if (q && !m.name.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [query, typeFilter])

  const filteredHomebrew = useMemo(() => {
    const q = query.trim().toLowerCase()
    return homebrew.filter((e) => (!typeFilter || e.kind === typeFilter) && (!packFilter || e.packId === packFilter) && (!q || e.name.toLowerCase().includes(q)))
  }, [homebrew, query, typeFilter, packFilter])

  // No type filter for this one — ten topics is short enough that a search
  // box alone (matching title or dek) covers it without another dropdown.
  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return PLAYING_THE_GAME_TOPICS
    return PLAYING_THE_GAME_TOPICS.filter((t) => t.title.toLowerCase().includes(q) || t.dek.toLowerCase().includes(q))
  }, [query])

  // Deliberately no "?? filteredX[0]" fallback — auto-rendering an entry's
  // full detail (a monster's stat block especially, the heaviest one) the
  // instant the Codex opens, before any click, turned out to be the actual
  // cause of a lasting scroll stutter across the whole app: something about
  // that immediate render (still not narrowed down further) leaves the
  // renderer in a degraded state that doesn't clear even after the Codex is
  // closed. Nothing selected until the user actually picks one avoids
  // triggering it at all.
  const selectedMonster: BestiaryMonster | undefined = allMonsters.find((m) => m.index === selectedIndex)
  const selectedNpc: Npc | undefined = npcs.find((n) => n.id === selectedIndex)
  const selectedEquipment: CompendiumEquipment | undefined = EQUIPMENT.find((e) => e.id === selectedIndex)
  const selectedSpell: CompendiumSpell | undefined = SPELLS.find((s) => s.id === selectedIndex)
  const selectedMagicItem: CompendiumMagicItem | undefined = MAGIC_ITEMS.find((m) => m.id === selectedIndex)
  const selectedTopic: RuleTopic | undefined = PLAYING_THE_GAME_TOPICS.find((t) => t.id === selectedIndex)
  const selectedHomebrew: CodexEntry | undefined = homebrew.find((e) => e.key === selectedIndex)

  async function handleDeleteCustom(m: PackMonster): Promise<void> {
    if (isCustomMonster(m.index)) removeCustomMonster(m.index)
    else if (m.fullId) {
      const error = await removePersonalMonster(m.fullId)
      if (error) return setMonsterNotice(error)
    }
    refreshMonsters()
    if (selectedIndex === m.index) setSelectedIndex(null)
  }

  async function moveLocalMonsters(): Promise<void> {
    setMovingMonsters(true)
    const result = await moveLocalMonstersToPack()
    setMovingMonsters(false)
    setMonsterNotice('error' in result ? result.error : `Moved ${result.moved} creature${result.moved === 1 ? '' : 's'} into your My Creatures pack.`)
    refreshMonsters()
  }

  function startNewNpc(): void {
    setNpcDraft({ name: '', race: RACES[0].name, occupation: '', notes: '', portraitDataUrl: null })
    setEditingNpcId('new')
  }

  function startEditNpc(npc: Npc): void {
    setNpcDraft({ name: npc.name, race: npc.race, occupation: npc.occupation, notes: npc.notes, portraitDataUrl: npc.portraitDataUrl })
    setEditingNpcId(npc.id)
  }

  function saveNpcDraft(): void {
    if (editingNpcId === 'new') {
      const created = createNpc(npcDraft)
      setNpcs(loadNpcs())
      setSelectedIndex(created.id)
    } else if (editingNpcId) {
      updateNpc(editingNpcId, npcDraft)
      setNpcs(loadNpcs())
      setSelectedIndex(editingNpcId)
    }
    setEditingNpcId(null)
  }

  function handleDeleteNpc(id: string): void {
    removeNpc(id)
    setNpcs(loadNpcs())
    if (selectedIndex === id) setSelectedIndex(null)
    if (editingNpcId === id) setEditingNpcId(null)
  }

  const rarityOptions = useMemo(() => [...new Set(MAGIC_ITEMS.map((m) => m.rarity))].sort(), [])

  const browser = (
      <div
        className={embedded ? undefined : 'gb-card'}
        style={embedded ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : {
          // % of the fixed, inset:0 backdrop (below), not vh/vw — vh/vw
          // always mean the *true* viewport, which no longer matches this
          // element's actual rendered size once App.tsx's font-scale
          // transform is anything other than 1.
          width: 'calc(100% - var(--space-6) * 2)',
          height: 'calc(100% - var(--space-6) * 2)',
          maxWidth: 1100,
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <div className="cx-head">
          {!embedded && <span className="cx-title">{onPick ? 'Pick a monster' : 'Codex'}</span>}
          {!onPick && (
            <div className="cx-tabs" role="tablist" aria-label="Codex sections">
              {visibleCategories.map((c) => (
                <button key={c} type="button" role="tab" aria-selected={effectiveCategory === c} className={effectiveCategory === c ? 'cx-tab cx-tab--on' : 'cx-tab'} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          {!embedded && (
            <button type="button" className="cx-close" onClick={onClose} title="Close" aria-label="Close">
              <CloseIcon />
            </button>
          )}
        </div>

        <div className="gb-codex-split" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div className="gb-codex-list cx-list">
            <div className="cx-filters">
              <label className="cx-search">
                <SearchIcon />
                <input autoFocus placeholder={`Search ${effectiveCategory.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${effectiveCategory.toLowerCase()}`} />
              </label>
              {effectiveCategory === 'Monsters' && (
                <select className="gb-input cx-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="">All types</option>
                  {BESTIARY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {toTitleCase(t)}
                    </option>
                  ))}
                </select>
              )}
              {effectiveCategory === 'NPCs' && (
                <>
                  <select className="gb-input cx-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="">All races</option>
                    {RACES.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="gb-btn gb-btn--secondary cx-new" onClick={startNewNpc}>
                    <PlusIcon size={12} />
                    New NPC
                  </button>
                </>
              )}
              {effectiveCategory === 'Equipment' && (
                <select className="gb-input cx-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="">All categories</option>
                  {EQUIPMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
              {effectiveCategory === 'Spells' && (
                <>
                  <select className="gb-input cx-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="">All levels</option>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                      <option key={lvl} value={String(lvl)}>
                        {spellLevelLabel(lvl)}
                      </option>
                    ))}
                  </select>
                  {homebrewSpells.length > 0 && (
                    <select className="gb-input cx-select" value={spellSource} onChange={(e) => setSpellSource(e.target.value as '' | 'srd' | 'homebrew')} aria-label="Spell source">
                      <option value="">SRD and homebrew</option>
                      <option value="srd">SRD only</option>
                      <option value="homebrew">Homebrew only</option>
                    </select>
                  )}
                </>
              )}
              {effectiveCategory === 'Homebrew' && (
                <>
                  <select className="gb-input cx-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="">All kinds</option>
                    {WORKSHOP_SECTIONS.filter((sec) => homebrew.some((e) => e.kind === sec.kind)).map((sec) => (
                      <option key={sec.kind} value={sec.kind}>
                        {sec.label}
                      </option>
                    ))}
                  </select>
                  {activePacks.length > 1 && (
                    <select className="gb-input cx-select" value={packFilter} onChange={(e) => setPackFilter(e.target.value)}>
                      <option value="">All packs</option>
                      {activePacks.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
              {effectiveCategory === 'Magic Items' && (
                <select className="gb-input cx-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="">All rarities</option>
                  {rarityOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
              <div className="cx-count">
                {effectiveCategory === 'Monsters' && `${filteredMonsters.length} monster${filteredMonsters.length === 1 ? '' : 's'}`}
                {effectiveCategory === 'NPCs' && `${filteredNpcs.length} NPC${filteredNpcs.length === 1 ? '' : 's'}`}
                {effectiveCategory === 'Equipment' && `${filteredEquipment.length} item${filteredEquipment.length === 1 ? '' : 's'}`}
                {effectiveCategory === 'Spells' && `${filteredSpells.length + filteredHomebrewSpells.length} spell${filteredSpells.length + filteredHomebrewSpells.length === 1 ? '' : 's'}`}
                {effectiveCategory === 'Magic Items' && `${filteredMagicItems.length} item${filteredMagicItems.length === 1 ? '' : 's'}`}
                {effectiveCategory === 'Playing the Game' && `${filteredTopics.length} topic${filteredTopics.length === 1 ? '' : 's'}`}
                {effectiveCategory === 'Homebrew' && `${filteredHomebrew.length} entr${filteredHomebrew.length === 1 ? 'y' : 'ies'}`}
              </div>
              {effectiveCategory === 'Monsters' && localMonsterCount > 0 && (
                <div className="cx-notice">
                  {localMonsterCount} custom creature{localMonsterCount === 1 ? ' is' : 's are'} saved only on this device. Move {localMonsterCount === 1 ? 'it' : 'them'} into your My Creatures pack to edit in the Workshop, export and share.
                  <button type="button" className="gb-btn gb-btn--secondary cx-small" disabled={movingMonsters} onClick={() => void moveLocalMonsters()}>
                    {movingMonsters ? 'Moving…' : 'Move to My Creatures'}
                  </button>
                </div>
              )}
              {effectiveCategory === 'Monsters' && monsterNotice && <div className="cx-count">{monsterNotice}</div>}
            </div>

            <div className="cx-rows">
              {effectiveCategory === 'Monsters' &&
                filteredMonsters.map((m) => {
                  const active = selectedMonster?.index === m.index
                  const local = isCustomMonster(m.index)
                  const personal = m.packId === PERSONAL_MONSTER_PACK_ID
                  const custom = local || personal
                  return (
                    <div key={m.index} className={active ? 'cx-row-wrap cx-row-wrap--on' : 'cx-row-wrap'}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIndex(m.index)
                          playMonsterSfx(`monster:${m.index}`, m, sessionId)
                        }}
                        className={rowClass(active)}
                      >
                        <span className="cx-row-name">
                          {m.name}
                          {local && <span className="cx-row-tag">· this device</span>}
                          {m.packName && <span className="cx-row-tag">· {m.packName}</span>}
                        </span>
                        <span className="cx-row-meta">CR {formatCr(m.crNumeric)}</span>
                      </button>
                      {custom && (
                        <button type="button" className="cx-row-delete" onClick={() => void handleDeleteCustom(m)} title="Delete this custom creature" aria-label={`Delete ${m.name}`}>
                          <XIcon size={11} />
                        </button>
                      )}
                    </div>
                  )
                })}

              {effectiveCategory === 'NPCs' &&
                filteredNpcs.map((n) => (
                  <div key={n.id} className={selectedNpc?.id === n.id ? 'cx-row-wrap cx-row-wrap--on' : 'cx-row-wrap'}>
                    <button type="button" onClick={() => setSelectedIndex(n.id)} className={rowClass(selectedNpc?.id === n.id)}>
                      <span className="cx-row-name">{n.name || 'Unnamed NPC'}</span>
                      <span className="cx-row-meta">{n.race}</span>
                    </button>
                    <button type="button" className="cx-row-delete" onClick={() => handleDeleteNpc(n.id)} title="Delete this NPC" aria-label={`Delete ${n.name || 'this NPC'}`}>
                      <XIcon size={12} />
                    </button>
                  </div>
                ))}

              {effectiveCategory === 'Equipment' &&
                filteredEquipment.map((e) => (
                  <button key={e.id} type="button" onClick={() => setSelectedIndex(e.id)} className={rowClass(selectedEquipment?.id === e.id)}>
                    <span className="cx-row-name">{e.name}</span>
                    <span className="cx-row-meta">{e.category}</span>
                  </button>
                ))}

              {effectiveCategory === 'Spells' &&
                filteredSpells.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedIndex(s.id)
                      playSpellCastSfx(`spell:${s.id}`, s.id, s.school, sessionId)
                    }}
                    className={rowClass(selectedSpell?.id === s.id)}
                  >
                    <span className="cx-row-name">{s.name}</span>
                    <span className="cx-row-meta">{spellLevelLabel(s.level)}</span>
                  </button>
                ))}
              {effectiveCategory === 'Spells' &&
                filteredHomebrewSpells.map(({ entry, level }) => (
                  <button key={entry.key} type="button" onClick={() => setSelectedIndex(entry.key)} className={rowClass(selectedHomebrew?.key === entry.key)}>
                    <span className="cx-row-name">{entry.name}</span>
                    <span className="cx-row-meta">
                      {spellLevelLabel(level)} · {entry.packName}
                    </span>
                  </button>
                ))}

              {effectiveCategory === 'Magic Items' &&
                filteredMagicItems.map((m) => (
                  <button key={m.id} type="button" onClick={() => setSelectedIndex(m.id)} className={rowClass(selectedMagicItem?.id === m.id)}>
                    <span className="cx-row-name">{m.name}</span>
                    <span className="cx-row-meta">{m.rarity}</span>
                  </button>
                ))}

              {effectiveCategory === 'Homebrew' &&
                filteredHomebrew.map((e) => (
                  <button key={e.key} type="button" onClick={() => setSelectedIndex(e.key)} className={rowClass(selectedHomebrew?.key === e.key, true)}>
                    <div className="cx-row-name">{e.name}</div>
                    <div className="cx-row-sub">
                      {e.kindLabel} · {e.packName}
                    </div>
                  </button>
                ))}

              {effectiveCategory === 'Playing the Game' &&
                filteredTopics.map((t) => (
                  <button key={t.id} type="button" onClick={() => setSelectedIndex(t.id)} className={rowClass(selectedTopic?.id === t.id, true)}>
                    <div className="cx-row-name">{t.title}</div>
                    <div className="cx-row-sub">{t.dek}</div>
                  </button>
                ))}

              {((effectiveCategory === 'Monsters' && filteredMonsters.length === 0) ||
                (effectiveCategory === 'NPCs' && filteredNpcs.length === 0) ||
                (effectiveCategory === 'Equipment' && filteredEquipment.length === 0) ||
                (effectiveCategory === 'Spells' && filteredSpells.length + filteredHomebrewSpells.length === 0) ||
                (effectiveCategory === 'Playing the Game' && filteredTopics.length === 0) ||
                (effectiveCategory === 'Homebrew' && filteredHomebrew.length === 0) ||
                (effectiveCategory === 'Magic Items' && filteredMagicItems.length === 0)) && (
                <div className="cx-none">Nothing matches{query.trim() ? ` “${query.trim()}”` : ''}.</div>
              )}
            </div>
          </div>

          <div className="cx-detail">
            {effectiveCategory === 'Monsters' && selectedMonster && (
              <div className="cx-sfx">
                <CustomSfxControl entityKey={`monster:${selectedMonster.index}`} floating />
              </div>
            )}
            {effectiveCategory === 'Spells' && selectedSpell && (
              <div className="cx-sfx">
                <CustomSfxControl entityKey={`spell:${selectedSpell.id}`} floating />
              </div>
            )}
            <div className="cx-detail-body">
              {effectiveCategory === 'Monsters' &&
                (selectedMonster ? (
                  <div onClick={(e) => rollInlineDice(e, sessionId)} dangerouslySetInnerHTML={{ __html: renderStatblockHtml(selectedMonster) }} />
                ) : (
                  <NoneSelected />
                ))}
              {effectiveCategory === 'NPCs' &&
                (editingNpcId ? (
                  <NpcEditor draft={npcDraft} onChange={setNpcDraft} onSave={saveNpcDraft} onCancel={() => setEditingNpcId(null)} />
                ) : selectedNpc ? (
                  <NpcDetail npc={selectedNpc} onEdit={() => startEditNpc(selectedNpc)} />
                ) : (
                  <NoneSelected />
                ))}
              {effectiveCategory === 'Equipment' && (selectedEquipment ? <EquipmentDetail item={selectedEquipment} /> : <NoneSelected />)}
              {effectiveCategory === 'Spells' && (selectedSpell ? <SpellDetail spell={selectedSpell} /> : selectedHomebrew ? <HomebrewDetail entry={selectedHomebrew} /> : <NoneSelected />)}
              {effectiveCategory === 'Magic Items' && (selectedMagicItem ? <MagicItemDetail item={selectedMagicItem} /> : <NoneSelected />)}
              {effectiveCategory === 'Playing the Game' && (selectedTopic ? <RuleTopicDetail topic={selectedTopic} /> : <NoneSelected />)}
              {effectiveCategory === 'Homebrew' && (selectedHomebrew ? <HomebrewDetail entry={selectedHomebrew} /> : <NoneSelected />)}
            </div>
            {!onPick && (() => {
              const entry: CanvasEntry | null =
                effectiveCategory === 'Monsters' && selectedMonster
                  ? { kind: 'monster', monster: selectedMonster }
                  : effectiveCategory === 'NPCs' && selectedNpc && !editingNpcId
                    ? { kind: 'npc', id: selectedNpc.id, name: selectedNpc.name }
                    : effectiveCategory === 'Equipment' && selectedEquipment
                      ? { kind: 'equipment', id: selectedEquipment.id, name: selectedEquipment.name }
                      : effectiveCategory === 'Spells' && selectedSpell
                        ? { kind: 'spell', id: selectedSpell.id, name: selectedSpell.name }
                        : effectiveCategory === 'Magic Items' && selectedMagicItem
                          ? { kind: 'magicItem', id: selectedMagicItem.id, name: selectedMagicItem.name }
                          : (effectiveCategory === 'Homebrew' || effectiveCategory === 'Spells') && selectedHomebrew
                            ? { kind: 'homebrew', id: selectedHomebrew.key, name: selectedHomebrew.name }
                            : null
              const editable = effectiveCategory === 'Monsters' && selectedMonster
              return (
                ((entry && onAddToCanvas) || editable) && (
                  <div className="cx-actions">
                    {editable && (
                      <button
                        type="button"
                        className="gb-btn gb-btn--ghost"
                        onClick={() => setEditingMonster(selectedMonster as PackMonster)}
                        title={editsInPlace(selectedMonster as PackMonster) ? 'Change this creature' : 'Change it as your own copy, in My Creatures'}
                      >
                        <PencilIcon size={13} />
                        {editsInPlace(selectedMonster as PackMonster) ? 'Edit' : 'Edit a copy'}
                      </button>
                    )}
                    {entry && onAddToCanvas && (
                      <button type="button" className="gb-btn gb-btn--secondary" onClick={() => onAddToCanvas(entry)} title="Give it a box of its own on the canvas">
                        <PlusIcon size={12} />
                        Add to canvas
                      </button>
                    )}
                  </div>
                )
              )
            })()}
            {onPick && selectedMonster && (
              <div className="cx-actions">
                <button type="button" className="gb-btn gb-btn--primary cx-insert" onClick={() => onPick(selectedMonster)}>
                  Insert {selectedMonster.name}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
  )

  const withEditor = (
    <>
      {browser}
      {editingMonster && (
        <MonsterEditor
          monster={editingMonster}
          onClose={() => setEditingMonster(null)}
          onSaved={(saved) => {
            setEditingMonster(null)
            refreshMonsters()
            setSelectedIndex(saved.index)
          }}
        />
      )}
    </>
  )

  if (embedded) return withEditor
  // Portaled: a note box on the zoomed workspace canvas can open this too.
  return createPortal(
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 17, 12, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      {withEditor}
    </div>,
    popupLayer()
  )
}

function NoneSelected(): JSX.Element {
  return (
    <div className="cx-empty">
      <BookIcon />
      <span>Pick something from the list to read it here.</span>
    </div>
  )
}

function SearchIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  )
}

function BookIcon(): JSX.Element {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
      <path d="M8 7h8M8 10.5h6" />
    </svg>
  )
}

/**
 * "+ Add custom SFX" / the current override's name plus Change/Remove —
 * shown on both a Spell's and a Monster's detail pane. `entityKey` is
 * `spell:<compendiumId>` or `monster:<bestiary index>` (see the row click
 * handlers above and sfxBoardEngine.ts's playSpellCastSfx/playMonsterSfx,
 * which check this same key before falling back to the auto-picked cue).
 * Local-only — see main/customEntitySfx.ts's own doc comment for why this
 * never broadcasts, unlike everything else in the Sound Board system.
 * `floating` renders it as its own small card (used pinned to the top-right
 * corner of the detail pane, above the scrolling content, so it stays
 * reachable no matter how far down a long stat block or spell description
 * is scrolled) instead of the plain inline row a non-floating placement
 * would use.
 */
function CustomSfxControl({ entityKey, floating }: { entityKey: string; floating?: boolean }): JSX.Element {
  const [, setTick] = useState(0)
  useEffect(() => subscribeCustomEntitySfx(() => setTick((t) => t + 1)), [])
  const title = getCustomEntitySfxTitle(entityKey)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        ...(floating
          ? {
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-sm, 0 2px 6px rgba(0,0,0,0.15))',
              padding: '5px 8px',
              maxWidth: 220
            }
          : {
              marginTop: 'var(--space-3)',
              paddingTop: 'var(--space-2)',
              borderTop: '1px solid var(--border-subtle)'
            })
      }}
    >
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{floating ? 'SFX:' : 'Custom SFX:'}</span>
      {title ? (
        <>
          <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          <button
            type="button"
            className="gb-btn gb-btn--secondary"
            style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
            onClick={() => void setCustomEntitySfx(entityKey)}
          >
            Change
          </button>
          <button
            type="button"
            className="gb-btn gb-btn--secondary"
            style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
            onClick={() => void removeCustomEntitySfx(entityKey)}
          >
            Remove
          </button>
        </>
      ) : (
        <button
          type="button"
          className="gb-btn gb-btn--secondary"
          style={{ fontSize: 11, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onClick={() => void setCustomEntitySfx(entityKey)}
        >
          <PlusIcon size={10} />
          Add custom SFX
        </button>
      )}
    </div>
  )
}

function DetailHeader({ name, subtitle }: { name: string; subtitle: string }): JSX.Element {
  return (
    <div className="cx-detail-head">
      <h2>{name}</h2>
      <p>{subtitle}</p>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="cx-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

/**
 * One Codex entry on its own, for its canvas box: an NPC, a piece of
 * equipment, a spell or a magic item, looked up fresh (an NPC you've edited
 * since shows its latest). Says so if it's gone.
 */
/** A content pack's entry on the canvas, read from the packs active now (it says so if its pack isn't). */
function HomebrewEntryView({ entryKey }: { entryKey: string }): JSX.Element {
  const { packs, registry } = useActivePackRegistry()
  const entry = useMemo(() => codexEntries(registry, packs).find((e) => e.key === entryKey), [registry, packs, entryKey])
  return (
    <div style={{ overflowY: 'auto', padding: 'var(--space-4)' }}>
      {entry ? <HomebrewDetail entry={entry} /> : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>This homebrew isn’t in an active content pack right now.</div>}
    </div>
  )
}

export function CodexEntryView({ kind, id }: { kind: CodexEntryKind; id: string }): JSX.Element {
  if (kind === 'homebrew') return <HomebrewEntryView entryKey={id} />
  const npc = kind === 'npc' ? loadNpcs().find((n) => n.id === id) : undefined
  const equipment = kind === 'equipment' ? EQUIPMENT.find((e) => e.id === id) : undefined
  const spell = kind === 'spell' ? SPELLS.find((s) => s.id === id) : undefined
  const magicItem = kind === 'magicItem' ? MAGIC_ITEMS.find((m) => m.id === id) : undefined
  return (
    <div style={{ overflowY: 'auto', padding: 'var(--space-4)' }}>
      {npc ? (
        <NpcDetail npc={npc} />
      ) : equipment ? (
        <EquipmentDetail item={equipment} />
      ) : spell ? (
        <SpellDetail spell={spell} />
      ) : magicItem ? (
        <MagicItemDetail item={magicItem} />
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>This entry isn’t in the Codex any more.</div>
      )}
    </div>
  )
}

function NpcDetail({ npc, onEdit }: { npc: Npc; onEdit?: () => void }): JSX.Element {
  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <div
          style={{
            width: 64,
            height: 64,
            flexShrink: 0,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface-raised)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {npc.portraitDataUrl ? (
            <img src={npc.portraitDataUrl} alt={npc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 22, color: 'var(--text-muted)' }}>?</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DetailHeader name={npc.name || 'Unnamed NPC'} subtitle={[npc.race, npc.occupation].filter(Boolean).join(' · ')} />
        </div>
        {onEdit && (
          <button type="button" className="gb-btn gb-btn--secondary" onClick={onEdit} style={{ fontSize: 12, flexShrink: 0 }}>
            Edit
          </button>
        )}
      </div>
      {npc.notes && <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 'var(--space-3)', whiteSpace: 'pre-wrap' }}>{npc.notes}</p>}
    </div>
  )
}

const NPC_PORTRAIT_MAX_DIMENSION = 256

function readNpcPortraitFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not read image.'))
      img.onload = () => {
        const scale = Math.min(1, NPC_PORTRAIT_MAX_DIMENSION / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas unavailable.'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

function NpcEditor({
  draft,
  onChange,
  onSave,
  onCancel
}: {
  draft: Omit<Npc, 'id' | 'createdAt'>
  onChange: (draft: Omit<Npc, 'id' | 'createdAt'>) => void
  onSave: () => void
  onCancel: () => void
}): JSX.Element {
  function patch(fields: Partial<Omit<Npc, 'id' | 'createdAt'>>): void {
    onChange({ ...draft, ...fields })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: 420 }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <label
          title="Click to upload a portrait"
          style={{
            width: 64,
            height: 64,
            flexShrink: 0,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface-raised)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          {draft.portraitDataUrl ? (
            <img src={draft.portraitDataUrl} alt="Portrait" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 22, color: 'var(--text-muted)' }}>?</span>
          )}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void readNpcPortraitFile(file).then((dataUrl) => patch({ portraitDataUrl: dataUrl }))
              e.target.value = ''
            }}
          />
        </label>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              className="gb-input"
              placeholder="Name"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              style={{ flex: 1, fontSize: 13 }}
            />
            <button
              type="button"
              className="gb-btn gb-btn--secondary"
              title="Generate a name for this race"
              onClick={() => patch({ name: generateNpcName(draft.race) })}
              style={{ fontSize: 12, flexShrink: 0 }}
            >
              Random
            </button>
          </div>
          <select className="gb-input cx-select" value={draft.race} onChange={(e) => patch({ race: e.target.value })}>
            {RACES.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            className="gb-input"
            placeholder="Occupation / role"
            value={draft.occupation}
            onChange={(e) => patch({ occupation: e.target.value })}
            style={{ fontSize: 13 }}
          />
        </div>
      </div>

      <textarea
        className="gb-input"
        placeholder="Personality, voice, hooks, anything worth remembering…"
        value={draft.notes}
        onChange={(e) => patch({ notes: e.target.value })}
        rows={8}
        style={{ fontSize: 13, resize: 'vertical' }}
      />

      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="gb-btn gb-btn--primary" onClick={onSave}>
          Save
        </button>
        <button type="button" className="gb-btn gb-btn--secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function EquipmentDetail({ item }: { item: CompendiumEquipment }): JSX.Element {
  return (
    <div>
      <DetailHeader name={item.name} subtitle={item.category} />
      <DetailField label="Cost" value={item.cost} />
      {item.weight != null && <DetailField label="Weight" value={`${item.weight} lb.`} />}
      {item.category === 'Weapon' && (
        <>
          <DetailField label="Type" value={`${item.weaponCategory ?? ''} ${item.weaponRange ?? ''}`.trim()} />
          {item.damageDice && <DetailField label="Damage" value={`${item.damageDice} ${item.damageType ?? ''}`.trim()} />}
          {item.normalRange && (
            <DetailField label="Range" value={item.longRange ? `${item.normalRange}/${item.longRange} ft.` : `${item.normalRange} ft.`} />
          )}
          {item.properties?.length ? <DetailField label="Properties" value={item.properties.join(', ')} /> : null}
        </>
      )}
      {item.category === 'Armor' && (
        <>
          <DetailField
            label="Armor Class"
            value={item.armorClassDexBonus ? `${item.armorClassBase} + Dex modifier${item.armorClassMaxBonus != null ? ` (max ${item.armorClassMaxBonus})` : ''}` : `${item.armorClassBase}`}
          />
          <DetailField label="Category" value={item.armorCategory ?? ''} />
          {item.strMinimum ? <DetailField label="Str Minimum" value={String(item.strMinimum)} /> : null}
          {item.stealthDisadvantage ? <DetailField label="Stealth" value="Disadvantage" /> : null}
        </>
      )}
      {item.description && <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 'var(--space-3)', whiteSpace: 'pre-wrap' }}>{item.description}</p>}
    </div>
  )
}

function SpellDetail({ spell }: { spell: CompendiumSpell }): JSX.Element {
  return (
    <div>
      <DetailHeader name={spell.name} subtitle={`${spellLevelLabel(spell.level)} ${spell.school}${spell.ritual ? ' (ritual)' : ''}`} />
      <DetailField label="Casting Time" value={spell.castingTime} />
      <DetailField label="Range" value={spell.range} />
      <DetailField label="Components" value={spell.components} />
      <DetailField label="Duration" value={`${spell.concentration ? 'Concentration, ' : ''}${spell.duration}`} />
      <DetailField label="Classes" value={spell.classes.join(', ')} />
      <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 'var(--space-3)', whiteSpace: 'pre-wrap' }}>{spell.description}</p>
      {spell.higherLevel && (
        <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 'var(--space-2)' }}>
          <strong>At Higher Levels. </strong>
          {spell.higherLevel}
        </p>
      )}
    </div>
  )
}

function MagicItemDetail({ item }: { item: CompendiumMagicItem }): JSX.Element {
  return (
    <div>
      <DetailHeader name={item.name} subtitle={`${item.category} · ${item.rarity}`} />
      <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 'var(--space-3)', whiteSpace: 'pre-wrap' }}>{item.description}</p>
    </div>
  )
}

/** A "Playing the Game" topic's full rules text — sections with a heading render it as a subheading, a section with none (a topic's opening paragraphs) just runs straight into the body. A body line starting with "- " renders as its own bullet instead of a paragraph, so a topic can mix prose and a quick-reference list (see e.g. Ability Checks' DC table). */
function RuleTopicDetail({ topic }: { topic: RuleTopic }): JSX.Element {
  return (
    <div>
      <DetailHeader name={topic.title} subtitle={topic.dek} />
      {topic.sections.map((section, i) => {
        const bullets = section.body.filter((line) => line.startsWith('- '))
        const paragraphs = section.body.filter((line) => !line.startsWith('- '))
        return (
          <div key={i} style={{ marginTop: i === 0 ? 0 : 'var(--space-3)' }}>
            {section.heading && (
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                {section.heading}
              </div>
            )}
            {paragraphs.map((p, j) => (
              <p key={j} style={{ fontSize: 13, lineHeight: 1.6, margin: j === 0 ? 0 : '6px 0 0' }}>
                {p}
              </p>
            ))}
            {bullets.length > 0 && (
              <ul style={{ fontSize: 13, lineHeight: 1.6, margin: paragraphs.length ? '6px 0 0' : 0, paddingLeft: 20 }}>
                {bullets.map((b, j) => (
                  <li key={j}>{b.slice(2)}</li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function rowClass(active: boolean, twoLine = false): string {
  return ['cx-row', twoLine && 'cx-row--two', active && 'cx-row--on'].filter(Boolean).join(' ')
}
