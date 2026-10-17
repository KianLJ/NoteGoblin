import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import {
  ABILITY_DESCRIPTIONS,
  SKILLS,
  abilityModifier,
  activeAsiSlotChoices,
  DAMAGE_TYPES,
  exhaustionEffectsDescription,
  formatModifier,
  hitDicePools,
  type Ability,
  type AbilityScores,
  type CharacterSheetData,
  type ClassLevel,
  type DeathSaves,
  type HitDicePool,
  type SkillName
} from '@shared/dnd5e'
import { FEATS } from '@shared/compendium'
import type { DerivedCharacter } from '@shared/content/engine'
import { deriveSheet, effectiveScores, skillModeOf, skillOf, skillProficiencyOf } from '@shared/content/sheet'
import { restResources } from '@shared/content/resourceMath'
import { useTerms } from '../../content/terms'
import { useActivePackRegistry } from '../../content/pickerContent'
import { XIcon } from '../../../ui/icons'
import { PackTraitsSection } from './PackTraitsSection'
import { useDerivedSheet } from '../useDerivedSheet'
import { Button } from '../../../ui/Button'
import { Modal } from '../../../ui/Modal'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { HoverDetailCard } from '../HoverDetailCard'
import { useSheetRoller } from '../../dice/useSheetRoller'
import { RollButton } from '../../dice/RollButton'
import { CombatTab } from './CombatTab'
import { playSfx } from '../../audio/soundEffects'
import { ChoiceList, useChoiceEditor } from '../ChoiceCards'
import { usePickerContent } from '../../content/pickerContent'
import { AbilityIcon, ExhaustionIcon, HeartIcon, InitiativeIcon, MoonIcon, PencilIcon, ShieldIcon, SpeedIcon, StarIcon, SunIcon } from './icons'
import { applyDamage, applyHealing, hpAfterMaxChange } from '@shared/hitPoints'

interface OverviewDraft {
  race: string
  classes: ClassLevel[]
  experiencePoints: number
  abilityScores: AbilityScores
  savingThrowProficiencies: Ability[]
  skillProficiencies: Partial<Record<SkillName, 'proficient' | 'expertise'>>
  otherProficiencies: string
  currentHp: number
  tempHp: number
  inspiration: boolean
  deathSaves: DeathSaves
  hitDiceUsed: Record<string, number>
  exhaustionLevel: number
  portraitDataUrl: string | null
}

const PORTRAIT_MAX_DIMENSION = 256

/** Downscales/re-encodes an uploaded image client-side before it's stored inline in the sheet, so a large photo doesn't bloat every sheet read/write/sync. */
function readPortraitFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not read image.'))
      img.onload = () => {
        const scale = Math.min(1, PORTRAIT_MAX_DIMENSION / Math.max(img.width, img.height))
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

interface OverviewTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  /** Fired when a class's level is raised (not lowered) — CharacterSheetEditor pops LevelUpPopup, a shortcut for whatever the level you just crossed unlocked. Purely a convenience: the same choice is always available inline in Combat's Features tab (see FeaturesTab.tsx) whether or not this fires. */
  onLevelUp?: (className: string, fromLevel: number, toLevel: number) => void
  readOnly?: boolean
  /** Threaded down to the roll buttons here and in CombatTab — see CharacterSheetEditor.tsx's doc comment. */
  sessionId?: string | null
}

const CUSTOM_CLASS = '__custom__'
const CUSTOM_RACE = '__custom__'

function resetAllSlots(slots: Record<number, { total: number; used: number }>): Record<number, { total: number; used: number }> {
  return Object.fromEntries(Object.entries(slots).map(([lvl, s]) => [lvl, { ...s, used: 0 }]))
}

