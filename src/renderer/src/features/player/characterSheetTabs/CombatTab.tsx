import { useState, type CSSProperties } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { CLASSES, formatModifier, type ActionType, type Attack, type CharacterSheetData } from '@shared/dnd5e'
import {
  WEAPONS,
  getEquipmentById,
  searchEquipment,
  suggestedAttackAbility,
  weaponAttackBonus,
  type CompendiumEquipment
} from '@shared/compendium'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { SpellsTab } from './SpellsTab'
import { CompendiumPicker } from '../CompendiumPicker'
import type { DetailField } from '../CompendiumDetailModal'
import { HoverDetailCard } from '../HoverDetailCard'
import { EntryCard } from '../EntryCard'
import { CustomWeaponForm } from '../CustomWeaponForm'

interface CombatDraft {
  attacks: Attack[]
}

interface CombatTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
}

const ACTION_TYPES: { id: ActionType; label: string }[] = [
  { id: 'action', label: 'Action' },
  { id: 'bonus', label: 'Bonus Action' },
  { id: 'reaction', label: 'Reaction' }
]

const WEAPON_DAMAGE_TYPES = Array.from(new Set(WEAPONS.map((w) => w.damageType).filter((t): t is string => !!t))).sort()

function weaponFields(weapon: CompendiumEquipment): DetailField[] {
  const fields: DetailField[] = [
    { label: 'Category', value: `${weapon.weaponCategory ?? ''} ${weapon.weaponRange ?? ''}`.trim() },
    { label: 'Cost', value: weapon.cost },
    { label: 'Damage', value: `${weapon.damageDice ?? '—'} ${weapon.damageType ?? ''}`.trim() }
  ]
  if (weapon.weight != null) fields.push({ label: 'Weight', value: `${weapon.weight} lb.` })
  if (weapon.normalRange) {
    fields.push({ label: 'Range', value: weapon.longRange ? `${weapon.normalRange}/${weapon.longRange} ft.` : `${weapon.normalRange} ft.` })
  }
  if (weapon.properties?.length) fields.push({ label: 'Properties', value: weapon.properties.join(', ') })
  return fields
}

/** Same shape as weaponFields, but reading a custom attack's own stored fields (filled in via CustomWeaponForm) instead of a compendium entry. */
function customWeaponFields(attack: Attack): DetailField[] {
  const fields: DetailField[] = []
  if (attack.weaponRange) fields.push({ label: 'Range', value: attack.weaponRange })
  if (attack.damage || attack.damageType) fields.push({ label: 'Damage', value: `${attack.damage} ${attack.damageType}`.trim() })
  if (attack.properties) fields.push({ label: 'Properties', value: attack.properties })
  return fields
}

