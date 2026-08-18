import { useState, type CSSProperties } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import {
  CLASSES,
  abilityModifier,
  activeFeatIds,
  curatedFeaturesForLevelUp,
  formatModifier,
  resourcesForCharacter,
  spellAttackBonus,
  spellSaveDC,
  toggleFeaturesForCharacter,
  type AbilityScores,
  type ActionType,
  type Attack,
  type CharacterSheetData
} from '@shared/dnd5e'
import {
  UNARMED_STRIKE,
  activeBuffMeleeDamageBonus,
  effectiveAbilityScores,
  effectiveAttackAdvantage,
  getEquipmentById,
  getSpellById,
  groupedSubclassFeaturesForLevelUp,
  isActivatableResource,
  spellDealsDamage,
  subclassesForClass,
  suggestedAttackAbility,
  weaponAttackBonus,
  weaponAttacksFromEquipment,
  type CompendiumEquipment
} from '@shared/compendium'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { SpellsTab } from './SpellsTab'
import { FeaturesTab, PoolTracker, UsesTracker } from './FeaturesTab'
import type { DetailField } from '../CompendiumDetailModal'
import { HoverDetailCard } from '../HoverDetailCard'
import { EntryCard, EntryCardTitle } from '../EntryCard'
import { CustomWeaponForm } from '../CustomWeaponForm'
import { Button } from '../../../ui/Button'

interface CombatDraft {
  attacks: Attack[]
}

interface ResourcesDraft {
  resourceUsed: Record<string, number>
}

interface CombatTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
}

const ACTION_TYPES: { id: ActionType; label: string }[] = [
  { id: 'action', label: 'Action' },
  { id: 'bonus', label: 'Bonus Action' },
  { id: 'reaction', label: 'Reaction' }
]

const ACTION_TYPE_LABEL: Record<ActionType, string> = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction' }

/** SRD 2014 core class features that actually spend a reaction — sparse by design, since most classes never grant one baseline (Sentinel-style reactions all come from feats/subclasses outside this SRD's scope, and a custom attack/note can always cover anything homebrew). Keyed by class id, valued with the exact CLASS_LEVEL_FEATURES name so the real curated description comes along for free. */
const REACTION_FEATURE_NAMES: Record<string, string[]> = {
  monk: ['Deflect Missiles', 'Slow Fall'],
  rogue: ['Uncanny Dodge']
}

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

/** "1d8" -> "1d8 +3" — a weapon (or unarmed strike) attack's damage always adds its governing ability's modifier, per the SRD's weapon attack rules. Bare dice with no modifier suffix would understate the actual damage roll. `extraBonus` folds in anything else currently boosting this specific attack's damage — right now just an active buff's meleeDamageBonus (Rage), passed in by the caller only for Str-based melee attacks. */
function weaponDamageDisplay(dice: string, ability: 'str' | 'dex', abilityScores: AbilityScores, extraBonus = 0): string {
  if (!dice) return '—'
  return `${dice} ${formatModifier(abilityModifier(abilityScores[ability]) + extraBonus)}`
}

/** Same idea as suggestedAttackAbility (shared/compendium.ts), for a custom attack's freeform weaponRange/properties fields instead of a compendium weapon's typed ones — ranged uses Dex, Finesse picks whichever of Str/Dex is currently higher, everything else uses Str. Automatic now, not a per-attack dropdown, so this is the only place it's decided. */
function customAttackAbility(attack: Attack, abilityScores: AbilityScores): 'str' | 'dex' {
  if (attack.weaponRange === 'Ranged') return 'dex'
  if ((attack.properties ?? '').toLowerCase().includes('finesse')) {
    return abilityModifier(abilityScores.dex) > abilityModifier(abilityScores.str) ? 'dex' : 'str'
  }
  return 'str'
}

/** Same shape as weaponFields, but reading a custom attack's own stored fields (filled in via CustomWeaponForm) instead of a compendium entry. */
function customWeaponFields(attack: Attack): DetailField[] {
  const fields: DetailField[] = []
  if (attack.weaponRange) fields.push({ label: 'Range', value: attack.weaponRange })
  if (attack.damage || attack.damageType) fields.push({ label: 'Damage', value: `${attack.damage} ${attack.damageType}`.trim() })
  if (attack.properties) fields.push({ label: 'Properties', value: attack.properties })
  return fields
}

