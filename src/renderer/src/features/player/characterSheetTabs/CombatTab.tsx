import { useState, type CSSProperties } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import {
  CLASSES,
  abilityModifier,
  actionTypeFromCastingTime,
  curatedFeaturesForLevelUp,
  formatModifier,
  type AbilityScores,
  type ActionType,
  type Attack,
  type CharacterSheetData
} from '@shared/dnd5e'
import {
  UNARMED_STRIKE,
  getEquipmentById,
  getSpellById,
  groupedSubclassFeaturesForLevelUp,
  spellDealsDamage,
  subclassesForClass,
  type CompendiumEquipment
} from '@shared/compendium'
import type { DerivedAction, DerivedAttack, DerivedCompanion, DerivedResource, DerivedToggle } from '@shared/content/engine'
import { applyRestores, resourceRemaining, rollAmount, spendResource, type ResourceState } from '@shared/content/resourceMath'
import type { Registry } from '@shared/content/registry'
import { effectiveScores, knownSpells } from '@shared/content/sheet'
import { useDerivedSheet } from '../useDerivedSheet'
import { useTerms } from '../../content/terms'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { playAbilitySfx } from '../../audio/sfxBoardEngine'
import { SpellsTab } from './SpellsTab'
import { DivineSmiteCard, FeaturesTab, ResourceTracker } from './FeaturesTab'
import type { DetailField } from '../CompendiumDetailModal'
import { HoverDetailCard } from '../HoverDetailCard'
import { EntryCard, EntryCardTitle } from '../EntryCard'
import { CustomWeaponForm } from '../CustomWeaponForm'
import { Button } from '../../../ui/Button'
import { useSheetRoller } from '../../dice/useSheetRoller'
import { RollButton } from '../../dice/RollButton'
import { DIE_SIDES, type AdvantageMode, type DieSides } from '@shared/dice'

interface CombatDraft {
  attacks: Attack[]
}

interface ResourcesDraft {
  resourceUsed: Record<string, number>
  resourceTemp: Record<string, number>
}

interface CombatTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
  /** Threaded down from OverviewTab/CharacterSheetEditor — see CharacterSheetEditor.tsx's doc comment. */
  sessionId?: string | null
}

/** "1d8" -> a single rollable DiceGroup; anything with more than one dice term (e.g. a homebrew "1d8+1d6") or a non-standard die size just isn't rollable from here — the plain text display is the fallback either way. */
function parseDamageDice(dice: string): { sides: DieSides; count: number } | null {
  const match = /^\s*(\d+)\s*d\s*(\d+)\s*$/i.exec(dice)
  if (!match) return null
  const count = parseInt(match[1], 10)
  const sides = parseInt(match[2], 10)
  if (count < 1 || !(DIE_SIDES as readonly number[]).includes(sides)) return null
  return { sides: sides as DieSides, count }
}

const ACTION_TYPES: { id: ActionType; label: string }[] = [
  { id: 'action', label: 'Action' },
  { id: 'bonus', label: 'Bonus Action' },
  { id: 'reaction', label: 'Reaction' }
]

const ACTION_TYPE_LABEL: Record<ActionType, string> = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction' }

/** A built-in action economy's label, or a pack-defined one's name (vocabulary.actionTypes) — e.g. a homebrew "Technique" action. */
function actionTypeLabel(id: string | undefined, registry: Registry): string | undefined {
  if (!id) return undefined
  // A pack can rename the built-in ones too (terminology "actionType.bonus").
  const renamed = registry.terminology[`actionType.${id}`]
  if (renamed) return renamed
  if (id in ACTION_TYPE_LABEL) return ACTION_TYPE_LABEL[id as ActionType]
  if (id === 'free') return 'Free'
  return registry.vocabulary.actionTypes.find((t) => t.id === id)?.name ?? id
}

