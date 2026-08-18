import { useState, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import {
  ABILITIES,
  formatModifier,
  preparedSpellLimit,
  spellAttackBonus,
  spellSaveDC,
  spellcasterClassNames,
  type Ability,
  type ActionType,
  type CharacterSheetData,
  type Spell
} from '@shared/dnd5e'
import {
  SPELLS,
  cantripsKnownLimit,
  effectiveAbilityScores,
  getSpellById,
  knownSpellsLimit,
  searchSpells,
  spellLevelLabel,
  spellSlotsForClasses,
  type CompendiumSpell
} from '@shared/compendium'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { CompendiumPicker } from '../CompendiumPicker'
import type { DetailField } from '../CompendiumDetailModal'
import { HoverDetailCard } from '../HoverDetailCard'
import { EntryCard, EntryCardTitle } from '../EntryCard'
import { CustomSpellForm } from '../CustomSpellForm'
import { Button } from '../../../ui/Button'

interface SpellsDraft {
  spellcastingAbility: Ability | null
  spellSlots: Record<number, { total: number; used: number }>
  spells: Spell[]
}

interface SpellsTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
}

const ACTION_TYPES: { id: ActionType; label: string }[] = [
  { id: 'action', label: 'Action' },
  { id: 'bonus', label: 'Bonus Action' },
  { id: 'reaction', label: 'Reaction' }
]

const SPELL_LEVEL_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function spellFields(compendium: ReturnType<typeof getSpellById>): DetailField[] {
  if (!compendium) return []
  const fields: DetailField[] = [
    { label: 'Casting Time', value: compendium.castingTime },
    { label: 'Range', value: compendium.range },
    { label: 'Components', value: compendium.components },
    { label: 'Duration', value: compendium.concentration ? `Concentration, ${compendium.duration}` : compendium.duration }
  ]
  if (compendium.classes.length) fields.push({ label: 'Classes', value: compendium.classes.join(', ') })
  return fields
}

/** Same shape as spellFields, but reading a custom spell's own stored fields (filled in via CustomSpellForm) instead of a compendium entry — so homebrew spells get the same rich hover card as SRD ones. */
function customSpellFields(spell: Spell): DetailField[] {
  const fields: DetailField[] = []
  if (spell.school) fields.push({ label: 'School', value: spell.school })
  if (spell.castingTime) fields.push({ label: 'Casting Time', value: spell.castingTime })
  if (spell.range) fields.push({ label: 'Range', value: spell.range })
  if (spell.components) fields.push({ label: 'Components', value: spell.components })
  if (spell.duration) fields.push({ label: 'Duration', value: spell.concentration ? `Concentration, ${spell.duration}` : spell.duration })
  return fields
}