/** AC/HP/speed/death saves/etc. now live in OverviewTab's compact header and its Saving Throws/Death Saves column — this tab is just an Attacks/Spells/Features inner tab strip. Spells only shows up once the character is actually a caster (see isCaster below); Features (class resources, feats, and freeform class features/traits — see FeaturesTab.tsx, which absorbed the old standalone Class Features tab) always shows, since it always has at least the "+ Add Feature" freeform section even with nothing else gained yet. Both reuse their own standalone tab components (each owns its own autosave draft). All inner panels stay mounted (hidden via CSS) when switching, for the same reason as the outer tab strip in CharacterSheetEditor — an in-flight debounced edit shouldn't get cancelled just because you looked at another panel. */
export function CombatTab({ character, onSave, readOnly }: CombatTabProps): JSX.Element {
  const isCaster =
    character.spellcastingAbility !== null ||
    character.classes.some((c) => CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())?.spellcastingAbility)
  // A feat that boosts Str/Dex should raise attack bonus the same way an
  // ASI does — see shared/compendium.ts's effectiveAbilityScores.
  const effScores = effectiveAbilityScores(character.abilityScores, character.classes, character.asiSlotChoices)
  // Rage's damage bonus only ever applies to a Str-based melee attack — see activeBuffMeleeDamageBonus in shared/compendium.ts.
  const meleeBuffDamage = activeBuffMeleeDamageBonus(character.activeBuffs, character.classes)

  const [innerTab, setInnerTab] = useState<'Attacks' | 'Spells' | 'Features' | 'Reactions'>('Attacks')
  const [formOpen, setFormOpen] = useState(false)
  const [editingAttack, setEditingAttack] = useState<Attack | null>(null)
  const [listSearch, setListSearch] = useState('')
  const [draft, setDraft] = useAutosaveDraft<CombatDraft>({ attacks: character.attacks }, onSave, readOnly)
  const [resourceDraft, setResourceDraft] = useAutosaveDraft<ResourcesDraft>({ resourceUsed: character.resourceUsed }, onSave, readOnly)

  function patch(fields: Partial<CombatDraft>): void {
    setDraft((prev) => ({ ...prev, ...fields }))
  }

  function setResourceUsed(id: string, used: number, max: number): void {
    setResourceDraft((prev) => ({ resourceUsed: { ...prev.resourceUsed, [id]: Math.max(0, Math.min(used, max)) } }))
  }

  /** Same activate/end semantics as FeaturesTab.tsx's toggleBuff (spends a use on activation, never refunds on end) — duplicated here rather than shared since this tab keeps its own resourceUsed/attacks autosave draft, separate from FeaturesTab's. */
  function toggleResourceBuff(resourceId: string, kind: 'uses' | 'pool', currentUsed: number, max: number): void {
    if (readOnly) return
    const active = character.activeBuffs.includes(resourceId)
    if (active) {
      onSave({ activeBuffs: character.activeBuffs.filter((id) => id !== resourceId) })
      return
    }
    if (kind === 'uses' && currentUsed >= max) return
    if (kind === 'uses') setResourceUsed(resourceId, currentUsed + 1, max)
    onSave({ activeBuffs: [...character.activeBuffs, resourceId] })
  }

  function toggleFeature(id: string): void {
    if (readOnly) return
    const active = character.activeBuffs.includes(id)
    onSave({ activeBuffs: active ? character.activeBuffs.filter((b) => b !== id) : [...character.activeBuffs, id] })
  }

  function updateAttack(id: string, fields: Partial<Attack>): void {
    patch({ attacks: draft.attacks.map((a) => (a.id === id ? { ...a, ...fields } : a)) })
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

  // Equipping a weapon in Inventory is what actually puts it here now — see
  // weaponAttacksFromEquipment. `draft.attacks` (without a compendiumId) is
  // custom, freeform attacks only. A stored attack that still has a
  // compendiumId is a leftover from before this change; it keeps showing
  // (nothing was lost) as long as an equipped inventory item with the same
  // weapon isn't already covering it, to avoid a duplicate row.
  // A known cantrip that deals damage — whether it requires an attack roll
  // (Fire Bolt) or a saving throw (Acid Splash, Poison Spray) — reads as an
  // offensive option, not just a line on the Spells tab, so it shows up
  // here too (see spellDealsDamage) — including feat-granted ones (Magic
  // Initiate) or subclass-granted ones (a Draconic sorcerer's Elemental
  // Affinity bonus, a Circle of the Land spell), since a spell that lands
  // in character.spells isn't distinguishable here from one a class
  // granted directly.
  const damagingCantrips = character.spells
    .filter((s) => s.level === 0)
    .map((s) => ({ spell: s, compendium: s.compendiumId ? getSpellById(s.compendiumId) : undefined }))
    .filter(
      (s): s is { spell: (typeof character.spells)[number]; compendium: NonNullable<ReturnType<typeof getSpellById>> } =>
        !!s.compendium && spellDealsDamage(s.compendium)
    )
  const cantripAttackBonus = spellAttackBonus(character.spellcastingAbility, effScores, character.classes)
  const spellSaveDc = spellSaveDC(character.spellcastingAbility, effScores, character.classes)

  // Every known spell whose own casting time is "1 reaction" (Shield, Counterspell, Feather Fall, Hellish Rebuke,
  // ...) — derived from the compendium's own castingTime field, not a hand-maintained list, so it stays accurate
  // as spells are added or removed on the Spells tab.
  const reactionSpells = character.spells
    .map((s) => ({ spell: s, compendium: s.compendiumId ? getSpellById(s.compendiumId) : undefined }))
    .filter((s): s is { spell: (typeof character.spells)[number]; compendium: NonNullable<ReturnType<typeof getSpellById>> } =>
      s.compendium?.castingTime === '1 reaction'
    )
  // Reactions from a class's own base table (the sparse, hand-curated set —
  // see REACTION_FEATURE_NAMES) plus, generically, any chosen subclass
  // feature whose SRD text actually names a reaction (Cutting Words, Open
  // Hand Technique, Uncanny Dodge via Superior Hunter's Defense, ...) —
  // full subclass rules text almost always says "as a Reaction" outright,
  // unlike the short base-class blurbs, so a plain text scan catches these
  // without needing a second hand-maintained name list.
  const REACTION_TEXT_PATTERN = /\breaction\b/i
  const reactionFeatures = character.classes.flatMap((c) => {
    const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
    if (!cls) return []
    const names = REACTION_FEATURE_NAMES[cls.id]
    const base = names
      ? curatedFeaturesForLevelUp(c.className, 0, c.level)
          .filter((f) => names.includes(f.name))
          .map((f) => ({ name: f.name, description: f.description, className: c.className }))
      : []
    const chosenSubclass = subclassesForClass(cls.id).find((s) => s.name === c.subclass)
    const subclassReactions =
      chosenSubclass && c.subclass
        ? groupedSubclassFeaturesForLevelUp(cls.id, chosenSubclass.id, 0, c.level).flatMap((g) => {
            if (g.kind === 'single') return REACTION_TEXT_PATTERN.test(g.feature.desc) ? [{ name: g.feature.name, description: g.feature.desc, className: c.className }] : []
            const resolved = character.subclassFeatureChoices.find(
              (choice) => choice.level === g.level && choice.className.toLowerCase() === c.className.toLowerCase() && choice.featureName === g.baseName
            )
            if (!resolved) return []
            const option = g.options.find((o) => o.name === resolved.chosenName)
            return option && REACTION_TEXT_PATTERN.test(option.desc) ? [{ name: option.name, description: option.desc, className: c.className }] : []
          })
        : []
    return [...base, ...subclassReactions]
  })

  const activeFeats = activeFeatIds(character.classes, character.asiSlotChoices)
  const toggleFeatures = toggleFeaturesForCharacter(character.classes)
  const attackAdvantage = effectiveAttackAdvantage(activeFeats, character.activeBuffs)
  const resources = resourcesForCharacter(character.classes, effScores)
  const bonusActionResources = resources.filter((r) => r.actionType === 'bonus')
  const otherResources = resources.filter((r) => r.actionType !== 'bonus')

  const equippedWeapons = weaponAttacksFromEquipment(character.equipment)
  const equippedWeaponIds = new Set(equippedWeapons.map((w) => w.weapon.id))
  const legacyStoredWeaponAttacks = draft.attacks.filter((a) => a.compendiumId && !equippedWeaponIds.has(a.compendiumId))
  const customAttacks = draft.attacks.filter((a) => !a.compendiumId)

  const matchesSearch = (name: string): boolean => listSearch.trim() === '' || name.toLowerCase().includes(listSearch.trim().toLowerCase())

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
          Actions
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
        <button
          type="button"
          onClick={() => setInnerTab('Features')}
          style={{ ...innerTabStyle, borderBottomColor: innerTab === 'Features' ? 'var(--accent)' : 'transparent', color: innerTab === 'Features' ? 'var(--text-primary)' : 'var(--text-muted)' }}
        >
          Features
        </button>
        <button
          type="button"
          onClick={() => setInnerTab('Reactions')}
          style={{ ...innerTabStyle, borderBottomColor: innerTab === 'Reactions' ? 'var(--accent)' : 'transparent', color: innerTab === 'Reactions' ? 'var(--text-primary)' : 'var(--text-muted)' }}
        >
          Reactions
        </button>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <input
            className="gb-input"
            placeholder="Search…"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {matchesSearch(UNARMED_STRIKE.name) && (
            <HoverDetailCard title={UNARMED_STRIKE.name} subtitle="Always available" fields={[]} description={UNARMED_STRIKE.description}>
              <EntryCard name={<EntryCardTitle value={UNARMED_STRIKE.name} />} badge={<span className="gb-badge">{UNARMED_STRIKE.damageType}</span>}>
                <MiniStat label="Atk" value={formatModifier(weaponAttackBonus('str', effScores, character.classes))} />
                <LockedValue value={weaponDamageDisplay(UNARMED_STRIKE.damage, 'str', effScores, meleeBuffDamage)} />
                <LockedValue value="Action" />
              </EntryCard>
            </HoverDetailCard>
          )}

          {damagingCantrips
            .filter(({ spell }) => matchesSearch(spell.name))
            .map(({ spell, compendium }) => {
              const diceMatch = /\d+d\d+/.exec(compendium.description)
              return (
                <HoverDetailCard
                  key={spell.id}
                  title={compendium.name}
                  subtitle="Cantrip"
                  fields={[]}
                  description={compendium.description}
                >
                  <EntryCard name={<EntryCardTitle value={compendium.name} />} badge={<span className="gb-badge">Cantrip</span>}>
                    {compendium.attackType ? (
                      <MiniStat label="Atk" value={cantripAttackBonus !== null ? formatModifier(cantripAttackBonus) : '—'} />
                    ) : (
                      <MiniStat label="DC" value={spellSaveDc !== null ? String(spellSaveDc) : '—'} />
                    )}
                    <LockedValue value={diceMatch ? diceMatch[0] : 'See spell'} />
                    <LockedValue value={ACTION_TYPE_LABEL[spell.actionType ?? 'action']} />
                  </EntryCard>
                </HoverDetailCard>
              )
            })}

          {equippedWeapons
            .filter(({ weapon }) => matchesSearch(weapon.name))
            .map(({ item, weapon }) => {
              const ability = suggestedAttackAbility(weapon, effScores)
              const bonus = weaponAttackBonus(ability, effScores, character.classes)
              return (
                <HoverDetailCard key={item.id} title={weapon.name} subtitle="Equipped weapon" fields={weaponFields(weapon)} description={weapon.description ?? ''}>
                  <EntryCard name={<EntryCardTitle value={weapon.name} />} badge={weapon.damageType ? <span className="gb-badge">{weapon.damageType}</span> : undefined}>
                    <MiniStat label="Atk" value={formatModifier(bonus)} />
                    <LockedValue
                      value={weaponDamageDisplay(
                        weapon.damageDice ?? '',
                        ability,
                        effScores,
                        ability === 'str' && weapon.weaponRange !== 'Ranged' ? meleeBuffDamage : 0
                      )}
                    />
                  </EntryCard>
                </HoverDetailCard>
              )
            })}

          {legacyStoredWeaponAttacks.filter((a) => matchesSearch(a.name)).map((attack) => {
            const weapon = getEquipmentById(attack.compendiumId!)
            const ability = weapon ? suggestedAttackAbility(weapon, effScores) : customAttackAbility(attack, effScores)
            const bonus = weaponAttackBonus(ability, effScores, character.classes)
            return (
              <HoverDetailCard
                key={attack.id}
                title={weapon?.name ?? attack.name}
                subtitle="Weapon"
                fields={weapon ? weaponFields(weapon) : customWeaponFields(attack)}
                description={weapon?.description ?? attack.notes}
              >
                <EntryCard
                  name={<EntryCardTitle value={weapon?.name ?? attack.name} />}
                  badge={weapon?.damageType ? <span className="gb-badge">{weapon.damageType}</span> : undefined}
                  onRemove={() => patch({ attacks: draft.attacks.filter((a) => a.id !== attack.id) })}
                >
                  <MiniStat label="Atk" value={formatModifier(bonus)} />
                  <LockedValue value={weaponDamageDisplay(attack.damage, ability, effScores)} />
                </EntryCard>
              </HoverDetailCard>
            )
          })}

          {customAttacks.filter((a) => matchesSearch(a.name)).map((attack) => {
            const ability = customAttackAbility(attack, effScores)
            const bonus = weaponAttackBonus(ability, effScores, character.classes)
            return (
              <HoverDetailCard key={attack.id} title={attack.name || 'Untitled Attack'} subtitle={attack.weaponRange} fields={customWeaponFields(attack)} description={attack.notes}>
                <EntryCard
                  name={<EntryCardTitle value={attack.name} />}
                  badge={attack.damageType ? <span className="gb-badge">{attack.damageType}</span> : undefined}
                  onEdit={() => openEditForm(attack)}
                  onRemove={() => patch({ attacks: draft.attacks.filter((a) => a.id !== attack.id) })}
                >
                  <MiniStat label="Atk" value={formatModifier(bonus)} />
                  <LockedValue value={weaponDamageDisplay(attack.damage, ability, effScores)} />
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
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
          Equip a weapon on the Inventory tab to add it here automatically — unequip it there to remove it.
        </p>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={openCreateForm} disabled={readOnly} style={{ fontSize: 12, padding: '4px 10px' }}>
            + Add Custom Attack
          </Button>
        </div>

        {attackAdvantage && (
          <p style={{ fontSize: 12, color: 'var(--accent)', margin: '10px 0 0' }}>
            Advantage on attack rolls is currently active (Rage, Reckless Attack, or a feat).
          </p>
        )}

        {toggleFeatures.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="gb-label" style={{ margin: '0 0 4px' }}>
              Toggle Actions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
              {toggleFeatures.map((f) => {
                const active = character.activeBuffs.includes(f.id)
                return (
                  <div key={f.id} className="gb-card" style={{ padding: 'var(--space-3)', borderColor: active ? 'var(--accent)' : undefined }}>
                    <HoverDetailCard title={f.name} subtitle={f.className} fields={[]} description={f.description}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'default' }}>
                        <strong style={{ flex: 1 }}>{f.name}</strong>
                        {active && (
                          <span className="gb-badge gb-badge--accent" style={{ fontSize: 10 }}>
                            Active
                          </span>
                        )}
                        <span className="gb-badge" style={{ fontSize: 10 }}>
                          {ACTION_TYPE_LABEL[f.actionType]}
                        </span>
                      </div>
                    </HoverDetailCard>
                    <Button
                      variant={active ? 'secondary' : 'primary'}
                      onClick={() => toggleFeature(f.id)}
                      disabled={readOnly}
                      style={{ width: '100%', fontSize: 12, padding: '4px 10px' }}
                    >
                      {active ? `End ${f.name}` : `Activate ${f.name}`}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {bonusActionResources.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="gb-label" style={{ margin: '0 0 4px' }}>
              Bonus Actions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
              {bonusActionResources.map((r) => (
                <ResourceCard
                  key={r.id}
                  resource={r}
                  used={Math.min(resourceDraft.resourceUsed[r.id] ?? 0, r.currentMax)}
                  active={character.activeBuffs.includes(r.id)}
                  readOnly={readOnly}
                  onSetUsed={(n) => setResourceUsed(r.id, n, r.currentMax)}
                  onToggle={() => toggleResourceBuff(r.id, r.kind, resourceDraft.resourceUsed[r.id] ?? 0, r.currentMax)}
                />
              ))}
            </div>
          </div>
        )}

        {otherResources.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="gb-label" style={{ margin: '0 0 4px' }}>
              Other Class Resources
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
              {otherResources.map((r) => (
                <ResourceCard
                  key={r.id}
                  resource={r}
                  used={Math.min(resourceDraft.resourceUsed[r.id] ?? 0, r.currentMax)}
                  active={character.activeBuffs.includes(r.id)}
                  readOnly={readOnly}
                  onSetUsed={(n) => setResourceUsed(r.id, n, r.currentMax)}
                  onToggle={() => toggleResourceBuff(r.id, r.kind, resourceDraft.resourceUsed[r.id] ?? 0, r.currentMax)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {isCaster && (
        <div style={{ display: innerTab === 'Spells' ? 'block' : 'none' }}>
          <SpellsTab character={character} onSave={onSave} readOnly={readOnly} />
        </div>
      )}

      <div style={{ display: innerTab === 'Features' ? 'block' : 'none' }}>
        <FeaturesTab character={character} onSave={onSave} readOnly={readOnly} />
      </div>

      <div style={{ display: innerTab === 'Reactions' ? 'block' : 'none' }}>
        {reactionFeatures.length === 0 && reactionSpells.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            No reactions yet — a class feature that spends a reaction, or a known spell with a casting time of 1
            reaction (Shield, Counterspell, Feather Fall, ...), will show up here automatically.
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {reactionFeatures.map((f) => (
            <div key={`${f.className}:${f.name}`} className="gb-card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <strong style={{ flex: 1 }}>{f.name}</strong>
                <span className="gb-badge" style={{ fontSize: 10 }}>
                  {f.className}
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{f.description}</p>
            </div>
          ))}
          {reactionSpells.map(({ spell, compendium }) => (
            <HoverDetailCard key={spell.id} title={compendium.name} subtitle="Reaction Spell" fields={[]} description={compendium.description}>
              <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <strong style={{ flex: 1 }}>{compendium.name}</strong>
                  <span className="gb-badge gb-badge--accent" style={{ fontSize: 10 }}>
                    Reaction Spell
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{compendium.description}</p>
              </div>
            </HoverDetailCard>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A compact class-resource card for the Actions tab's Bonus Actions/Other Class Resources sections — same tracker/activate-button pieces as FeaturesTab.tsx's fuller version, just without the "Class Resources" section header repeated here (that one groups by class; this groups by action type). */
function ResourceCard({
  resource,
  used,
  active,
  readOnly,
  onSetUsed,
  onToggle
}: {
  resource: ReturnType<typeof resourcesForCharacter>[number]
  used: number
  active: boolean
  readOnly?: boolean
  onSetUsed: (used: number) => void
  onToggle: () => void
}): JSX.Element {
  const remaining = resource.currentMax - used
  const activatable = isActivatableResource(resource.id)
  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)', borderColor: active ? 'var(--accent)' : undefined }}>
      <HoverDetailCard title={resource.name} subtitle={resource.className} fields={[]} description={resource.fullDescription}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'default' }}>
          <strong style={{ flex: 1 }}>{resource.name}</strong>
          {active && (
            <span className="gb-badge gb-badge--accent" style={{ fontSize: 10 }}>
              Active
            </span>
          )}
          <span className="gb-badge" style={{ fontSize: 10 }}>
            {resource.className}
          </span>
        </div>
      </HoverDetailCard>
      {resource.kind === 'uses' ? (
        <UsesTracker max={resource.currentMax} used={used} remaining={remaining} readOnly={readOnly} onSetUsed={onSetUsed} />
      ) : (
        <PoolTracker max={resource.currentMax} used={used} remaining={remaining} readOnly={readOnly} onSetUsed={onSetUsed} />
      )}
      {activatable && (
        <Button
          variant={active ? 'secondary' : 'primary'}
          onClick={onToggle}
          disabled={readOnly || (!active && resource.kind === 'uses' && remaining <= 0)}
          style={{ width: '100%', marginTop: 6, fontSize: 12, padding: '4px 10px' }}
        >
          {active ? `End ${resource.name}` : `Activate ${resource.name}`}
        </Button>
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
