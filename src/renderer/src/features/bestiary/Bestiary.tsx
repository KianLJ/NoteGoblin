import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BESTIARY, BESTIARY_TYPES, formatCr, type BestiaryMonster } from '../../data/bestiary'
import { loadCustomMonsters, removeCustomMonster, isCustomMonster } from '../../data/customBestiary'
import { renderStatblockHtml } from '../../statblock'
import { CloseIcon } from '../campaigns/icons'
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
  onClose: () => void
  /** Present only when opened from a note's "Import from Bestiary" toolbar action — swaps the browse-only footer for an "Insert" button, restricts browsing to Monsters (the only category a note statblock can embed), and closes automatically once picked. */
  onPick?: (monster: BestiaryMonster) => void
}

type Category = 'Monsters' | 'Equipment' | 'Spells' | 'Magic Items'
const CATEGORIES: Category[] = ['Monsters', 'Equipment', 'Spells', 'Magic Items']
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
export function Bestiary({ onClose, onPick }: BestiaryProps): JSX.Element {
  const [category, setCategory] = useState<Category>('Monsters')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null)
  const [customMonsters, setCustomMonsters] = useState(() => loadCustomMonsters())

  // Opened as a note's "Import from Bestiary" picker — only a monster can become a ```statblock block, so the
  // other categories would just be dead ends here.
  const effectiveCategory: Category = onPick ? 'Monsters' : category

  const allMonsters = useMemo(() => [...customMonsters, ...BESTIARY], [customMonsters])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Filters reset whenever the category changes — a leftover "Weapon" filter would just silently hide everything
  // once you switch to Spells, which has nothing called that.
  useEffect(() => {
    setQuery('')
    setTypeFilter('')
    setSelectedIndex(null)
  }, [effectiveCategory])

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

  const filteredSpells = useMemo(() => {
    const q = query.trim().toLowerCase()
    return SPELLS.filter((s) => {
      if (typeFilter && String(s.level) !== typeFilter) return false
      if (q && !s.name.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
  }, [query, typeFilter])

  const filteredMagicItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return MAGIC_ITEMS.filter((m) => {
      if (typeFilter && m.rarity !== typeFilter) return false
      if (q && !m.name.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [query, typeFilter])

  const selectedMonster: BestiaryMonster | undefined = allMonsters.find((m) => m.index === selectedIndex) ?? filteredMonsters[0]
  const selectedEquipment: CompendiumEquipment | undefined = EQUIPMENT.find((e) => e.id === selectedIndex) ?? filteredEquipment[0]
  const selectedSpell: CompendiumSpell | undefined = SPELLS.find((s) => s.id === selectedIndex) ?? filteredSpells[0]
  const selectedMagicItem: CompendiumMagicItem | undefined = MAGIC_ITEMS.find((m) => m.id === selectedIndex) ?? filteredMagicItems[0]

  function handleDeleteCustom(index: string): void {
    removeCustomMonster(index)
    setCustomMonsters(loadCustomMonsters())
    if (selectedIndex === index) setSelectedIndex(null)
  }

  const rarityOptions = useMemo(() => [...new Set(MAGIC_ITEMS.map((m) => m.rarity))].sort(), [])

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
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
      <div
        className="gb-card"
        style={{
          width: 'calc(100vw - var(--space-6) * 2)',
          height: 'calc(100vh - var(--space-6) * 2)',
          maxWidth: 1100,
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
            gap: 'var(--space-4)'
          }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, flexShrink: 0 }}>Codex</span>
          {!onPick && (
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    background: effectiveCategory === c ? 'var(--accent-subtle)' : 'transparent',
                    color: effectiveCategory === c ? 'var(--accent-hover)' : 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: effectiveCategory === c ? 700 : 400,
                    cursor: 'pointer'
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              padding: 4,
              flexShrink: 0
            }}
          >
            <CloseIcon />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div
            style={{
              width: 280,
              flexShrink: 0,
              borderRight: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0
            }}
          >
            <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <input
                autoFocus
                className="gb-input"
                placeholder={`Search ${effectiveCategory.toLowerCase()}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ fontSize: 13 }}
              />
              {effectiveCategory === 'Monsters' && (
                <select className="gb-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ fontSize: 13 }}>
                  <option value="">All types</option>
                  {BESTIARY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {toTitleCase(t)}
                    </option>
                  ))}
                </select>
              )}
              {effectiveCategory === 'Equipment' && (
                <select className="gb-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ fontSize: 13 }}>
                  <option value="">All categories</option>
                  {EQUIPMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
              {effectiveCategory === 'Spells' && (
                <select className="gb-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ fontSize: 13 }}>
                  <option value="">All levels</option>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                    <option key={lvl} value={String(lvl)}>
                      {spellLevelLabel(lvl)}
                    </option>
                  ))}
                </select>
              )}
              {effectiveCategory === 'Magic Items' && (
                <select className="gb-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ fontSize: 13 }}>
                  <option value="">All rarities</option>
                  {rarityOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {effectiveCategory === 'Monsters' && `${filteredMonsters.length} monster${filteredMonsters.length === 1 ? '' : 's'}`}
                {effectiveCategory === 'Equipment' && `${filteredEquipment.length} item${filteredEquipment.length === 1 ? '' : 's'}`}
                {effectiveCategory === 'Spells' && `${filteredSpells.length} spell${filteredSpells.length === 1 ? '' : 's'}`}
                {effectiveCategory === 'Magic Items' && `${filteredMagicItems.length} item${filteredMagicItems.length === 1 ? '' : 's'}`}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', borderTop: '1px solid var(--border-subtle)' }}>
              {effectiveCategory === 'Monsters' &&
                filteredMonsters.map((m) => {
                  const active = selectedMonster?.index === m.index
                  const custom = isCustomMonster(m.index)
                  return (
                    <div key={m.index} style={{ display: 'flex', alignItems: 'center', background: active ? 'var(--accent-subtle)' : 'transparent' }}>
                      <button type="button" onClick={() => setSelectedIndex(m.index)} style={listRowStyle(active)}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.name}
                          {custom && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 5 }}>· custom</span>}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>CR {formatCr(m.crNumeric)}</span>
                      </button>
                      {custom && (
                        <button type="button" onClick={() => handleDeleteCustom(m.index)} title="Delete this custom creature" style={deleteBtnStyle}>
                          ×
                        </button>
                      )}
                    </div>
                  )
                })}

              {effectiveCategory === 'Equipment' &&
                filteredEquipment.map((e) => (
                  <button key={e.id} type="button" onClick={() => setSelectedIndex(e.id)} style={listRowStyle(selectedEquipment?.id === e.id)}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{e.category}</span>
                  </button>
                ))}

              {effectiveCategory === 'Spells' &&
                filteredSpells.map((s) => (
                  <button key={s.id} type="button" onClick={() => setSelectedIndex(s.id)} style={listRowStyle(selectedSpell?.id === s.id)}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{spellLevelLabel(s.level)}</span>
                  </button>
                ))}

              {effectiveCategory === 'Magic Items' &&
                filteredMagicItems.map((m) => (
                  <button key={m.id} type="button" onClick={() => setSelectedIndex(m.id)} style={listRowStyle(selectedMagicItem?.id === m.id)}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{m.rarity}</span>
                  </button>
                ))}

              {((effectiveCategory === 'Monsters' && filteredMonsters.length === 0) ||
                (effectiveCategory === 'Equipment' && filteredEquipment.length === 0) ||
                (effectiveCategory === 'Spells' && filteredSpells.length === 0) ||
                (effectiveCategory === 'Magic Items' && filteredMagicItems.length === 0)) && (
                <div style={{ padding: 'var(--space-3)', fontSize: 12, color: 'var(--text-muted)' }}>No matches.</div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-4)' }}>
              {effectiveCategory === 'Monsters' &&
                (selectedMonster ? (
                  <div dangerouslySetInnerHTML={{ __html: renderStatblockHtml(selectedMonster) }} />
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No monster selected.</div>
                ))}
              {effectiveCategory === 'Equipment' && (selectedEquipment ? <EquipmentDetail item={selectedEquipment} /> : <NoneSelected />)}
              {effectiveCategory === 'Spells' && (selectedSpell ? <SpellDetail spell={selectedSpell} /> : <NoneSelected />)}
              {effectiveCategory === 'Magic Items' && (selectedMagicItem ? <MagicItemDetail item={selectedMagicItem} /> : <NoneSelected />)}
            </div>
            {onPick && selectedMonster && (
              <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                <button type="button" className="gb-btn gb-btn--primary" onClick={() => onPick(selectedMonster)} style={{ width: '100%' }}>
                  Insert {selectedMonster.name}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function NoneSelected(): JSX.Element {
  return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nothing selected.</div>
}

function DetailHeader({ name, subtitle }: { name: string; subtitle: string }): JSX.Element {
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--accent)' }}>{name}</div>
      <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-secondary)' }}>{subtitle}</div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ fontSize: 13, marginBottom: 3 }}>
      <strong>{label}: </strong>
      <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
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

function listRowStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    width: '100%',
    minWidth: 0,
    textAlign: 'left',
    padding: '6px var(--space-3)',
    border: 'none',
    background: active ? 'var(--accent-subtle)' : 'none',
    color: active ? 'var(--accent-hover)' : 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 13
  }
}

const deleteBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 14,
  padding: '0 var(--space-2)',
  flexShrink: 0
}
