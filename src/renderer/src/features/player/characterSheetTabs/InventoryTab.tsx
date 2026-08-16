import { useState, type CSSProperties, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { CharacterSheetData, Currency, EquipmentItem } from '@shared/dnd5e'
import {
  EQUIPMENT,
  getEquipmentById,
  getMagicItemById,
  searchEquipment,
  searchMagicItems,
  type CompendiumEquipment,
  type CompendiumMagicItem,
  type EquipmentCategory
} from '@shared/compendium'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { CompendiumPicker } from '../CompendiumPicker'
import type { DetailField } from '../CompendiumDetailModal'
import { HoverDetailCard } from '../HoverDetailCard'
import { EntryCard } from '../EntryCard'
import { CustomItemForm } from '../CustomItemForm'
import { Button } from '../../../ui/Button'

interface InventoryDraft {
  currency: Currency
  equipment: EquipmentItem[]
}

interface InventoryTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
}

const EQUIPMENT_CATEGORIES: EquipmentCategory[] = ['Weapon', 'Armor', 'Adventuring Gear', 'Tools', 'Mounts and Vehicles']
const MAGIC_ITEM_FILTER = 'Magic Item'

const CURRENCIES: { id: keyof Currency; label: string }[] = [
  { id: 'cp', label: 'CP' },
  { id: 'sp', label: 'SP' },
  { id: 'ep', label: 'EP' },
  { id: 'gp', label: 'GP' },
  { id: 'pp', label: 'PP' }
]

function equipmentDetailFields(e: CompendiumEquipment): DetailField[] {
  const fields: DetailField[] = [{ label: 'Cost', value: e.cost }]
  if (e.weight != null) fields.push({ label: 'Weight', value: `${e.weight} lb.` })
  if (e.category === 'Weapon') {
    fields.push({ label: 'Category', value: `${e.weaponCategory ?? ''} ${e.weaponRange ?? ''}`.trim() })
    if (e.damageDice) fields.push({ label: 'Damage', value: `${e.damageDice} ${e.damageType ?? ''}`.trim() })
    if (e.properties?.length) fields.push({ label: 'Properties', value: e.properties.join(', ') })
  } else if (e.category === 'Armor') {
    const ac = e.armorClassDexBonus
      ? `${e.armorClassBase} + Dex modifier${e.armorClassMaxBonus != null ? ` (max ${e.armorClassMaxBonus})` : ''}`
      : `${e.armorClassBase}`
    fields.push({ label: 'Armor Class', value: ac }, { label: 'Category', value: e.armorCategory ?? '' })
    if (e.strMinimum) fields.push({ label: 'Str Minimum', value: String(e.strMinimum) })
    if (e.stealthDisadvantage) fields.push({ label: 'Stealth', value: 'Disadvantage' })
  }
  return fields
}

/** Same shape as equipmentDetailFields, but reading a custom item's own stored fields (filled in via CustomItemForm). */
function customItemFields(item: EquipmentItem): DetailField[] {
  const fields: DetailField[] = []
  if (item.category) fields.push({ label: 'Category', value: item.category })
  if (item.cost) fields.push({ label: 'Cost', value: item.cost })
  fields.push({ label: 'Weight', value: `${item.weight} lb.` })
  return fields
}

