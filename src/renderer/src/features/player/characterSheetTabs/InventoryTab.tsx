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
import { deriveSheet } from '@shared/content/sheet'
import { SRD_PACK_ID } from '@shared/content/srd'
import type { ItemDef } from '@shared/content/schema'
import { useDerivedSheet } from '../useDerivedSheet'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { CompendiumPicker } from '../CompendiumPicker'
import type { DetailField } from '../CompendiumDetailModal'
import { HoverDetailCard } from '../HoverDetailCard'
import { EntryCard, EntryCardTitle } from '../EntryCard'
import { CustomItemForm } from '../CustomItemForm'
import { ChoiceList, useChoiceEditor } from '../ChoiceCards'
import { Button } from '../../../ui/Button'

interface InventoryDraft {
  currency: Currency
  equipment: EquipmentItem[]
}

interface InventoryTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
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

/** The most magic items a character can be attuned to at once. */
const MAX_ATTUNED = 3

export function InventoryTab({ character, onSave, readOnly }: InventoryTabProps): JSX.Element {
  const [draft, setDraft] = useAutosaveDraft<InventoryDraft>(
    { currency: character.currency, equipment: character.equipment },
    onSave,
    readOnly
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

  // The active packs' items, offered in their own picker (the SRD lists stay as they were).
  const { registry, derived } = useDerivedSheet(character)
  const setPicks = useChoiceEditor(character, onSave)
  const packItems = registry.all('items').filter((i) => i.packId !== SRD_PACK_ID)
  const packCurrencies = registry.vocabulary.currencies.filter((c) => !CURRENCIES.some((s) => s.id === c.id))
  // SRD magic items are pack items too, so they get the same Equip button and effects.
  const packItemFor = (item: EquipmentItem): ItemDef | undefined => {
    const id = item.packItemId ?? item.magicItemId
    return id ? registry.get('items', id)?.def : undefined
  }
  // Pack items and SRD magic items both say whether they need attunement.
  const needsAttunement = (item: EquipmentItem): boolean => {
    const id = item.packItemId ?? item.magicItemId
    return !!id && !!registry.get('items', id)?.def.requiresAttunement
  }
  const attunedCount = draft.equipment.filter((i) => i.attuned && needsAttunement(i)).length

  function addPackItem(item: (typeof packItems)[number]): void {
    patch({
      equipment: [
        ...draft.equipment,
        { id: crypto.randomUUID(), name: item.def.name, quantity: 1, weight: item.def.weight ?? 0, notes: '', category: item.def.category, ...(item.def.cost ? { cost: item.def.cost } : {}), packItemId: item.fullId }
      ]
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

  const totalWeight = draft.equipment.reduce((sum, item) => sum + item.weight * item.quantity, 0)
  // SRD carrying capacity (Strength score × 15 lb.), from the content engine — so anything that changes it applies here.
  const carryCapacity = deriveSheet(character).derived.carryingCapacity
  const encumbered = totalWeight > carryCapacity

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {formOpen && (
        <CustomItemForm initial={editingItem ?? undefined} onSave={handleFormSave} onClose={() => setFormOpen(false)} />
      )}

      <div>
        <div className="gb-label">Carrying Weight</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: encumbered ? 'var(--danger)' : 'var(--text-primary)' }}>
            {totalWeight} / {carryCapacity} lb.
          </span>
          {encumbered && (
            <span className="gb-badge" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} title="Over your Strength score × 15 lb. carrying capacity">
              Encumbered
            </span>
          )}
          {attunedCount > 0 && (
            <span
              className="gb-badge"
              style={attunedCount > MAX_ATTUNED ? { color: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}
              title={attunedCount > MAX_ATTUNED ? `A character can only be attuned to ${MAX_ATTUNED} items at once.` : 'Magic items you’re attuned to (up to 3)'}
            >
              Attuned: {attunedCount} / {MAX_ATTUNED}
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="gb-label">Currency</div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {CURRENCIES.map(({ id, label }) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }} title={registry.vocabulary.currencies.find((c) => c.id === id)?.name}>
                {registry.terminology[`currency.${id}`] ?? label}
              </span>
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
          {/* Currencies the active packs add (vocabulary.currencies beyond the SRD's five), stored in packCurrency. */}
          {packCurrencies.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }} title={`Worth ${c.valueInBase} base coin${c.valueInBase === 1 ? '' : 's'}`}>
                {registry.terminology[`currency.${c.id}`] ?? c.name}
              </span>
              <input
                type="number"
                min={0}
                className="gb-input"
                style={{ width: 56, padding: '4px 6px', fontSize: 13 }}
                value={character.packCurrency?.[c.id] ?? 0}
                disabled={readOnly}
                onChange={(e) => onSave({ packCurrency: { ...character.packCurrency, [c.id]: Number(e.target.value) } })}
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
            const packItem = packItemFor(item)
            // A pack item can be equipped when it's a weapon or armour, or its effects apply while equipped/attuned.
            const packEquippable = !!packItem && (!!packItem.weapon || !!packItem.armor || packItem.effectsWhen !== 'carried')
            // Picks the item asks for once it's in use (which sword a +1 weapon is, a Ring of Resistance's damage type).
            const itemChoices = derived.choices.filter((c) => c.sourceKey === `item:${item.id}`)
            return (
              <HoverDetailCard
                key={item.id}
                title={compendium?.name ?? magicItem?.name ?? (item.name || 'Untitled Item')}
                subtitle={compendium?.category ?? (magicItem ? `${magicItem.category} · ${magicItem.rarity}` : item.category)}
                fields={compendium ? equipmentDetailFields(compendium) : magicItem ? [] : customItemFields(item)}
                description={compendium?.description ?? magicItem?.description ?? packItem?.description ?? item.notes}
              >
                <EntryCard
                  name={<EntryCardTitle value={compendium?.name ?? magicItem?.name ?? item.name} />}
                  badge={
                    compendium ? (
                      <span className="gb-badge">{compendium.category}</span>
                    ) : magicItem ? (
                      <span className="gb-badge gb-badge--accent">{magicItem.rarity}</span>
                    ) : packItem ? (
                      <span className="gb-badge gb-badge--accent">{packItem.rarity ?? packItem.category}</span>
                    ) : item.category ? (
                      <span className="gb-badge">{item.category}</span>
                    ) : undefined
                  }
                  onEdit={compendium || magicItem || packItem ? undefined : () => openEditForm(item)}
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
                  {(compendium?.category === 'Armor' || compendium?.category === 'Weapon') && (
                    <Button
                      variant={item.equipped ? 'primary' : 'secondary'}
                      onClick={() => updateItem(item.id, { equipped: !item.equipped })}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      title={
                        compendium.category === 'Armor'
                          ? 'Equipped armor/shields feed into your AC'
                          : 'Equipped weapons show up as attacks on the Combat tab'
                      }
                    >
                      {item.equipped ? 'Equipped' : 'Equip'}
                    </Button>
                  )}
                  {packEquippable && (
                    <Button
                      variant={item.equipped ? 'primary' : 'secondary'}
                      onClick={() => updateItem(item.id, { equipped: !item.equipped })}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      title={needsAttunement(item) ? 'Wear or hold it — it works while it’s equipped and you’re attuned to it' : 'Equipped items apply their effects, attacks and AC'}
                    >
                      {item.equipped ? 'Equipped' : 'Equip'}
                    </Button>
                  )}
                  {needsAttunement(item) && (
                    <Button
                      variant={item.attuned ? 'primary' : 'secondary'}
                      onClick={() => updateItem(item.id, { attuned: !item.attuned })}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      title={
                        item.attuned
                          ? 'Attuned — click to end the attunement'
                          : attunedCount >= MAX_ATTUNED
                            ? `You’re already attuned to ${MAX_ATTUNED} items — end one first (or attune anyway if your table allows more)`
                            : 'Attune to it (a short rest spent with the item). It needs attunement to work.'
                      }
                    >
                      {item.attuned ? 'Attuned' : 'Attune'}
                    </Button>
                  )}
                  {needsAttunement(item) && packEquippable && item.attuned !== item.equipped && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.attuned ? 'Equip it to use it' : 'Attune to use it'}</span>
                  )}
                  {itemChoices.length > 0 && (
                    <div style={{ flexBasis: '100%' }}>
                      <ChoiceList choices={itemChoices} all={derived.choices} readOnly={readOnly} onSetPicks={setPicks} />
                    </div>
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
          {packItems.length > 0 && (
            <CompendiumPicker
              search={(q) => packItems.filter((i) => i.def.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30)}
              getLabel={(i: (typeof packItems)[number]) => i.def.name}
              getSublabel={(i: (typeof packItems)[number]) => [i.def.category, i.def.rarity].filter(Boolean).join(' · ')}
              onPick={addPackItem}
              onAddCustom={openCreateForm}
              buttonLabel="+ Add Homebrew Item"
              searchPlaceholder="Search pack items…"
            />
          )}
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