/** AC/HP/speed/death saves/etc. now live in OverviewTab's compact header and its Saving Throws/Death Saves column — this tab is just an Attacks/Spells inner tab strip. Spells only shows up once the character is actually a caster (see isCaster below); Spells reuses the standalone SpellsTab component (it owns its own autosave draft); both inner panels stay mounted (hidden via CSS) when switching, for the same reason as the outer tab strip in CharacterSheetEditor — an in-flight debounced edit shouldn't get cancelled just because you looked at the other panel. */
export function CombatTab({ character, onSave }: CombatTabProps): JSX.Element {
  const isCaster =
    character.spellcastingAbility !== null ||
    character.classes.some((c) => CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())?.spellcastingAbility)

  const [innerTab, setInnerTab] = useState<'Attacks' | 'Spells'>('Attacks')
  const [formOpen, setFormOpen] = useState(false)
  const [editingAttack, setEditingAttack] = useState<Attack | null>(null)
  const [listSearch, setListSearch] = useState('')
  const [listDamageTypeFilter, setListDamageTypeFilter] = useState('all')
  const [pickerDamageTypeFilter, setPickerDamageTypeFilter] = useState('all')
  const [draft, setDraft] = useAutosaveDraft<CombatDraft>({ attacks: character.attacks }, onSave)

  function patch(fields: Partial<CombatDraft>): void {
    setDraft((prev) => ({ ...prev, ...fields }))
  }

  function updateAttack(id: string, fields: Partial<Attack>): void {
    patch({ attacks: draft.attacks.map((a) => (a.id === id ? { ...a, ...fields } : a)) })
  }

  function addWeaponFromCompendium(weapon: CompendiumEquipment): void {
    patch({
      attacks: [
        ...draft.attacks,
        {
          id: crypto.randomUUID(),
          name: weapon.name,
          attackAbility: suggestedAttackAbility(weapon, character.abilityScores),
          damage: weapon.damageDice ?? '',
          damageType: weapon.damageType ?? '',
          notes: '',
          actionType: 'action',
          compendiumId: weapon.id
        }
      ]
    })
  }

  function openCreateForm(): void {
    setEditingAttack(null)
    setFormOpen(true)
  }

  function openEditForm(attack: Attack): void {
    setEditingAttack(attack)
    setFormOpen(true)
  }

  function handleFormSave(fields: Omit<Attack, 'id' | 'compendiumId'>): void {
    if (editingAttack) updateAttack(editingAttack.id, fields)
    else patch({ attacks: [...draft.attacks, { id: crypto.randomUUID(), ...fields }] })
    setFormOpen(false)
    setEditingAttack(null)
  }

  const visibleAttacks = draft.attacks.filter(
    (a) =>
      (listSearch.trim() === '' || a.name.toLowerCase().includes(listSearch.trim().toLowerCase())) &&
      (listDamageTypeFilter === 'all' || a.damageType.toLowerCase() === listDamageTypeFilter.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {formOpen && (
        <CustomWeaponForm initial={editingAttack ?? undefined} onSave={handleFormSave} onClose={() => setFormOpen(false)} />
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
        <button
          type="button"
          onClick={() => setInnerTab('Attacks')}
          style={{ ...innerTabStyle, borderBottomColor: innerTab === 'Attacks' ? 'var(--accent)' : 'transparent', color: innerTab === 'Attacks' ? 'var(--text-primary)' : 'var(--text-muted)' }}
        >
          Attacks
        </button>
        {isCaster && (
          <button
            type="button"
            onClick={() => setInnerTab('Spells')}
            style={{ ...innerTabStyle, borderBottomColor: innerTab === 'Spells' ? 'var(--accent)' : 'transparent', color: innerTab === 'Spells' ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            Spells
          </button>
        )}
        {!isCaster && (
          <button
            type="button"
            className="gb-btn gb-btn--ghost"
            style={{ fontSize: 11, padding: '2px 8px', marginLeft: 'auto' }}
            onClick={() => onSave({ spellcastingAbility: 'int' })}
            title="For feats or subclasses that grant spellcasting outside a full caster class"
          >
            + Enable Spellcasting
          </button>
        )}
      </div>

      <div style={{ display: innerTab === 'Attacks' ? 'block' : 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 6 }}>
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
            value={listDamageTypeFilter}
            onChange={(e) => setListDamageTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            {WEAPON_DAMAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {visibleAttacks.map((attack) => {
            const weapon = attack.compendiumId ? getEquipmentById(attack.compendiumId) : undefined
            const ability = attack.attackAbility ?? 'str'
            const bonus = weaponAttackBonus(ability, character.abilityScores, character.classes)
            return (
              <HoverDetailCard
                key={attack.id}
                title={weapon?.name ?? (attack.name || 'Untitled Attack')}
                subtitle={weapon ? 'Weapon' : attack.weaponRange}
                fields={weapon ? weaponFields(weapon) : customWeaponFields(attack)}
                description={weapon?.description ?? attack.notes}
              >
                <EntryCard
                  name={<LockedValue value={weapon?.name ?? attack.name} />}
                  badge={
                    weapon?.damageType ? (
                      <span className="gb-badge">{weapon.damageType}</span>
                    ) : attack.damageType ? (
                      <span className="gb-badge">{attack.damageType}</span>
                    ) : undefined
                  }
                  onEdit={weapon ? undefined : () => openEditForm(attack)}
                  onRemove={() => patch({ attacks: draft.attacks.filter((a) => a.id !== attack.id) })}
                >
                  <MiniStat label="Atk" value={formatModifier(bonus)} />
                  <select
                    className="gb-input"
                    style={miniSelectStyle}
                    value={ability}
                    onChange={(e) => updateAttack(attack.id, { attackAbility: e.target.value as 'str' | 'dex' })}
                    title="Which ability governs this attack"
                  >
                    <option value="str">Str</option>
                    <option value="dex">Dex</option>
                  </select>
                  <LockedValue value={attack.damage} />
                  <select
                    className="gb-input"
                    style={miniSelectStyle}
                    value={attack.actionType ?? 'action'}
                    onChange={(e) => updateAttack(attack.id, { actionType: e.target.value as ActionType })}
                  >
                    {ACTION_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </EntryCard>
              </HoverDetailCard>
            )
          })}
        </div>
        <div style={{ marginTop: 8 }}>
          <CompendiumPicker
            search={(q) => searchEquipment(pickerDamageTypeFilter === 'all' ? WEAPONS : WEAPONS.filter((w) => w.damageType === pickerDamageTypeFilter), q)}
            getLabel={(w: CompendiumEquipment) => w.name}
            getSublabel={(w: CompendiumEquipment) => `${w.damageDice ?? ''} ${w.damageType ?? ''}`.trim()}
            onPick={addWeaponFromCompendium}
            onAddCustom={openCreateForm}
            buttonLabel="+ Add Attack"
            searchPlaceholder="Search SRD weapons…"
            filters={
              <select
                className="gb-input"
                style={{ fontSize: 12 }}
                value={pickerDamageTypeFilter}
                onChange={(e) => setPickerDamageTypeFilter(e.target.value)}
              >
                <option value="all">All Damage Types</option>
                {WEAPON_DAMAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            }
          />
        </div>
      </div>

      {isCaster && (
        <div style={{ display: innerTab === 'Spells' ? 'block' : 'none' }}>
          <SpellsTab character={character} onSave={onSave} />
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{value}</span>
    </div>
  )
}

function LockedValue({ value }: { value: string }): JSX.Element {
  return <div style={lockedValueStyle}>{value || '—'}</div>
}

const lockedValueStyle: CSSProperties = {
  padding: '5px 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-sunken)',
  color: 'var(--text-secondary)',
  fontSize: 13
}

const miniSelectStyle: CSSProperties = { width: 80, fontSize: 12 }

const innerTabStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  fontSize: 12,
  fontWeight: 700,
  padding: '0 0 6px',
  cursor: 'pointer'
}