export function InventoryTab({ character, onSave }: InventoryTabProps): JSX.Element {
  const [draft, setDraft] = useAutosaveDraft<InventoryDraft>(
    { currency: character.currency, equipment: character.equipment },
    onSave
  )
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<EquipmentItem | null>(null)
  const [listSearch, setListSearch] = useState('')
  const [listCategoryFilter, setListCategoryFilter] = useState<'all' | EquipmentCategory | typeof MAGIC_ITEM_FILTER>('all')
  const [pickerCategoryFilter, setPickerCategoryFilter] = useState<'all' | EquipmentCategory>('all')

  function patch(fields: Partial<InventoryDraft>): void {
    setDraft((prev) => ({ ...prev, ...fields }))
  }

  function updateItem(id: string, fields: Partial<EquipmentItem>): void {
    patch({ equipment: draft.equipment.map((item) => (item.id === id ? { ...item, ...fields } : item)) })
  }

  function addFromCompendium(item: CompendiumEquipment): void {
    patch({
      equipment: [
        ...draft.equipment,
        { id: crypto.randomUUID(), name: item.name, quantity: 1, weight: item.weight ?? 0, notes: '', compendiumId: item.id }
      ]
    })
  }

  function addMagicItemFromCompendium(item: CompendiumMagicItem): void {
    patch({
      equipment: [...draft.equipment, { id: crypto.randomUUID(), name: item.name, quantity: 1, weight: 0, notes: '', magicItemId: item.id }]
    })
  }

  function openCreateForm(): void {
    setEditingItem(null)
    setFormOpen(true)
  }

  function openEditForm(item: EquipmentItem): void {
    setEditingItem(item)
    setFormOpen(true)
  }

  function handleFormSave(fields: Omit<EquipmentItem, 'id' | 'compendiumId' | 'magicItemId'>): void {
    if (editingItem) updateItem(editingItem.id, fields)
    else patch({ equipment: [...draft.equipment, { id: crypto.randomUUID(), ...fields }] })
    setFormOpen(false)
    setEditingItem(null)
  }

  const visibleEquipment = draft.equipment.filter((item) => {
    if (listSearch.trim() !== '' && !item.name.toLowerCase().includes(listSearch.trim().toLowerCase())) return false
    if (listCategoryFilter === 'all') return true
    if (listCategoryFilter === MAGIC_ITEM_FILTER) return !!item.magicItemId
    const compendium = item.compendiumId ? getEquipmentById(item.compendiumId) : undefined
    return compendium?.category === listCategoryFilter
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {formOpen && (
        <CustomItemForm initial={editingItem ?? undefined} onSave={handleFormSave} onClose={() => setFormOpen(false)} />
      )}

      <div>
        <div className="gb-label">Currency</div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {CURRENCIES.map(({ id, label }) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{label}</span>
              <input
                type="number"
                min={0}
                className="gb-input"
                style={{ width: 56, padding: '4px 6px', fontSize: 13 }}
                value={draft.currency[id]}
                onChange={(e) => patch({ currency: { ...draft.currency, [id]: Number(e.target.value) } })}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div className="gb-label" style={{ margin: 0 }}>
            Equipment
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="gb-input"
              placeholder="Search…"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
            />
            <select
              className="gb-input"
              style={{ fontSize: 12, padding: '4px 8px' }}
              value={listCategoryFilter}
              onChange={(e) => setListCategoryFilter(e.target.value as 'all' | EquipmentCategory)}
            >
              <option value="all">All Categories</option>
              {EQUIPMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={MAGIC_ITEM_FILTER}>{MAGIC_ITEM_FILTER}</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {visibleEquipment.map((item) => {
            const compendium = item.compendiumId ? getEquipmentById(item.compendiumId) : undefined
            const magicItem = item.magicItemId ? getMagicItemById(item.magicItemId) : undefined
            return (
              <HoverDetailCard
                key={item.id}
                title={compendium?.name ?? magicItem?.name ?? (item.name || 'Untitled Item')}
                subtitle={compendium?.category ?? (magicItem ? `${magicItem.category} · ${magicItem.rarity}` : item.category)}
                fields={compendium ? equipmentDetailFields(compendium) : magicItem ? [] : customItemFields(item)}
                description={compendium?.description ?? magicItem?.description ?? item.notes}
              >
                <EntryCard
                  name={<LockedValue value={compendium?.name ?? magicItem?.name ?? item.name} />}
                  badge={
                    compendium ? (
                      <span className="gb-badge">{compendium.category}</span>
                    ) : magicItem ? (
                      <span className="gb-badge gb-badge--accent">{magicItem.rarity}</span>
                    ) : item.category ? (
                      <span className="gb-badge">{item.category}</span>
                    ) : undefined
                  }
                  onEdit={compendium || magicItem ? undefined : () => openEditForm(item)}
                  onRemove={() => patch({ equipment: draft.equipment.filter((i) => i.id !== item.id) })}
                >
                  <Field label="Qty">
                    <input
                      type="number"
                      min={0}
                      className="gb-input"
                      style={{ width: 60 }}
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })}
                    />
                  </Field>
                  {!magicItem && (
                    <Field label="Weight">
                      <LockedValue value={`${item.weight} lb.`} />
                    </Field>
                  )}
                  {(compendium?.cost || item.cost) && <Field label="Cost">{compendium?.cost ?? item.cost}</Field>}
                  {compendium?.category === 'Armor' && (
                    <Button
                      variant={item.equipped ? 'primary' : 'secondary'}
                      onClick={() => updateItem(item.id, { equipped: !item.equipped })}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      title="Equipped armor/shields feed into your AC"
                    >
                      {item.equipped ? 'Equipped' : 'Equip'}
                    </Button>
                  )}
                </EntryCard>
              </HoverDetailCard>
            )
          })}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <CompendiumPicker
            search={(q) => searchEquipment(pickerCategoryFilter === 'all' ? EQUIPMENT : EQUIPMENT.filter((e) => e.category === pickerCategoryFilter), q)}
            getLabel={(e: CompendiumEquipment) => e.name}
            getSublabel={(e: CompendiumEquipment) => e.category}
            onPick={addFromCompendium}
            onAddCustom={openCreateForm}
            buttonLabel="+ Add Item"
            searchPlaceholder="Search SRD equipment…"
            filters={
              <select
                className="gb-input"
                style={{ fontSize: 12 }}
                value={pickerCategoryFilter}
                onChange={(e) => setPickerCategoryFilter(e.target.value as 'all' | EquipmentCategory)}
              >
                <option value="all">All Categories</option>
                {EQUIPMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            }
          />
          <CompendiumPicker
            search={(q) => searchMagicItems(q)}
            getLabel={(m: CompendiumMagicItem) => m.name}
            getSublabel={(m: CompendiumMagicItem) => `${m.category} · ${m.rarity}`}
            onPick={addMagicItemFromCompendium}
            onAddCustom={openCreateForm}
            buttonLabel="+ Add Magic Item"
            searchPlaceholder="Search SRD magic items…"
          />
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </div>
  )
}

/** Read-only stand-in for an input — item names/costs/weights are now set via CustomItemForm (custom) or the SRD data (compendium/magic-item-linked), not typed inline. */
function LockedValue({ value }: { value: string }): JSX.Element {
  return <div style={lockedValueStyle}>{value || '—'}</div>
}

const lockedValueStyle: CSSProperties = {
  padding: '7px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-sunken)',
  color: 'var(--text-secondary)',
  fontSize: 14
}