export function SpellsTab({ character, onSave, readOnly }: SpellsTabProps): JSX.Element {
  const [draft, setDraft] = useAutosaveDraft<SpellsDraft>(
    {
      spellcastingAbility: character.spellcastingAbility,
      spellSlots: character.spellSlots,
      spells: character.spells
    },
    onSave,
    readOnly
  )
  const [formOpen, setFormOpen] = useState(false)
  const [editingSpell, setEditingSpell] = useState<Spell | null>(null)
  const [listSearch, setListSearch] = useState('')
  const [listLevelFilter, setListLevelFilter] = useState<'all' | number>('all')
  const [pickerLevelFilter, setPickerLevelFilter] = useState<'all' | number>('all')

  function patch(fields: Partial<SpellsDraft>): void {
    setDraft((prev) => ({ ...prev, ...fields }))
  }

  // Slot totals come from the official SRD progression for the character's classes — never hand-entered. Only levels that actually have slots at this level show up at all.
  const slotTotals = spellSlotsForClasses(character.classes)
  const slotLevels = Object.keys(slotTotals)
    .map(Number)
    .sort((a, b) => a - b)

  // A feat that boosts the spellcasting ability should raise DC/attack/prepared-count the same way an ASI does — see shared/compendium.ts's effectiveAbilityScores.
  const effScores = effectiveAbilityScores(character.abilityScores, character.classes, character.asiSlotChoices)

  // Prepared casters (Cleric/Druid/Wizard/Paladin) and known casters (Bard/Sorcerer/Warlock/Ranger) use different SRD rules, but from here they collapse into the same thing: a cap on how many leveled spells you can have on your list at once.
  const spellCap = preparedSpellLimit(character.classes, effScores) ?? knownSpellsLimit(character.classes)
  // Spells granted for free by a feat or subclass feature (Magic Initiate, Circle Spells) are "always prepared"
  // on top of the normal cap, not counted against it — see Spell.free in shared/dnd5e.ts.
  const leveledSpellCount = draft.spells.filter((s) => s.level > 0 && !s.free).length
  const atSpellCap = spellCap !== null && leveledSpellCount >= spellCap

  // Cantrips known is a separate cap from leveled spells — every cantrip-using class tracks the two independently.
  const cantripCap = cantripsKnownLimit(character.classes)
  const cantripCount = draft.spells.filter((s) => s.level === 0 && !s.free).length
  const atCantripCap = cantripCap !== null && cantripCount >= cantripCap

  // Spells offered in the "+ Add Spell" picker are restricted to the character's own caster class list(s) — a
  // Wizard shouldn't be casually adding Cleric spells here. Magic Initiate deliberately bypasses this via its
  // own dedicated chooser (see AsiChoosers.tsx), which grants from a fixed class list regardless of the
  // character's actual class. A character with no recognized caster class (spellcasting enabled by hand via
  // "+ Enable Spellcasting") has no class list to restrict to, so nothing is filtered for them.
  const casterClasses = spellcasterClassNames(character.classes).map((c) => c.toLowerCase())

  const knownCompendiumSpellIds = new Set(draft.spells.map((s) => s.compendiumId).filter((id): id is string => !!id))

  function setSlotUsed(level: number, used: number): void {
    const total = slotTotals[level] ?? 0
    patch({ spellSlots: { ...draft.spellSlots, [level]: { total, used: Math.max(0, Math.min(used, total)) } } })
  }

  function updateSpell(id: string, fields: Partial<Spell>): void {
    patch({ spells: draft.spells.map((s) => (s.id === id ? { ...s, ...fields } : s)) })
  }

  function castSpell(spell: Spell): void {
    if (spell.level === 0) return
    const used = draft.spellSlots[spell.level]?.used ?? 0
    const total = slotTotals[spell.level] ?? 0
    if (used >= total) return
    setSlotUsed(spell.level, used + 1)
  }

  // The highest spell level the character's classes/level actually reach —
  // 0 (cantrips only) if they have no slots at all yet.
  const maxCastableLevel = slotLevels.length > 0 ? Math.max(...slotLevels) : 0

  function addFromCompendium(spell: CompendiumSpell): void {
    if (spell.level > maxCastableLevel) return
    if (spell.level > 0 && atSpellCap) return
    if (spell.level === 0 && atCantripCap) return
    if (knownCompendiumSpellIds.has(spell.id)) return
    patch({
      spells: [
        ...draft.spells,
        { id: crypto.randomUUID(), name: spell.name, level: spell.level, description: '', actionType: 'action', compendiumId: spell.id }
      ]
    })
  }

  function openCreateForm(): void {
    setEditingSpell(null)
    setFormOpen(true)
  }

  function openEditForm(spell: Spell): void {
    setEditingSpell(spell)
    setFormOpen(true)
  }

  function handleFormSave(fields: Omit<Spell, 'id' | 'compendiumId'>): void {
    if (editingSpell) updateSpell(editingSpell.id, fields)
    else patch({ spells: [...draft.spells, { id: crypto.randomUUID(), ...fields }] })
    setFormOpen(false)
    setEditingSpell(null)
  }

  const dc = spellSaveDC(draft.spellcastingAbility, effScores, character.classes)
  const casterAttackBonus = spellAttackBonus(draft.spellcastingAbility, effScores, character.classes)

  const visibleSpells = draft.spells.filter(
    (s) =>
      (listSearch.trim() === '' || s.name.toLowerCase().includes(listSearch.trim().toLowerCase())) &&
      (listLevelFilter === 'all' || s.level === listLevelFilter)
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {formOpen && (
        <CustomSpellForm
          initial={editingSpell ?? undefined}
          maxLevel={maxCastableLevel}
          onSave={handleFormSave}
          onClose={() => setFormOpen(false)}
        />
      )}

      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Spellcasting Ability">
          <select
            className="gb-input"
            value={draft.spellcastingAbility ?? ''}
            onChange={(e) => patch({ spellcastingAbility: (e.target.value || null) as Ability | null })}
          >
            <option value="">Not a spellcaster</option>
            {ABILITIES.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {draft.spellcastingAbility && (
          <>
            <Stat label="Spell Save DC" value={String(dc)} />
            <Stat label="Spell Attack Bonus" value={formatModifier(casterAttackBonus ?? 0)} />
          </>
        )}
        {spellCap !== null && <Stat label="Spells Known" value={`${leveledSpellCount} / ${spellCap}`} />}
        {cantripCap !== null && <Stat label="Cantrips Known" value={`${cantripCount} / ${cantripCap}`} />}
      </div>

      {slotLevels.length > 0 && (
        <div>
          <div className="gb-label">Spell Slots</div>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {slotLevels.map((level) => {
              const total = slotTotals[level]
              const used = Math.min(draft.spellSlots[level]?.used ?? 0, total)
              return (
                <div key={level} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Lv {level}</div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {Array.from({ length: total }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSlotUsed(level, i < used ? i : i + 1)}
                        title={i < used ? 'Used' : 'Available'}
                        style={{
                          width: 16,
                          height: 16,
                          border: '1.5px solid var(--border-strong)',
                          borderRadius: 3,
                          background: i < used ? 'transparent' : 'var(--accent)',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div className="gb-label" style={{ margin: 0 }}>
            Spells
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
              value={listLevelFilter}
              onChange={(e) => setListLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">All Levels</option>
              {SPELL_LEVEL_OPTIONS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {spellLevelLabel(lvl)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {visibleSpells.map((spell) => {
            const total = slotTotals[spell.level] ?? 0
            const used = draft.spellSlots[spell.level]?.used ?? 0
            const canCast = spell.level > 0 && used < total
            const compendium = spell.compendiumId ? getSpellById(spell.compendiumId) : undefined
            return (
              <HoverDetailCard
                key={spell.id}
                title={compendium?.name ?? (spell.name || 'Untitled Spell')}
                subtitle={
                  compendium
                    ? `${spellLevelLabel(compendium.level)} ${compendium.school}${compendium.ritual ? ' (ritual)' : ''}`
                    : `${spellLevelLabel(spell.level)}${spell.school ? ` ${spell.school}` : ''}${spell.ritual ? ' (ritual)' : ''}`
                }
                fields={compendium ? spellFields(compendium) : customSpellFields(spell)}
                description={compendium?.description ?? spell.description}
                extra={
                  compendium?.higherLevel
                    ? { label: 'At Higher Levels', value: compendium.higherLevel }
                    : spell.higherLevel
                      ? { label: 'At Higher Levels', value: spell.higherLevel }
                      : undefined
                }
              >
                <EntryCard
                  name={<EntryCardTitle value={compendium?.name ?? spell.name} />}
                  badge={
                    <span className="gb-badge gb-badge--accent">
                      {spellLevelLabel(spell.level)}
                      {spell.free ? ' · Free' : ''}
                    </span>
                  }
                  onEdit={compendium ? undefined : () => openEditForm(spell)}
                  onRemove={() => patch({ spells: draft.spells.filter((s) => s.id !== spell.id) })}
                >
                  {compendium?.attackType && casterAttackBonus !== null && <MiniStat label="Atk" value={formatModifier(casterAttackBonus)} />}
                  <select
                    className="gb-input"
                    style={{ width: 100, fontSize: 12 }}
                    value={spell.actionType ?? 'action'}
                    onChange={(e) => updateSpell(spell.id, { actionType: e.target.value as ActionType })}
                  >
                    {ACTION_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {spell.level > 0 && (
                    <Button
                      variant="secondary"
                      disabled={!canCast}
                      onClick={() => castSpell(spell)}
                      style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
                      title={canCast ? `Use a level ${spell.level} slot` : 'No slots remaining'}
                    >
                      Cast
                    </Button>
                  )}
                </EntryCard>
              </HoverDetailCard>
            )
          })}
        </div>
        {atSpellCap && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
            Spell limit reached ({leveledSpellCount}/{spellCap}).
          </p>
        )}
        {atCantripCap && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Cantrip limit reached ({cantripCount}/{cantripCap}).
          </p>
        )}
        <div style={{ marginTop: 8 }}>
          <CompendiumPicker
            search={(q) =>
              searchSpells(
                q,
                30,
                SPELLS.filter((s) => {
                  if (s.level > maxCastableLevel) return false
                  if (pickerLevelFilter !== 'all' && s.level !== pickerLevelFilter) return false
                  if (s.level === 0 && atCantripCap) return false
                  if (s.level > 0 && atSpellCap) return false
                  if (casterClasses.length > 0 && !s.classes.some((c) => casterClasses.includes(c.toLowerCase()))) return false
                  return !knownCompendiumSpellIds.has(s.id)
                })
              )
            }
            getLabel={(s: CompendiumSpell) => s.name}
            getSublabel={(s: CompendiumSpell) => `${spellLevelLabel(s.level)} · ${s.classes.join(', ')}`}
            onPick={addFromCompendium}
            onAddCustom={openCreateForm}
            buttonLabel="+ Add Spell"
            searchPlaceholder="Search SRD spells…"
            filters={
              <select
                className="gb-input"
                style={{ fontSize: 12 }}
                value={pickerLevelFilter}
                onChange={(e) => setPickerLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value="all">All Levels</option>
                {SPELL_LEVEL_OPTIONS.filter((lvl) => lvl <= maxCastableLevel).map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {spellLevelLabel(lvl)}
                  </option>
                ))}
              </select>
            }
          />
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <div className="gb-label">{label}</div>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="gb-label">{label}</div>
      <div style={{ fontSize: 20, fontFamily: 'var(--font-display)' }}>{value}</div>
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