/** "1d8 +3", "2d6 + 1d4 +5", "4" — the attack's main damage roll as the content engine computed it (ability modifier and untyped bonuses like Rage already folded in), plus any separately-typed extra damage ("+ 1d6 Cursed"). */
function derivedDamageDisplay(attack: DerivedAttack): string {
  const dice = attack.damageDice.dice.map((d) => `${d.count}d${d.sides}`).join(' + ')
  const main = dice ? (attack.damageDice.flat ? `${dice} ${formatModifier(attack.damageDice.flat)}` : dice) : String(attack.damageDice.flat)
  return [main, ...attack.extraDamage.map((x) => `${x.damage} ${x.damageType ?? ''}`.trim())].join(' + ')
}

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
export function CombatTab({ character, onSave, readOnly, sessionId = null }: CombatTabProps): JSX.Element {
  const { rollCheck, rollDamage } = useSheetRoller(sessionId, character.name)
  const terms = useTerms()
  // Attacks, resources, toggles, actions and spell DC/attack all come from
  // the content engine (see shared/content/sheet.ts) — so a feat, item or
  // active buff that changes an attack (Rage, Archery, a homebrew cursed
  // tool) is already folded into what's shown here.
  const derivedSheet = useDerivedSheet(character)
  const { derived, registry } = derivedSheet
  // Stored spells plus engine-granted ones (a lineage's Fire Bolt, Circle Spells, homebrew grants) — see knownSpells.
  const spells = knownSpells(character.spells, derivedSheet)
  const isCaster = character.spellcastingAbility !== null || derived.spellcasting.sources.length > 0
  const effScores = effectiveScores(derived)
  /** Custom (freeform) attacks aren't part of the build, so their bonus is worked out here: proficiency + the governing ability's modifier, as before. */
  const customAttackBonus = (ability: 'str' | 'dex'): number => derived.proficiencyBonus + derived.abilities[ability].mod

  const [innerTab, setInnerTab] = useState<'Attacks' | 'Spells' | 'Features' | 'Reactions'>('Attacks')
  const [formOpen, setFormOpen] = useState(false)
  const [editingAttack, setEditingAttack] = useState<Attack | null>(null)
  const [listSearch, setListSearch] = useState('')
  const [draft, setDraft] = useAutosaveDraft<CombatDraft>({ attacks: character.attacks }, onSave, readOnly)
  const [resourceDraft, setResourceDraft] = useAutosaveDraft<ResourcesDraft>(
    { resourceUsed: character.resourceUsed, resourceTemp: character.resourceTemp ?? {} },
    onSave,
    readOnly
  )

  function patch(fields: Partial<CombatDraft>): void {
    setDraft((prev) => ({ ...prev, ...fields }))
  }

  function commitResources(state: ResourceState): void {
    setResourceDraft(() => ({ resourceUsed: state.resourceUsed, resourceTemp: state.resourceTemp }))
  }

  /** Spends from a resource, temporary points first; false (and nothing spent) when there isn't enough. */
  function spend(resourceId: string, amount: number, state: ResourceState = resourceDraft): ResourceState | null {
    const resource = derived.resources.find((r) => r.id === resourceId)
    if (!resource) return state
    return spendResource(resource, state, amount)
  }

  /**
   * Uses an engine action: pays its fixed cost and the chosen variable amount
   * (@spent), then applies what it gives back — restored or temporary
   * resource points, and temporary HP (which, as in 5e, doesn't stack: the
   * higher value is kept).
   */
  function useAction(action: DerivedAction, spent: number): void {
    if (readOnly) return
    let state: ResourceState | null = resourceDraft
    if (action.cost) state = spend(action.cost.resourceId, action.cost.amount, state)
    if (state && action.spend) state = spend(action.spend.resourceId, spent, state)
    if (!state) return
    const numbers = action.spend ? (action.scaling?.find((x) => x.spent === spent) ?? action) : action
    if (numbers.restores?.length) state = applyRestores(numbers.restores, derived.resources, state).state
    commitResources(state)
    if (numbers.tempHp) {
      const gained = rollAmount(numbers.tempHp)
      if (gained > character.tempHp) onSave({ tempHp: gained })
    }
    playAbilitySfx(action.name, sessionId)
  }

  function saveCompanion(companion: DerivedCompanion, fields: { state?: string; currentHp?: number }): void {
    if (readOnly) return
    // Summoning one that has a cost pays it (blocked if there isn't enough).
    if (fields.state === 'summoned' && companion.state !== 'summoned' && companion.summonCost) {
      const state = spend(companion.summonCost.resourceId, companion.summonCost.amount)
      if (!state) return
      commitResources(state)
    }
    const prev = character.companionStates?.[companion.id] ?? {}
    onSave({ companionStates: { ...character.companionStates, [companion.id]: { ...prev, ...fields } } })
  }

  /** Turns a toggle (Rage, Reckless Attack, a homebrew Domain Expansion) on or off. Turning one on spends its cost from its resource, if it has one (never refunded on end), and is blocked if there isn't enough left — same semantics as FeaturesTab.tsx's toggleBuff, duplicated here since this tab keeps its own resourceUsed autosave draft. Plays (and, at the table, broadcasts) the toggle's sound cue — see playAbilitySfx — only on activation, never when turning it back off. */
  function toggleBuff(toggle: DerivedToggle): void {
    if (readOnly) return
    if (character.activeBuffs.includes(toggle.id)) {
      onSave({ activeBuffs: character.activeBuffs.filter((id) => id !== toggle.id) })
      return
    }
    if (toggle.cost) {
      const state = spend(toggle.cost.resourceId, toggle.cost.amount)
      if (!state) return
      commitResources(state)
    }
    playAbilitySfx(toggle.name, sessionId)
    onSave({ activeBuffs: [...character.activeBuffs, toggle.id] })
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
  const damagingCantrips = spells
    .filter((s) => s.level === 0)
    .map((s) => ({ spell: s, compendium: s.compendiumId ? getSpellById(s.compendiumId) : undefined }))
    .filter(
      (s): s is { spell: (typeof spells)[number]; compendium: NonNullable<ReturnType<typeof getSpellById>> } =>
        !!s.compendium && spellDealsDamage(s.compendium)
    )
  const cantripAttackBonus = derived.spellcasting.attackBonus
  const spellSaveDc = derived.spellcasting.dc

  // Every known spell whose own casting time is "1 reaction" (Shield, Counterspell, Feather Fall, Hellish Rebuke,
  // ...) — derived from the compendium's own castingTime field, not a hand-maintained list, so it stays accurate
  // as spells are added or removed on the Spells tab.
  const reactionSpells = spells
    .map((s) => ({ spell: s, compendium: s.compendiumId ? getSpellById(s.compendiumId) : undefined }))
    .filter((s): s is { spell: (typeof spells)[number]; compendium: NonNullable<ReturnType<typeof getSpellById>> } =>
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

  // A toggle with a cost is how the engine models an activatable resource (Rage) — it's shown on its resource's card;
  // free toggles (Reckless Attack) get their own Toggle Actions section.
  const toggleFeatures = derived.toggles.filter((t) => !t.cost)
  const toggleForResource = (resourceId: string): DerivedToggle | undefined => derived.toggles.find((t) => t.cost?.resourceId === resourceId)
  const attackAdvantage = derived.attackMode
  const resources = derived.resources
  const bonusActionResources = resources.filter((r) => r.actionType === 'bonus')
  const otherResources = resources.filter((r) => r.actionType !== 'bonus')
  const resourceActions = derived.actions
  const isDivineSmiteClass = character.classes.some((c) => c.className.toLowerCase() === 'paladin' && c.level >= 2)

  const equipmentById = new Map(character.equipment.map((e) => [e.id, e]))
  const compendiumWeaponFor = (attack: DerivedAttack): CompendiumEquipment | undefined => {
    const item = attack.itemKey ? equipmentById.get(attack.itemKey) : undefined
    return item?.compendiumId ? getEquipmentById(item.compendiumId) : undefined
  }
  const equippedWeaponIds = new Set(derived.attacks.flatMap((a) => (a.kind === 'weapon' && a.itemKey ? [equipmentById.get(a.itemKey)?.compendiumId ?? ''] : [])))
  const legacyStoredWeaponAttacks = draft.attacks.filter((a) => a.compendiumId && !equippedWeaponIds.has(a.compendiumId))
  const customAttacks = draft.attacks.filter((a) => !a.compendiumId)

  const matchesSearch = (name: string): boolean => listSearch.trim() === '' || name.toLowerCase().includes(listSearch.trim().toLowerCase())

  function rollAttack(label: string, bonus: number, mode = attackAdvantage): ((advantage: AdvantageMode) => void) | undefined {
    return readOnly ? undefined : (advantage) => rollCheck(label, bonus, { advantage: advantage !== 'normal' ? advantage : (mode ?? 'normal') })
  }
  function rollDerivedDamage(attack: DerivedAttack): (() => void) | undefined {
    if (readOnly || attack.damageDice.dice.length !== 1) return undefined
    const [{ count, sides }] = attack.damageDice.dice
    if (!(DIE_SIDES as readonly number[]).includes(sides)) return undefined
    return () => rollDamage([{ sides: sides as DieSides, count }], attack.damageDice.flat, `${attack.name} Damage`)
  }
  function rollWeaponDamage(label: string, dice: string, modifier: number): (() => void) | undefined {
    if (readOnly) return undefined
    const group = parseDamageDice(dice)
    return group ? () => rollDamage([group], modifier, label) : undefined
  }

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
            {terms.t('spells')}
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
          {derived.attacks
            .filter((a) => a.kind === 'unarmed' && matchesSearch(a.name))
            .map((attack) => (
              <HoverDetailCard key={attack.id} title={attack.name} subtitle="Always available" fields={[]} description={UNARMED_STRIKE.description}>
                <EntryCard name={<EntryCardTitle value={attack.name} />} badge={<span className="gb-badge">{attack.damageType}</span>}>
                  <MiniStat label="Atk" value={formatModifier(attack.attackBonus)} onRoll={rollAttack(`${attack.name} Attack`, attack.attackBonus, attack.mode ?? attackAdvantage)} />
                  <LockedValue value={derivedDamageDisplay(attack)} onRoll={rollDerivedDamage(attack)} />
                  <LockedValue value={actionTypeLabel(attack.actionType, registry) ?? 'Action'} />
                </EntryCard>
              </HoverDetailCard>
            ))}

          {damagingCantrips
            .filter(({ spell }) => matchesSearch(spell.name))
            .map(({ spell, compendium }) => {
              const diceMatch = /\d+d\d+/.exec(compendium.description)
              return (
                <HoverDetailCard
                  key={spell.id}
                  title={compendium.name}
                  subtitle={terms.t('cantrips').replace(/s$/, '')}
                  fields={[]}
                  description={compendium.description}
                >
                  <EntryCard name={<EntryCardTitle value={compendium.name} />} badge={<span className="gb-badge">{terms.t('cantrips').replace(/s$/, '')}</span>}>
                    {compendium.attackType ? (
                      <MiniStat
                        label="Atk"
                        value={cantripAttackBonus !== null ? formatModifier(cantripAttackBonus) : '—'}
                        onRoll={cantripAttackBonus !== null ? rollAttack(`${compendium.name} Attack`, cantripAttackBonus) : undefined}
                      />
                    ) : (
                      <MiniStat label="DC" value={spellSaveDc !== null ? String(spellSaveDc) : '—'} />
                    )}
                    <LockedValue
                      value={diceMatch ? diceMatch[0] : 'See spell'}
                      onRoll={diceMatch ? rollWeaponDamage(`${compendium.name} Damage`, diceMatch[0], 0) : undefined}
                    />
                    <LockedValue value={ACTION_TYPE_LABEL[actionTypeFromCastingTime(compendium.castingTime)]} />
                  </EntryCard>
                </HoverDetailCard>
              )
            })}

          {derived.attacks
            .filter((a) => a.kind !== 'unarmed' && matchesSearch(a.name))
            .map((attack) => {
              const weapon = compendiumWeaponFor(attack)
              return (
                <HoverDetailCard
                  key={attack.id}
                  title={attack.name}
                  subtitle={attack.kind === 'weapon' ? 'Equipped weapon' : 'Granted attack'}
                  fields={weapon ? weaponFields(weapon) : []}
                  description={weapon?.description ?? ''}
                >
                  <EntryCard
                    name={<EntryCardTitle value={attack.name} />}
                    badge={attack.damageType ? <span className="gb-badge">{attack.damageType}</span> : undefined}
                  >
                    <MiniStat
                      label="Atk"
                      value={formatModifier(attack.attackBonus)}
                      onRoll={rollAttack(`${attack.name} Attack`, attack.attackBonus, attack.mode ?? attackAdvantage)}
                    />
                    <LockedValue value={derivedDamageDisplay(attack)} onRoll={rollDerivedDamage(attack)} />
                    {!attack.proficient && (
                      <span className="gb-badge" style={{ fontSize: 10 }} title="Not proficient with this weapon — proficiency bonus isn't added to the attack roll.">
                        Not proficient
                      </span>
                    )}
                  </EntryCard>
                </HoverDetailCard>
              )
            })}

          {legacyStoredWeaponAttacks.filter((a) => matchesSearch(a.name)).map((attack) => {
            const weapon = getEquipmentById(attack.compendiumId!)
            const ability = customAttackAbility(weapon ? { ...attack, weaponRange: weapon.weaponRange === 'Ranged' ? 'Ranged' : 'Melee', properties: weapon.properties?.join(', ') } : attack, effScores)
            const bonus = customAttackBonus(ability)
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
                  <MiniStat label="Atk" value={formatModifier(bonus)} onRoll={rollAttack(`${weapon?.name ?? attack.name} Attack`, bonus)} />
                  <LockedValue
                    value={weaponDamageDisplay(attack.damage, ability, effScores)}
                    onRoll={rollWeaponDamage(`${weapon?.name ?? attack.name} Damage`, attack.damage, abilityModifier(effScores[ability]))}
                  />
                </EntryCard>
              </HoverDetailCard>
            )
          })}

          {customAttacks.filter((a) => matchesSearch(a.name)).map((attack) => {
            const ability = customAttackAbility(attack, effScores)
            const bonus = customAttackBonus(ability)
            return (
              <HoverDetailCard key={attack.id} title={attack.name || 'Untitled Attack'} subtitle={attack.weaponRange} fields={customWeaponFields(attack)} description={attack.notes}>
                <EntryCard
                  name={<EntryCardTitle value={attack.name} />}
                  badge={attack.damageType ? <span className="gb-badge">{attack.damageType}</span> : undefined}
                  onEdit={() => openEditForm(attack)}
                  onRemove={() => patch({ attacks: draft.attacks.filter((a) => a.id !== attack.id) })}
                >
                  <MiniStat label="Atk" value={formatModifier(bonus)} onRoll={rollAttack(`${attack.name || 'Attack'} Attack`, bonus)} />
                  <LockedValue
                    value={weaponDamageDisplay(attack.damage, ability, effScores)}
                    onRoll={rollWeaponDamage(`${attack.name || 'Attack'} Damage`, attack.damage, abilityModifier(effScores[ability]))}
                  />
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
                const label = actionTypeLabel(f.actionType, registry)
                return (
                  <div key={f.id} className="gb-card" style={{ padding: 'var(--space-3)', borderColor: active ? 'var(--accent)' : undefined }}>
                    <HoverDetailCard title={f.name} subtitle={f.className ?? f.source} fields={[]} description={f.description || f.detail || ''}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'default' }}>
                        <strong style={{ flex: 1 }}>{f.name}</strong>
                        {active && (
                          <span className="gb-badge gb-badge--accent" style={{ fontSize: 10 }}>
                            Active
                          </span>
                        )}
                        {label && (
                          <span className="gb-badge" style={{ fontSize: 10 }}>
                            {label}
                          </span>
                        )}
                      </div>
                    </HoverDetailCard>
                    <Button
                      variant={active ? 'secondary' : 'primary'}
                      onClick={() => toggleBuff(f)}
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

        {(isDivineSmiteClass || resourceActions.length > 0) && (
          <div style={{ marginTop: 12 }}>
            <div className="gb-label" style={{ margin: '0 0 4px' }}>
              Special Actions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
              {isDivineSmiteClass && <DivineSmiteCard character={character} onSave={onSave} readOnly={readOnly} sessionId={sessionId} />}
              {resourceActions.map((action) => {
                const resource = action.cost ? resources.find((r) => r.id === action.cost!.resourceId) : undefined
                if (action.cost && !resource) return null
                const spendResourceDef = action.spend ? resources.find((r) => r.id === action.spend!.resourceId) : undefined
                const remainingOf = (r: DerivedResource | undefined): number | null => (r ? resourceRemaining(r, resourceDraft) : null)
                return (
                  <ResourceActionCard
                    key={action.id}
                    action={action}
                    actionLabel={actionTypeLabel(action.actionType, registry)}
                    remaining={remainingOf(resource)}
                    spendRemaining={remainingOf(spendResourceDef)}
                    spendName={spendResourceDef?.name}
                    resourceName={(id) => resources.find((r) => r.id === id)?.name ?? id}
                    readOnly={readOnly}
                    onUse={(spent) => useAction(action, spent)}
                  />
                )
              })}
            </div>
          </div>
        )}

        {derived.companions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="gb-label" style={{ margin: '0 0 4px' }}>
              Companions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
              {derived.companions.map((c) => {
                const costResource = c.summonCost ? resources.find((r) => r.id === c.summonCost!.resourceId) : undefined
                return (
                  <CompanionCard
                    key={c.id}
                    companion={c}
                    costLabel={c.summonCost ? `${c.summonCost.amount} ${costResource?.name ?? c.summonCost.resourceId}` : undefined}
                    canSummon={!c.summonCost || !costResource || resourceRemaining(costResource, resourceDraft) >= c.summonCost.amount}
                    readOnly={readOnly}
                    onRollAttack={(name, bonus) => rollAttack(`${c.name}: ${name}`, bonus, undefined)}
                    onSave={(fields) => saveCompanion(c, fields)}
                  />
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
              {bonusActionResources.map((r) => {
                const toggle = toggleForResource(r.id)
                return (
                  <ResourceCard
                    key={r.id}
                    resource={r}
                    toggle={toggle}
                    state={resourceDraft}
                    active={!!toggle && character.activeBuffs.includes(toggle.id)}
                    readOnly={readOnly}
                    onChange={commitResources}
                    onToggle={() => toggle && toggleBuff(toggle)}
                  />
                )
              })}
            </div>
          </div>
        )}

        {otherResources.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="gb-label" style={{ margin: '0 0 4px' }}>
              Other Class Resources
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
              {otherResources.map((r) => {
                const toggle = toggleForResource(r.id)
                return (
                  <ResourceCard
                    key={r.id}
                    resource={r}
                    toggle={toggle}
                    state={resourceDraft}
                    active={!!toggle && character.activeBuffs.includes(toggle.id)}
                    readOnly={readOnly}
                    onChange={commitResources}
                    onToggle={() => toggle && toggleBuff(toggle)}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>

      {isCaster && (
        <div style={{ display: innerTab === 'Spells' ? 'block' : 'none' }}>
          <SpellsTab character={character} onSave={onSave} readOnly={readOnly} sessionId={sessionId} />
        </div>
      )}

      <div style={{ display: innerTab === 'Features' ? 'block' : 'none' }}>
        <FeaturesTab character={character} onSave={onSave} readOnly={readOnly} sessionId={sessionId} />
      </div>

      <div style={{ display: innerTab === 'Reactions' ? 'block' : 'none' }}>
        {derived.reactions !== 1 && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
            Reactions per round: <strong>{derived.reactions}</strong>
          </p>
        )}
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

/** A named ability, usually spending charges from a resource (Turn Undead ⟶ Channel Divinity, Flurry of Blows ⟶ Ki, a homebrew Cursed Strike ⟶ Cursed Energy) — granted by a feature via the content engine. A "Use" button plus a remaining-charges readout, and the action's own roll numbers when it has any. A variable-spend action ("spend up to your modifier in Cursed Energy") gets an amount picker, and its numbers follow the amount. `remaining` is null for an action with no fixed cost. */
function ResourceActionCard({
  action,
  actionLabel,
  remaining,
  spendRemaining,
  spendName,
  resourceName,
  readOnly,
  onUse
}: {
  action: DerivedAction
  actionLabel?: string
  remaining: number | null
  /** Points left in the variable-spend resource. */
  spendRemaining: number | null
  spendName?: string
  resourceName: (id: string) => string
  readOnly?: boolean
  onUse: (spent: number) => void
}): JSX.Element {
  const cost = action.cost?.amount ?? 0
  const [chosen, setChosen] = useState(action.spend?.min ?? 0)
  const spendMax = action.spend ? Math.max(action.spend.min, Math.min(action.spend.max, action.scaling?.[action.scaling.length - 1]?.spent ?? action.spend.max)) : 0
  const spent = action.spend ? Math.max(action.spend.min, Math.min(chosen, spendMax)) : 0
  const n = action.spend ? (action.scaling?.find((x) => x.spent === spent) ?? action) : action
  const restoreText = (n.restores ?? []).map((r) => `${r.temporary ? '+' : 'Restores '}${r.amount} ${r.temporary ? 'temp ' : ''}${resourceName(r.resourceId)}`)
  const stats = [
    n.attackBonus !== undefined ? `Atk ${formatModifier(n.attackBonus)}` : null,
    n.saveDc !== undefined ? `DC ${n.saveDc}${action.saveAbility ? ` ${action.saveAbility.toUpperCase()}` : ''}` : null,
    n.damage ? `${n.damage}${action.damageType ? ` ${action.damageType}` : ''}` : null,
    n.healing ? `Heals ${n.healing}` : null,
    n.tempHp ? `${n.tempHp} temp HP` : null,
    n.range !== undefined ? `${n.range} ft` : null,
    n.area !== undefined ? `${n.area} ft area` : null,
    action.duration ?? null,
    ...restoreText
  ].filter((x): x is string => !!x)
  const usable = !!action.cost || !!action.spend || !!n.restores?.length || !!n.tempHp
  const affordable = (remaining === null || remaining >= cost) && (!action.spend || spendRemaining === null || spendRemaining >= spent + (action.cost?.resourceId === action.spend.resourceId ? cost : 0))
  const left = action.spend ? spendRemaining : remaining
  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <HoverDetailCard title={action.name} subtitle={action.className ?? action.source} fields={[]} description={action.description || action.detail || ''}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'default' }}>
          <strong style={{ flex: 1 }}>{action.name}</strong>
          {actionLabel && (
            <span className="gb-badge" style={{ fontSize: 10 }}>
              {actionLabel}
            </span>
          )}
        </div>
      </HoverDetailCard>
      {action.spend && spendMax > action.spend.min && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>Spend</span>
          <input
            type="range"
            min={action.spend.min}
            max={spendMax}
            value={spent}
            onChange={(e) => setChosen(Number(e.target.value))}
            disabled={readOnly}
            style={{ flex: 1 }}
          />
          <strong style={{ minWidth: 20, textAlign: 'right' }}>{spent}</strong>
          <span style={{ color: 'var(--text-muted)' }}>{spendName}</span>
        </label>
      )}
      {stats.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{stats.join(' · ')}</div>}
      {usable && (
        <Button
          variant="primary"
          onClick={() => onUse(spent)}
          disabled={readOnly || !affordable}
          style={{ width: '100%', fontSize: 12, padding: '4px 10px' }}
          title={action.spend ? `Spends ${spent}${cost ? ` + ${cost}` : ''}` : cost ? `Spends ${cost}` : undefined}
        >
          {left !== null ? `Use (${left} left)` : 'Use'}
        </Button>
      )}
    </div>
  )
}

/** A companion, familiar or summon a feature grants: its owner-scaled numbers, its state (summoned / dismissed / defeated / the pack's own) and its current HP. */
function CompanionCard({
  companion: c,
  costLabel,
  canSummon,
  readOnly,
  onRollAttack,
  onSave
}: {
  companion: DerivedCompanion
  costLabel?: string
  canSummon: boolean
  readOnly?: boolean
  onRollAttack: (name: string, bonus: number) => ((advantage: AdvantageMode) => void) | undefined
  onSave: (fields: { state?: string; currentHp?: number }) => void
}): JSX.Element {
  const summoned = c.state === 'summoned'
  const subtitle = [c.size, c.creatureType].filter(Boolean).join(' ')
  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)', borderColor: summoned ? 'var(--accent)' : undefined, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <HoverDetailCard
        title={c.name}
        subtitle={subtitle || c.source}
        fields={[]}
        description={[c.description, ...c.traits.map((t) => `${t.name}. ${t.description}`)].filter(Boolean).join('\n\n')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
          <strong style={{ flex: 1 }}>{c.name}</strong>
          <span className="gb-badge" style={{ fontSize: 10 }}>
            {c.className ?? c.source}
          </span>
        </div>
      </HoverDetailCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, flexWrap: 'wrap' }}>
        <span>
          AC <strong>{c.ac}</strong>
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          HP
          <input
            className="gb-input"
            type="number"
            value={c.currentHp}
            min={0}
            max={c.maxHp}
            disabled={readOnly}
            onChange={(e) => onSave({ currentHp: Math.max(0, Math.min(c.maxHp, Number(e.target.value) || 0)) })}
            style={{ width: 52, fontSize: 12, padding: '2px 4px' }}
          />
          / {c.maxHp}
        </label>
        {c.speed && <span style={{ color: 'var(--text-muted)' }}>{c.speed}</span>}
      </div>
      {c.attacks.map((a) => (
        <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ flex: 1 }}>{a.name}</span>
          <MiniStat label="Atk" value={formatModifier(a.bonus)} onRoll={onRollAttack(a.name, a.bonus)} />
          <span style={{ color: 'var(--text-secondary)' }}>
            {a.damage}
            {a.damageType ? ` ${a.damageType}` : ''}
          </span>
        </div>
      ))}
      <select
        className="gb-input"
        value={c.state}
        disabled={readOnly}
        onChange={(e) => onSave({ state: e.target.value, ...(e.target.value === 'summoned' && c.state === 'defeated' ? { currentHp: c.maxHp } : {}) })}
        style={{ fontSize: 12 }}
      >
        {c.states.map((st) => (
          <option key={st} value={st} disabled={st === 'summoned' && !summoned && !canSummon}>
            {st.charAt(0).toUpperCase() + st.slice(1)}
            {st === 'summoned' && costLabel && !summoned ? ` (costs ${costLabel})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

/** A compact class-resource card for the Actions tab's Bonus Actions/Other Class Resources sections — same tracker/activate-button pieces as FeaturesTab.tsx's fuller version, just without the "Class Resources" section header repeated here (that one groups by class; this groups by action type). */
function ResourceCard({
  resource,
  toggle,
  state,
  active,
  readOnly,
  onChange,
  onToggle
}: {
  resource: DerivedResource
  /** The toggle that spends this resource (Rage), if any — gives the card its Activate/End button. */
  toggle?: DerivedToggle
  /** Used and temporary points (this tab's draft). */
  state: ResourceState
  active: boolean
  readOnly?: boolean
  onChange: (state: ResourceState) => void
  onToggle: () => void
}): JSX.Element {
  const remaining = resourceRemaining(resource, state)
  const cost = toggle?.cost?.amount ?? 0
  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)', borderColor: active ? 'var(--accent)' : undefined }}>
      <HoverDetailCard title={resource.name} subtitle={resource.className ?? resource.source} fields={[]} description={resource.detail || resource.description}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'default' }}>
          <strong style={{ flex: 1 }}>{resource.name}</strong>
          {active && (
            <span className="gb-badge gb-badge--accent" style={{ fontSize: 10 }}>
              Active
            </span>
          )}
          <span className="gb-badge" style={{ fontSize: 10 }}>
            {resource.className ?? resource.source}
          </span>
        </div>
      </HoverDetailCard>
      <ResourceTracker resource={resource} state={state} readOnly={readOnly} onChange={onChange} />
      {resource.shortRestRegain ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Short rest: regain {resource.shortRestRegain}</div>
      ) : null}
      {toggle && (
        <Button
          variant={active ? 'secondary' : 'primary'}
          onClick={onToggle}
          disabled={readOnly || (!active && remaining < cost)}
          style={{ width: '100%', marginTop: 6, fontSize: 12, padding: '4px 10px' }}
        >
          {active ? `End ${toggle.name}` : `Activate ${toggle.name}`}
        </Button>
      )}
    </div>
  )
}

function MiniStat({ label, value, onRoll }: { label: string; value: string; onRoll?: (advantage: AdvantageMode) => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
      {onRoll ? <RollButton value={value} onRoll={onRoll} size="sm" /> : <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{value}</span>}
    </div>
  )
}

function LockedValue({ value, onRoll }: { value: string; onRoll?: () => void }): JSX.Element {
  if (onRoll) {
    return <RollButton value={value || '—'} onRoll={onRoll} supportsAdvantage={false} size="sm" />
  }
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