export function OverviewTab({ character, onSave, onLevelUp, readOnly, sessionId = null }: OverviewTabProps): JSX.Element {
  // SRD classes/species plus whatever the active content packs add (see pickerContent.ts).
  const picker = usePickerContent()
  // Labels go through the active packs' terminology (a pack can rename Spell Slots, Charisma, Subclass…).
  const terms = useTerms()
  const CLASS_NAMES = picker.classes.map((c) => c.name)
  const RACES = picker.races
  const { rollCheck } = useSheetRoller(sessionId, character.name)
  const [customRows, setCustomRows] = useState<Set<number>>(new Set())
  const [shortRestOpen, setShortRestOpen] = useState(false)
  const [abilityEditMode, setAbilityEditMode] = useState(false)
  // Set right after picking a species with its own trait-level choices
  // (Human's Skillful/Versatile, or Elf/Gnome/Tiefling's lineage) via the
  // Race dropdown below — cleared once completed. Deliberately not derived
  // from persisted state (there's no reliable way to tell "a Versatile feat
  // from Human" apart from "an Origin feat from Background" once saved), so
  // this only ever prompts right after a race change in this same session,
  // not on every future reopen of the sheet.
  const [pendingRaceExtras, setPendingRaceExtras] = useState<string | null>(null)
  const [draft, setDraft] = useAutosaveDraft<OverviewDraft>(
    {
      race: character.race,
      classes: character.classes,
      experiencePoints: character.experiencePoints,
      abilityScores: character.abilityScores,
      savingThrowProficiencies: character.savingThrowProficiencies,
      skillProficiencies: character.skillProficiencies,
      otherProficiencies: character.otherProficiencies,
      currentHp: character.currentHp,
      tempHp: character.tempHp,
      inspiration: character.inspiration,
      deathSaves: character.deathSaves,
      hitDiceUsed: character.hitDiceUsed,
      exhaustionLevel: character.exhaustionLevel,
      portraitDataUrl: character.portraitDataUrl
    },
    onSave,
    readOnly
  )

  function patch(fields: Partial<OverviewDraft>): void {
    setDraft((prev) => ({ ...prev, ...fields }))
  }

  /** Changing species via the dropdown actually changes derived stats (Speed, Racial Traits — see computeSpeed/FeaturesTab.tsx) since it's now a real match against RACES instead of a freeform string prone to typos. If the new species has its own trait-level choices, this also opens the inline prompt below the header instead of leaving them unset. */
  function handleRaceChange(newRace: { id: string; name: string } | null): void {
    patch({ race: newRace?.name ?? '' })
    // Any species whose traits grant a choice (Human's Skillful/Versatile, a lineage, a homebrew species' pick).
    const species = newRace ? derivedSheet.registry.all('species').find((sp) => sp.def.name.toLowerCase() === newRace.name.toLowerCase()) : undefined
    const hasChoices = !!species?.def.traits.some((t) => t.effects.some((e) => e.do.kind === 'grantChoice'))
    setPendingRaceExtras(newRace && hasChoices ? newRace.name : null)
    // Leaving a lineage species behind means whatever it granted no longer
    // applies — clears the stored choice so FeaturesTab.tsx's lineage-spell
    // prompt stops appearing for a species the character no longer has.
    // Already-granted cantrips/spells stay on the sheet rather than being
    // stripped back out, same as removing a class doesn't claw back what it
    // granted either.
    if (character.raceLineageChoice && character.raceLineageChoice.raceId !== newRace?.id) {
      onSave({ raceLineageChoice: null })
    }
  }

  async function handlePortraitFile(file: File): Promise<void> {
    const dataUrl = await readPortraitFile(file)
    patch({ portraitDataUrl: dataUrl })
    onSave({ portraitDataUrl: dataUrl })
  }

  // Every derived number below comes from the content engine (see
  // shared/content/sheet.ts), run over the saved sheet with this tab's
  // unsaved draft merged on top — so a feat, item, buff or condition that
  // changes a stat cascades into max HP, AC, initiative, saves, skills and
  // passive perception, and edits show up before they're saved. The
  // ability score *input fields* still bind to the raw draft values — only
  // derived, read-only numbers use the engine's.
  const liveSheet = useMemo(() => ({ ...character, ...draft }), [character, draft])
  const derivedSheet = useDerivedSheet(liveSheet)
  const { derived } = derivedSheet
  const effScores = effectiveScores(derived)
  const abilityCheckAdvantage = derived.checkModes
  const initiativeAdvantage = derived.initiativeMode
  const maxHp = derived.maxHp

  /** Max HP for the sheet as it would be with these draft fields — used for the HP-gained-on-level-up delta. */
  function maxHpWith(fields: Partial<OverviewDraft>): number {
    return deriveSheet({ ...liveSheet, ...fields }).derived.maxHp
  }

  /** Raising a class's level bumps current HP by however much the (fully derived) max just went up, matching the 5e rule that HP gained on level-up is immediate, not just a higher ceiling. Whatever else the new level grants (class features, an ASI/feat slot, a subclass-choice slot) just appears on its own in Combat's Features tab — see FeaturesTab.tsx, which derives all of that live from class/level instead of requiring it to be accepted here. */
  function updateClass(index: number, fields: Partial<ClassLevel>): void {
    if (!draft.classes[index]) {
      patch({ classes: [...draft.classes, { className: '', level: 1, ...fields }] })
      return
    }
    const prev = draft.classes[index]
    const nextClasses = draft.classes.map((c, i) => (i === index ? { ...c, ...fields } : c))
    const updates: Partial<OverviewDraft> = { classes: nextClasses }

    // Any change that moves max HP (a level up, a level down, a different class) moves current HP with it.
    if (fields.level !== undefined || fields.className !== undefined) {
      const newMax = maxHpWith({ classes: nextClasses })
      if (newMax !== maxHp) updates.currentHp = hpAfterMaxChange(draft.currentHp, maxHp, newMax)
    }
    if (fields.level !== undefined && fields.level > prev.level) {
      playSfx('levelUp')
      onLevelUp?.(prev.className || fields.className || '', prev.level, fields.level)
    }

    patch(updates)
  }

  /** Any ability score can change here, but usually only Con affects max HP — computing the delta unconditionally (instead of special-casing Con) keeps this simple, and it's a no-op when the change doesn't touch max HP. This is what makes an ability score improvement to Con retroactively raise HP, per the 5e rule. */
  function updateAbilityScore(ability: Ability, value: number): void {
    const prevMax = maxHp
    const nextScores = { ...draft.abilityScores, [ability]: value }
    const newMax = maxHpWith({ abilityScores: nextScores })
    patch({ abilityScores: nextScores, currentHp: hpAfterMaxChange(draft.currentHp, prevMax, newMax) })
  }

  /** Every active bonus currently bumping one ability score — an ASI slot's flat increase, or a feat's fixed/chosen ability bonus — used both for the little hover tag on each ability card and for the removable list shown in edit mode. Removing one here deletes the underlying asiSlotChoices record (same effect as removing it from Features), since that record is the only place this bump lives. */
  function abilityBonusSources(ability: Ability): { slotId: string; label: string; amount: number }[] {
    const sources: { slotId: string; label: string; amount: number }[] = []
    for (const slot of activeAsiSlotChoices(draft.classes, character.asiSlotChoices)) {
      if (slot.kind === 'ability' && slot.abilityIncreases?.[ability]) {
        sources.push({ slotId: slot.id, label: `Ability Score Improvement (Lv ${slot.level})`, amount: slot.abilityIncreases[ability]! })
      } else if (slot.kind === 'feat') {
        const feat = FEATS.find((f) => f.id === slot.featId)
        for (const effect of feat?.effects ?? []) {
          if (effect.kind === 'abilityScore' && effect.ability === ability) sources.push({ slotId: slot.id, label: feat!.name, amount: effect.amount })
          else if (effect.kind === 'abilityScoreChoice' && slot.chosenAbility === ability) sources.push({ slotId: slot.id, label: feat!.name, amount: effect.amount })
        }
      }
    }
    return sources
  }

  function removeAbilityBonusSource(slotId: string): void {
    onSave({ asiSlotChoices: character.asiSlotChoices.filter((s) => s.id !== slotId) })
  }

  function toggleSave(ability: Ability): void {
    patch({
      savingThrowProficiencies: draft.savingThrowProficiencies.includes(ability)
        ? draft.savingThrowProficiencies.filter((a) => a !== ability)
        : [...draft.savingThrowProficiencies, ability]
    })
  }

  function cycleSkillProficiency(skill: SkillName): void {
    const current = draft.skillProficiencies[skill] ?? 'none'
    const next = current === 'none' ? 'proficient' : current === 'proficient' ? 'expertise' : 'none'
    const nextProficiencies = { ...draft.skillProficiencies }
    if (next === 'none') delete nextProficiencies[skill]
    else nextProficiencies[skill] = next
    patch({ skillProficiencies: nextProficiencies })
  }

  /** Every resource (Rage, Ki, Bardic Inspiration, item charges, homebrew pools…) that refills on this rest, reset to 0 used — merged over whatever's still in progress for the resources that DON'T refill on this rest, not a blanket wipe. */
  function resetResourcesFor(rest: 'short' | 'long'): Pick<CharacterSheetData, 'resourceUsed' | 'resourceTemp'> {
    // Short-rest partial regain for long-rest pools and clearing temporary points come from the engine's resources (restResources).
    return restResources(rest, derived.resources, { resourceUsed: character.resourceUsed, resourceTemp: character.resourceTemp ?? {} })
  }

  /** Long rest: full HP, all spell slots refresh, death saves clear, all spent hit dice are fully restored (a house-rule simplification of the 5e default, which only recovers half), and every resource that recharges on a short OR long rest clears. Short rest clears death saves, refreshes Warlock Pact Magic and any short-recharge resources (Second Wind, Channel Divinity, etc.), and opens the hit-die picker below so the player can choose which dice to spend. Neither one touches temp HP, which RAW only goes away when it's reduced to 0, not on a rest. */
  function longRest(): void {
    playSfx('longRest')
    const updates = { currentHp: maxHp, deathSaves: { successes: 0, failures: 0 }, hitDiceUsed: {} }
    patch(updates)
    onSave({ ...updates, spellSlots: resetAllSlots(character.spellSlots), ...resetResourcesFor('long') })
  }

  function shortRest(): void {
    playSfx('shortRest')
    patch({ deathSaves: { successes: 0, failures: 0 } })
    const isWarlock = draft.classes.some((c) => c.className.toLowerCase() === 'warlock')
    onSave({
      deathSaves: { successes: 0, failures: 0 },
      ...resetResourcesFor('short'),
      ...(isWarlock ? { spellSlots: resetAllSlots(character.spellSlots) } : {})
    })
    setShortRestOpen(true)
  }

  function rollHitDie(pool: HitDicePool): void {
    const conMod = derived.abilities.con.mod
    const roll = Math.floor(Math.random() * pool.hitDie) + 1
    const healed = Math.max(1, roll + conMod)
    const nextHp = Math.min(maxHp, draft.currentHp + healed)
    const nextUsed = { ...draft.hitDiceUsed, [pool.className]: pool.used + 1 }
    patch({ currentHp: nextHp, hitDiceUsed: nextUsed })
    onSave({ currentHp: nextHp, hitDiceUsed: nextUsed })
  }

  function setPrimaryClass(name: string): void {
    if (draft.classes.length === 0) patch({ classes: [{ className: name, level: 1 }] })
    else updateClass(0, { className: name })
  }

  const pb = derived.proficiencyBonus
  // The 18 SRD skills in their usual order, then any skill a content pack adds (Arcane Sense…) — proficiency for
  // those is stored by display name like any other skill.
  const skillRows: { id: SkillName; ability: Ability }[] = [
    ...SKILLS,
    ...Object.values(derived.skills)
      .filter((sk) => !SKILLS.some((k) => k.id.toLowerCase() === sk.name.toLowerCase()))
      .map((sk) => ({ id: sk.name as SkillName, ability: sk.ability }))
  ]
  const primary = draft.classes[0]
  const additionalClasses = draft.classes.slice(1)
  const primaryIsCustom = customRows.has(0) || (!!primary && primary.className.trim() !== '' && !CLASS_NAMES.includes(primary.className))
  const currentRace = RACES.find((r) => r.name.toLowerCase() === draft.race.trim().toLowerCase())
  const raceIsCustom = draft.race.trim() !== '' && !currentRace

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {draft.exhaustionLevel >= 6 && (
        <div
          className="gb-card"
          style={{
            padding: 'var(--space-3)',
            borderColor: 'var(--danger)',
            background: 'color-mix(in srgb, var(--danger) 12%, var(--bg-surface))',
            color: 'var(--danger)',
            fontWeight: 600,
            textAlign: 'center'
          }}
        >
          Exhaustion 6 — {character.name || 'This character'} has died.
        </div>
      )}
      <Modal open={shortRestOpen} onClose={() => setShortRestOpen(false)} width={380}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18 }}>Short Rest</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                Spend {terms.t('hitDice').toLowerCase()} to heal — roll and add your {terms.ability('con', 'Constitution')} modifier. Death saves are already cleared.
              </p>
            </div>
            {hitDicePools(draft.classes, draft.hitDiceUsed).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No recognized class to draw hit dice from.</p>
            ) : (
              hitDicePools(draft.classes, draft.hitDiceUsed).map((pool) => {
                const remaining = pool.total - pool.used
                return (
                  <div key={pool.className} className="gb-card" style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13 }}>
                      {pool.className} — d{pool.hitDie}{' '}
                      <span style={{ color: 'var(--text-muted)' }}>
                        ({remaining}/{pool.total} left)
                      </span>
                    </span>
                    <Button variant="secondary" disabled={remaining <= 0} onClick={() => rollHitDie(pool)} style={{ fontSize: 12 }}>
                      Roll d{pool.hitDie}
                    </Button>
                  </div>
                )
              })
            )}
            <Button variant="primary" onClick={() => setShortRestOpen(false)}>
              Done
            </Button>
          </div>
      </Modal>

      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <label
          title={readOnly ? undefined : 'Click to upload a portrait'}
          style={{
            width: 72,
            height: 72,
            flexShrink: 0,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface-raised)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: readOnly ? 'default' : 'pointer'
          }}
        >
          {draft.portraitDataUrl ? (
            <img src={draft.portraitDataUrl} alt="Character portrait" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 24, color: 'var(--text-muted)' }}>?</span>
          )}
          {!readOnly && (
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handlePortraitFile(file)
                e.target.value = ''
              }}
            />
          )}
        </label>

        <div
          style={{
            display: 'inline-flex',
            alignSelf: 'flex-start',
            maxWidth: '100%',
            width: 'fit-content',
            gap: 'var(--space-4)',
            alignItems: 'center',
            flexWrap: 'wrap',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--bg-surface-raised)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)'
          }}
        >
        <HeaderField label={terms.t('species', 'Race')}>
          <select
            className="gb-input"
            style={boxedInputStyle}
            value={raceIsCustom ? CUSTOM_RACE : (currentRace?.name ?? '')}
            onChange={(e) => {
              const v = e.target.value
              if (v === CUSTOM_RACE) {
                patch({ race: draft.race || 'Custom' })
                setPendingRaceExtras(null)
              } else {
                handleRaceChange(RACES.find((r) => r.name === v) ?? null)
              }
            }}
          >
            <option value="">Select…</option>
            {RACES.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
            <option value={CUSTOM_RACE}>Custom…</option>
          </select>
        </HeaderField>
        {raceIsCustom && (
          <HeaderField label={`${terms.t('species', 'Race')} Name`}>
            <input
              className="gb-input"
              style={boxedInputStyle}
              value={draft.race}
              onChange={(e) => patch({ race: e.target.value })}
              placeholder="Species name"
              autoFocus
            />
          </HeaderField>
        )}
        {pendingRaceExtras && !readOnly && (
          <div style={{ flexBasis: '100%' }}>
            <RaceExtrasPrompt
              raceName={pendingRaceExtras}
              character={character}
              onSave={onSave}
              onDone={() => setPendingRaceExtras(null)}
            />
          </div>
        )}

        <HeaderField label="Class">
          <select
            className="gb-input"
            style={boxedInputStyle}
            value={primaryIsCustom ? CUSTOM_CLASS : primary?.className ?? ''}
            onChange={(e) => {
              const v = e.target.value
              if (v === CUSTOM_CLASS) {
                setCustomRows((prev) => new Set(prev).add(0))
                setPrimaryClass('')
              } else {
                setCustomRows((prev) => {
                  const next = new Set(prev)
                  next.delete(0)
                  return next
                })
                setPrimaryClass(v)
              }
            }}
          >
            <option value="">Select…</option>
            {CLASS_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={CUSTOM_CLASS}>Custom…</option>
          </select>
        </HeaderField>
        {primaryIsCustom && (
          <HeaderField label="Class Name">
            <input
              className="gb-input"
              style={boxedInputStyle}
              value={primary?.className ?? ''}
              onChange={(e) => setPrimaryClass(e.target.value)}
              placeholder="Class name"
              autoFocus
            />
          </HeaderField>
        )}
        <HeaderField label="Level">
          <input
            type="number"
            min={1}
            max={20}
            className="gb-input"
            style={{ ...boxedInputStyle, width: 52 }}
            value={primary?.level ?? 1}
            onChange={(e) => updateClass(0, { level: Number(e.target.value) })}
          />
        </HeaderField>
        <HeaderField label={terms.t('subclass')}>
          <SubclassField
            className={primary?.className ?? ''}
            level={primary?.level ?? 1}
            value={primary?.subclass ?? ''}
            onChange={(v) => updateClass(0, { subclass: v })}
            style={boxedInputStyle}
          />
        </HeaderField>

        <Divider />

        <HeaderField label="Experience">
          <input
            type="number"
            min={0}
            className="gb-input"
            style={{ ...boxedInputStyle, width: 80 }}
            value={draft.experiencePoints}
            onChange={(e) => patch({ experiencePoints: Number(e.target.value) })}
          />
        </HeaderField>
        <VitalStat label={terms.t('proficiencyBonus')} value={formatModifier(pb)} />
        <VitalStat label="Perception" value={String(derived.skills.perception?.passive ?? 10 + derived.abilities.wis.mod)} />

        <button
          type="button"
          onClick={() => !readOnly && patch({ inspiration: !draft.inspiration })}
          disabled={readOnly}
          title="Inspiration — granted by the DM, spend it for advantage on one roll"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: readOnly ? 'default' : 'pointer'
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{terms.t('inspiration')}</span>
          <StarIcon size={22} filled={draft.inspiration} style={{ color: draft.inspiration ? 'var(--accent)' : 'var(--text-muted)' }} />
        </button>

        <HeaderField label="Exhaustion">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <HoverDetailCard
              title={`Exhaustion ${draft.exhaustionLevel}`}
              subtitle={draft.exhaustionLevel >= 6 ? 'Death' : draft.exhaustionLevel <= 0 ? 'No exhaustion' : undefined}
              fields={[]}
              description={exhaustionEffectsDescription(draft.exhaustionLevel)}
            >
              <ExhaustionIcon style={{ color: draft.exhaustionLevel > 0 ? 'var(--danger)' : 'var(--text-muted)', cursor: 'default' }} />
            </HoverDetailCard>
            <button
              type="button"
              disabled={readOnly || draft.exhaustionLevel <= 0}
              onClick={() => {
                const next = Math.max(0, draft.exhaustionLevel - 1)
                patch({ exhaustionLevel: next })
                onSave({ exhaustionLevel: next })
              }}
              className="gb-input"
              style={{ ...boxedInputStyle, width: 24, padding: 0, cursor: readOnly ? 'default' : 'pointer' }}
            >
              −
            </button>
            <span style={{ fontSize: 13, width: 16, textAlign: 'center' }}>{draft.exhaustionLevel}</span>
            <button
              type="button"
              disabled={readOnly || draft.exhaustionLevel >= 6}
              onClick={() => {
                const next = Math.min(6, draft.exhaustionLevel + 1)
                patch({ exhaustionLevel: next })
                onSave({ exhaustionLevel: next })
              }}
              className="gb-input"
              style={{ ...boxedInputStyle, width: 24, padding: 0, cursor: readOnly ? 'default' : 'pointer' }}
            >
              +
            </button>
          </div>
        </HeaderField>

        <Divider />

        <VitalStat
          label={terms.t('armorClass')}
          value={String(derived.armorClass)}
          icon={<ShieldIcon size={22} style={{ color: 'var(--accent)' }} />}
          accent
          large
        />
        <VitalStat
          label={terms.t('initiative')}
          value={formatModifier(derived.initiative)}
          icon={<InitiativeIcon />}
          large
          badge={initiativeAdvantage && <AdvantageTag kind={initiativeAdvantage} label="Initiative" />}
        />
        <VitalStat
          label={terms.t('speed')}
          value={`${derived.speeds.walk ?? 0} ft`}
          icon={<SpeedIcon />}
          large
        />

        <Divider />

        <div
          className="gb-card"
          style={{
            padding: 'var(--space-2) var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderColor: 'var(--accent)',
            minWidth: 150
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <HeartIcon size={16} style={{ color: 'var(--danger)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Hit Points</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
            <input
              type="number"
              className="gb-input"
              style={{ width: 64, textAlign: 'center', fontSize: 18, fontWeight: 700, padding: '2px 4px' }}
              value={draft.currentHp}
              onChange={(e) => patch({ currentHp: Number(e.target.value) })}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>/</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', minWidth: 36, textAlign: 'center' }}>{maxHp}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <HeartIcon size={11} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Temp</span>
            <input
              type="number"
              className="gb-input"
              style={{ width: 40, textAlign: 'center', fontSize: 11, padding: '1px 4px' }}
              value={draft.tempHp}
              onChange={(e) => patch({ tempHp: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          {!readOnly && <DamageHealControl onDamage={(n) => patch(applyDamage(draft, n))} onHeal={(n) => patch(applyHealing(draft, n, maxHp))} />}
        </div>

        {draft.currentHp <= 0 && (
          <div className="gb-card" style={{ padding: 'var(--space-2) var(--space-3)' }}>
            <div className="gb-label" style={{ marginBottom: 4 }}>
              Death Saves
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <DeathSaveRow
                label="Successes"
                count={draft.deathSaves.successes}
                onChange={(n) => patch({ deathSaves: { ...draft.deathSaves, successes: n } })}
              />
              <DeathSaveRow
                label="Failures"
                count={draft.deathSaves.failures}
                onChange={(n) => patch({ deathSaves: { ...draft.deathSaves, failures: n } })}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <RestButton onClick={shortRest} icon={<SunIcon />}>
            Short
          </RestButton>
          <RestButton onClick={longRest} icon={<MoonIcon />}>
            Long
          </RestButton>
        </div>

        <Divider />

        <ResistancesSection character={character} derived={derived} onSave={onSave} readOnly={readOnly} />
        </div>
      </div>

      {/* What the content packs add (ability aliases, counters, stats, conditions…) — its own row, each in its own card. */}
      <PackTraitsSection character={character} derived={derived} onSave={onSave} readOnly={readOnly} />

      {additionalClasses.length > 0 && (
        <div>
          <div className="gb-label">Additional Classes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {additionalClasses.map((c, offset) => {
              const i = offset + 1
              const isCustom = customRows.has(i) || (c.className.trim() !== '' && !CLASS_NAMES.includes(c.className))
              const selectValue = isCustom ? CUSTOM_CLASS : c.className
              return (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    className="gb-input"
                    style={{ width: 150 }}
                    value={selectValue}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === CUSTOM_CLASS) {
                        setCustomRows((prev) => new Set(prev).add(i))
                        updateClass(i, { className: '' })
                      } else {
                        setCustomRows((prev) => {
                          const next = new Set(prev)
                          next.delete(i)
                          return next
                        })
                        updateClass(i, { className: v })
                      }
                    }}
                  >
                    <option value="">Select class…</option>
                    {CLASS_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value={CUSTOM_CLASS}>Custom…</option>
                  </select>
                  {isCustom && (
                    <input
                      className="gb-input"
                      style={{ width: 130 }}
                      value={c.className}
                      onChange={(e) => updateClass(i, { className: e.target.value })}
                      placeholder="Class name"
                      autoFocus
                    />
                  )}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className="gb-input"
                    style={{ width: 56 }}
                    value={c.level}
                    onChange={(e) => updateClass(i, { level: Number(e.target.value) })}
                  />
                  <SubclassField
                    className={c.className}
                    level={c.level}
                    value={c.subclass ?? ''}
                    onChange={(v) => updateClass(i, { subclass: v })}
                    style={{ width: 150 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nextClasses = draft.classes.filter((_, idx) => idx !== i)
                      patch({ classes: nextClasses, currentHp: hpAfterMaxChange(draft.currentHp, maxHp, maxHpWith({ classes: nextClasses })) })
                    }}
                    style={removeBtnStyle}
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        className="gb-btn gb-btn--ghost"
        style={{ alignSelf: 'flex-start', fontSize: 12 }}
        onClick={() => patch({ classes: [...draft.classes, { className: '', level: 1 }] })}
      >
        + Add Class (Multiclass)
      </button>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div className="gb-label" style={{ margin: 0 }}>
            Ability Scores
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setAbilityEditMode((v) => !v)}
              title={abilityEditMode ? 'Done editing' : 'Edit ability scores'}
              style={{
                background: 'none',
                border: 'none',
                color: abilityEditMode ? 'var(--accent-hover)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <PencilIcon />
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-2)' }}>
          {terms.abilities.map(({ id, label }) => {
            const bonuses = abilityBonusSources(id)
            const bonusExtra =
              bonuses.length > 0
                ? { label: 'Bonuses', value: bonuses.map((b) => `+${b.amount} — ${b.label}`).join('; ') }
                : undefined
            return (
              <HoverDetailCard key={id} title={label} fields={[]} description={ABILITY_DESCRIPTIONS[id]} extra={bonusExtra}>
                <div className="gb-card" style={{ padding: 'var(--space-2)', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    <AbilityIcon ability={id} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{terms.abilityShort(id, label)}</span>
                    {abilityCheckAdvantage[id] && <AdvantageTag kind={abilityCheckAdvantage[id]!} label={`${label} checks`} />}
                  </div>
                  {abilityEditMode ? (
                    <input
                      type="number"
                      min={1}
                      max={30}
                      className="gb-input"
                      style={{ textAlign: 'center', marginTop: 4 }}
                      value={draft.abilityScores[id]}
                      onChange={(e) => updateAbilityScore(id, Number(e.target.value))}
                    />
                  ) : (
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4, cursor: 'default' }}>
                      {effScores[id]}
                      {bonuses.length > 0 && (
                        <span
                          style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', verticalAlign: 'super', marginLeft: 2 }}
                          title={bonusExtra?.value}
                        >
                          +{bonuses.reduce((sum, b) => sum + b.amount, 0)}
                        </span>
                      )}
                    </div>
                  )}
                  {readOnly ? (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{formatModifier(abilityModifier(effScores[id]))}</div>
                  ) : (
                    <div style={{ marginTop: 4 }}>
                      <RollButton
                        value={formatModifier(abilityModifier(effScores[id]))}
                        size="sm"
                        onRoll={(advantage) =>
                          rollCheck(`${label} Check`, abilityModifier(effScores[id]), {
                            advantage: advantage !== 'normal' ? advantage : (abilityCheckAdvantage[id] ?? 'normal')
                          })
                        }
                      />
                    </div>
                  )}
                  {abilityEditMode && bonuses.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                      {bonuses.map((b) => (
                        <div
                          key={b.slotId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 4,
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            background: 'var(--bg-sunken)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '2px 4px'
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            +{b.amount} {b.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAbilityBonusSource(b.slotId)}
                            title="Remove"
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0 }}
                          >
                            <XIcon size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </HoverDetailCard>
            )
          })}
        </div>
      </div>

      <div>
        <div className="gb-label">{terms.t('savingThrows')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-2)' }}>
          {terms.abilities.map(({ id, label }) => {
            const proficient = !!derived.saves[id].proficiency
            const bonus = derived.saves[id].bonus
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  padding: '6px 2px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${proficient ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  background: proficient ? 'var(--accent-subtle)' : 'transparent'
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleSave(id)}
                  title={proficient ? 'Remove save proficiency' : 'Mark as a proficient save'}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    color: proficient ? 'var(--accent-hover)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    cursor: readOnly ? 'default' : 'pointer'
                  }}
                  disabled={readOnly}
                >
                  {terms.abilityShort(id, label)}
                  {derived.saves[id].mode && <AdvantageTag kind={derived.saves[id].mode!} label={`${label} saves`} />}
                </button>
                {readOnly ? (
                  <span style={{ fontSize: 14, fontWeight: 700, color: proficient ? 'var(--accent-hover)' : 'var(--text-primary)' }}>
                    {formatModifier(bonus)}
                  </span>
                ) : (
                  <RollButton
                    value={formatModifier(bonus)}
                    size="sm"
                    onRoll={(advantage) =>
                      rollCheck(`${label} Saving Throw`, bonus, {
                        advantage: advantage !== 'normal' ? advantage : (derived.saves[id].mode ?? 'normal')
                      })
                    }
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Skills take only the width their longest row needs (so the proficiency dot and roll button sit right after the
          names instead of out at a fixed column edge); Combat gets everything else. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: 'var(--space-4)', alignItems: 'start' }}>
        <div>
          <div className="gb-label">{terms.t('skills')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'max-content auto auto', rowGap: 5, columnGap: 'var(--space-2)', alignItems: 'center' }}>
            {skillRows.map(({ id, ability }) => {
              const bonus = skillOf(derived, id)?.bonus ?? derived.abilities[ability].mod
              return (
                <div key={id} style={{ display: 'contents' }}>
                  <span style={{ fontSize: 12 }}>
                    {id} <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>({ability.toUpperCase()})</span>
                    {skillModeOf(derived, id) && <AdvantageTag kind={skillModeOf(derived, id)!} label={`${id} checks`} />}
                  </span>
                  <ProficiencyDot value={skillProficiencyOf(derived, id) ?? 'none'} onClick={() => cycleSkillProficiency(id)} />
                  {readOnly ? (
                    <span style={{ fontSize: 12, width: 28, textAlign: 'right' }}>{formatModifier(bonus)}</span>
                  ) : (
                    <RollButton
                      value={formatModifier(bonus)}
                      size="sm"
                      onRoll={(advantage) =>
                        rollCheck(`${id} Check`, bonus, { advantage: advantage !== 'normal' ? advantage : (skillModeOf(derived, id) ?? 'normal') })
                      }
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <div className="gb-label">Combat</div>
          <CombatTab character={character} onSave={onSave} readOnly={readOnly} sessionId={sessionId} />
        </div>
      </div>

      <Field label="Other Proficiencies &amp; Languages">
        <textarea
          className="gb-input"
          style={{ minHeight: 70, resize: 'vertical' }}
          value={draft.otherProficiencies}
          onChange={(e) => patch({ otherProficiencies: e.target.value })}
          placeholder="Armor, weapons, tools, languages…"
        />
      </Field>
    </div>
  )
}

const RESISTANCE_ROWS: { key: 'damageResistances' | 'damageVulnerabilities' | 'damageImmunities'; label: string }[] = [
  { key: 'damageResistances', label: 'Resistances' },
  { key: 'damageVulnerabilities', label: 'Vulnerabilities' },
  { key: 'damageImmunities', label: 'Immunities' }
]

const DERIVED_RELATION: Record<(typeof RESISTANCE_ROWS)[number]['key'], keyof DerivedCharacter['damageRelations']> = {
  damageResistances: 'resistances',
  damageVulnerabilities: 'vulnerabilities',
  damageImmunities: 'immunities'
}

/** Freeform damage-type tags per row, written straight through onSave (a discrete add/remove click, not something that needs debouncing) — plus a non-removable tag for whatever the content engine grants on top right now (Rage's B/P/S resistance, a species trait, an item, a homebrew feature). Those are shown separately from the stored list since they come from the build, not a permanent trait to save. */
function ResistancesSection({
  character,
  derived,
  onSave,
  readOnly
}: {
  character: CharacterSheet
  derived: DerivedCharacter
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
}): JSX.Element {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // The SRD's damage types plus any the active packs add (vocabulary.damageTypes).
  const { registry } = useActivePackRegistry()
  const damageTypes = useMemo(() => {
    const names = [...DAMAGE_TYPES, ...registry.vocabulary.damageTypes.map((d) => registry.terminology[`damage.${d.id}`] ?? d.name)]
    return names.filter((n, i) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i)
  }, [registry])
  const grantedFor = (key: (typeof RESISTANCE_ROWS)[number]['key']): string[] =>
    derived.damageRelations[DERIVED_RELATION[key]].filter((t) => !character[key].some((s) => s.toLowerCase() === t.toLowerCase()))

  function addTagValue(key: (typeof RESISTANCE_ROWS)[number]['key'], rawValue: string): void {
    const value = rawValue.trim()
    if (!value || readOnly) return
    const current = character[key]
    if (current.some((t) => t.toLowerCase() === value.toLowerCase())) return
    onSave({ [key]: [...current, value] })
    setDrafts((prev) => ({ ...prev, [key]: '' }))
  }

  function addTag(key: (typeof RESISTANCE_ROWS)[number]['key']): void {
    addTagValue(key, drafts[key] ?? '')
  }

  function removeTag(key: (typeof RESISTANCE_ROWS)[number]['key'], value: string): void {
    onSave({ [key]: character[key].filter((t) => t !== value) })
  }

  return (
    <div className="gb-card" style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', flexDirection: 'column', maxWidth: 340 }}>
      {RESISTANCE_ROWS.map(({ key, label }) => (
        <div
          key={key}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            padding: '5px 0'
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          {character[key].map((tag) => (
            <span key={tag} className="gb-badge" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 8px' }}>
              {tag}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeTag(key, tag)}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, display: 'inline-flex' }}
                  title={`Remove ${tag}`}
                >
                  <XIcon size={10} />
                </button>
              )}
            </span>
          ))}
          {grantedFor(key).map((tag) => (
              <span
                key={`granted:${tag}`}
                className="gb-badge gb-badge--accent"
                style={{ fontSize: 12, padding: '3px 8px' }}
                title="Granted by a feature, item or active buff (e.g. Rage) — not stored on the sheet."
              >
                {tag}
              </span>
            ))}
          {!readOnly && (
            <input
              className="gb-input"
              list={`damage-types-${key}`}
              placeholder="Add…"
              value={drafts[key] ?? ''}
              onChange={(e) => {
                const value = e.target.value
                // A datalist pick fires this same 'input'/onChange event as typing does — no separate "option
                // selected" event exists — so an exact match against the known list is what tells the two apart
                // from an in-progress keystroke, letting a dropdown pick add immediately without needing Enter.
                if (damageTypes.some((t) => t.toLowerCase() === value.toLowerCase())) addTagValue(key, value)
                else setDrafts((prev) => ({ ...prev, [key]: value }))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag(key)
                }
              }}
              style={{ width: 80, marginLeft: 'auto', fontSize: 12, padding: '3px 6px' }}
            />
          )}
          <datalist id={`damage-types-${key}`}>
            {damageTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      ))}
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

/** SRD-backed subclass picker — a dropdown of the real SRD subclass(es) for a recognized class (just one per class, per the SRD's own scope; see shared/compendium.ts), falling back to a freeform text input for an unrecognized/homebrew class name. A legacy or homebrew value that doesn't match any SRD option is kept as an extra "(custom)" option instead of being silently dropped. */
function SubclassField({
  className,
  level,
  value,
  onChange,
  style
}: {
  className: string
  /** This class's current level — gates the dropdown until the class's real subclass-choice level, since normal D&D doesn't let you pick one early. Ignored for homebrew classes (no SRD data to gate against anyway). */
  level: number
  value: string
  onChange: (value: string) => void
  style?: CSSProperties
}): JSX.Element {
  const picker = usePickerContent()
  const cls = picker.classes.find((c) => c.name.toLowerCase() === className.trim().toLowerCase())
  const options = cls ? picker.subclassesFor(cls.name) : []
  if (options.length === 0) {
    return <input className="gb-input" style={style} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Subclass" />
  }
  // Not yet chosen and not yet eligible — normal 5e picks a subclass via
  // the inline chooser that auto-appears in Combat's Features tab once the
  // class reaches subclassLevel (see FeaturesTab.tsx's SubclassChooser),
  // not freely here. Once it's been set (or the eligible level is reached,
  // e.g. an existing character that predates this gate), the field opens
  // back up so a mistaken pick is still correctable.
  if (!value && cls && level < cls.subclassLevel) {
    return (
      <div
        style={{ ...style, padding: '5px 8px', fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}
        title={`Chosen via Level Up at ${cls.name} level ${cls.subclassLevel}`}
      >
        Chosen at level {cls.subclassLevel}
      </div>
    )
  }
  const isKnownOrEmpty = value === '' || options.some((o) => o.name === value)
  return (
    <select className="gb-input" style={style} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select subclass…</option>
      {!isKnownOrEmpty && <option value={value}>{value} (custom)</option>}
      {options.map((o) => (
        <option key={o.id} value={o.name}>
          {o.name}
        </option>
      ))}
    </select>
  )
}

/**
 * Shown right after picking a species with its own trait-level choices via
 * the Race dropdown above (Human's Skillful/Versatile, Elf/Gnome/Tiefling's
 * lineage, or any homebrew species' choices) — the species' choices from
 * the content engine as generic ChoiceCards, saved the same way as on the
 * Features tab (which keeps showing them afterwards). Waits for the race
 * change itself to save first, since the choices come from the saved sheet.
 */
function RaceExtrasPrompt({
  raceName,
  character,
  onSave,
  onDone
}: {
  raceName: string
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  onDone: () => void
}): JSX.Element {
  const setPicks = useChoiceEditor(character, onSave)
  const saved = character.race.trim().toLowerCase() === raceName.trim().toLowerCase()
  const { derived } = deriveSheet(character)
  const speciesChoices = derived.choices.filter((c) => c.sourceKey.startsWith('species:'))

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {saved ? `${raceName} has choices to make — pick them below (they stay on the Features tab too).` : 'Saving…'}
      </div>
      {saved && <ChoiceList choices={speciesChoices} all={derived.choices} onSetPicks={setPicks} />}
      <div>
        <Button variant="primary" onClick={onDone} style={{ fontSize: 12, padding: '4px 10px' }}>
          Done
        </Button>
      </div>
    </div>
  )
}

function HeaderField({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <div className="gb-label" style={{ fontSize: 11, marginBottom: 2 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

/** Read-only — AC/Initiative/Speed/Proficiency/Perception are all fully derived from ability scores/race/classes (see shared/dnd5e's compute* helpers), so there's nothing to type in here. `large` bumps AC/Initiative/Speed up to match how much more often they're glanced at mid-session than Proficiency/Perception. */
function VitalStat({
  label,
  value,
  icon,
  accent,
  large,
  badge
}: {
  label: string
  value: string
  icon?: ReactNode
  accent?: boolean
  large?: boolean
  badge?: ReactNode
}): JSX.Element {
  return (
    <div style={{ textAlign: 'center', minWidth: large ? 60 : 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 2 }}>
        {icon}
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
        {badge}
      </div>
      <div style={{ fontSize: large ? 22 : 16, fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

/** A small green "A" / red "D" badge — advantage or disadvantage currently in effect on a skill, ability check, saving throw, attack roll, or Initiative (from a feat's *Advantage/*Disadvantage effect, or equipped armor's Stealth disadvantage; see effective*Advantage in shared/compendium.ts). Purely informational, same read-only hover-for-detail spirit as the rest of the sheet. */
function AdvantageTag({ kind, label }: { kind: 'advantage' | 'disadvantage'; label: string }): JSX.Element {
  return (
    <span
      title={kind === 'advantage' ? `Advantage on ${label}` : `Disadvantage on ${label}`}
      style={{
        display: 'inline-block',
        marginLeft: 3,
        width: 12,
        height: 12,
        lineHeight: '12px',
        textAlign: 'center',
        fontSize: 9,
        fontWeight: 700,
        borderRadius: '50%',
        color: '#fff',
        background: kind === 'advantage' ? 'var(--success)' : 'var(--danger)'
      }}
    >
      {kind === 'advantage' ? 'A' : 'D'}
    </span>
  )
}

/** Cycles none -> proficient (filled) -> expertise (filled + ring) -> none on each click, instead of a dropdown. */
function ProficiencyDot({ value, onClick }: { value: 'none' | 'proficient' | 'expertise'; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={value === 'none' ? 'Not proficient (click to cycle)' : value === 'proficient' ? 'Proficient' : 'Expertise'}
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: '1.5px solid var(--border-strong)',
        background: value !== 'none' ? 'var(--accent)' : 'transparent',
        boxShadow: value === 'expertise' ? '0 0 0 2px var(--bg-surface), 0 0 0 3.5px var(--accent)' : 'none',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0
      }}
    />
  )
}

function RestButton({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        padding: '6px 10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--accent)',
        background: 'var(--accent-subtle)',
        color: 'var(--accent-hover)',
        cursor: 'pointer',
        whiteSpace: 'nowrap'
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function DeathSaveRow({ label, count, onChange }: { label: string; count: number; onChange: (n: number) => void }): JSX.Element {
  return (
    <div>
      <div className="gb-label" style={{ fontSize: 10 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(count === i ? i - 1 : i)}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '1px solid var(--border-strong)',
              background: i <= count ? 'var(--accent)' : 'transparent',
              cursor: 'pointer'
            }}
          />
        ))}
      </div>
    </div>
  )
}

/** An amount with Damage and Heal: damage comes off temporary HP first, healing stops at max HP. */
function DamageHealControl({ onDamage, onHeal }: { onDamage: (n: number) => void; onHeal: (n: number) => void }): JSX.Element {
  const [amount, setAmount] = useState('')
  const n = Number(amount)
  const valid = Number.isFinite(n) && n > 0
  const act = (fn: (n: number) => void): void => {
    if (!valid) return
    fn(n)
    setAmount('')
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
      <input
        type="number"
        min={1}
        className="gb-input"
        placeholder="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && act(onDamage)}
        style={{ width: 44, textAlign: 'center', fontSize: 11, padding: '1px 4px' }}
        aria-label="Damage or healing amount"
      />
      <button type="button" className="gb-btn gb-btn--secondary" disabled={!valid} onClick={() => act(onDamage)} style={hpButtonStyle} title="Take this much damage (temporary HP first)">
        Damage
      </button>
      <button type="button" className="gb-btn gb-btn--secondary" disabled={!valid} onClick={() => act(onHeal)} style={hpButtonStyle} title="Heal this much (up to max HP)">
        Heal
      </button>
    </div>
  )
}

const hpButtonStyle: CSSProperties = { fontSize: 10, padding: '2px 6px' }

function Divider(): JSX.Element {
  return <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)' }} />
}

const boxedInputStyle: CSSProperties = { fontSize: 14, padding: '5px 8px', width: 110 }

const removeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  padding: '0 6px'
}
