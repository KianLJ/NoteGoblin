import { useState, type CSSProperties, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { sneakAttackDice, type CharacterSheetData, type ClassLevel, type Feature } from '@shared/dnd5e'
import { spellSlotsForClasses } from '@shared/compendium'
import type { DerivedChoice, DerivedResource, DerivedToggle } from '@shared/content/engine'
import { removeTempPoints, resourceRemaining, restoreResource, setResourceUsed, spendResource, type ResourceState } from '@shared/content/resourceMath'
import { deriveSheet, normalizeForActivePacks } from '@shared/content/sheet'
import { Button } from '../../../ui/Button'
import { HoverDetailCard } from '../HoverDetailCard'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { useDerivedSheet } from '../useDerivedSheet'
import { playAbilitySfx } from '../../audio/sfxBoardEngine'
import { SubclassChooser } from '../AsiChoosers'
import { ChoiceList, useChoiceEditor } from '../ChoiceCards'
import { XIcon } from '../../../ui/icons'

interface ResourcesDraft {
  resourceUsed: Record<string, number>
  resourceTemp: Record<string, number>
}

interface FeaturesDraft {
  features: Feature[]
}

interface FeaturesTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
  /** Threaded down from CombatTab, same as elsewhere — lets an "Activate X" click here play (and, at the table, broadcast) that resource's Class Features cue, same as CombatTab's own duplicate of this section. */
  sessionId?: string | null
}

const RECHARGE_LABEL: Record<string, string> = {
  short: 'Short or Long Rest',
  long: 'Long Rest',
  dawn: 'Dawn',
  turn: 'Start of each turn',
  none: "Doesn't recharge"
}

/** A compact, always-hoverable chip — the one visual language every card in this tab shares, whether it's a class resource's name, a racial trait, a curated class feature, a feat, or a resolved ASI slot. Hovering shows the full text; the chip itself never does. */
function InfoChip({
  title,
  subtitle,
  description,
  fields,
  accent,
  onRemove
}: {
  title: string
  subtitle?: string
  description: string
  fields?: { label: string; value: string }[]
  accent?: boolean
  onRemove?: () => void
}): JSX.Element {
  return (
    <HoverDetailCard title={title} subtitle={subtitle} fields={fields ?? []} description={description}>
      <div
        className="gb-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderColor: accent ? 'var(--accent)' : undefined,
          cursor: 'default'
        }}
      >
        <strong style={{ color: accent ? 'var(--accent-hover)' : 'var(--text-primary)', fontSize: 13 }}>{title}</strong>
        {onRemove && (
          <button type="button" onClick={onRemove} style={removeBtnStyle} title="Remove">
            <XIcon size={12} />
          </button>
        )}
      </div>
    </HoverDetailCard>
  )
}

/**
 * Everything you can *do* with your character beyond attacking or casting —
 * class resources, racial traits, class/subclass features, Ability Score
 * Improvements, and feats — as hoverable cards, all derived live from
 * race/class/level every render. Nothing here needs an "add to sheet" step:
 * raising a class's level in Overview is enough for its features to show up
 * on their own, and lowering it makes them disappear the same way, since
 * they're computed from the current level, not stored as accepted history.
 *
 * The one thing that genuinely needs a decision — an Ability Score
 * Improvement slot (pick a flat bump or a feat instead) or a subclass pick
 * — renders as an interactive card with the choice inline, right where the
 * slot appears; once resolved, the choice itself is a compact hover chip
 * like everything else. Choices are stored in `asiSlotChoices` tagged with
 * (className, level), so they're only ever "active" while the class is
 * still at or above that level — see activeAsiSlotChoices in
 * shared/dnd5e.ts. Only a small "Custom Notes" section at the bottom stays
 * fully freeform/manual, for anything outside this automatic system.
 */
export function FeaturesTab({ character, onSave, readOnly, sessionId = null }: FeaturesTabProps): JSX.Element {
  const [resourceDraft, setResourceDraft] = useAutosaveDraft<ResourcesDraft>(
    { resourceUsed: character.resourceUsed, resourceTemp: character.resourceTemp ?? {} },
    onSave,
    readOnly
  )
  const [featureDraft, setFeatureDraft] = useAutosaveDraft<FeaturesDraft>({ features: character.features }, onSave, readOnly)

  // Resources (and the toggles that spend them) come from the content engine — see shared/content/sheet.ts.
  const { derived } = useDerivedSheet(character)
  const resources = derived.resources
  const normalized = normalizeForActivePacks(character)
  const setPicks = useChoiceEditor(character, onSave)
  // Species traits and background features (top-level only — picks show on their choice's card).
  const originFeatures = derived.features.filter((f) => /^(species|background):/.test(f.key) && !f.key.includes('#'))
  const originChoices = derived.choices.filter((c) => /^(species|background):/.test(c.sourceKey))
  const originLabel = [character.race, character.background].filter((x) => x.trim()).join(', ')
  // Picks kept from older sheets with nowhere else to go (2014 Favored Enemy/Terrain) — shown, not editable.
  const otherChoices = derived.choices.filter((c) => c.sourceKey.startsWith('custom:'))

  function commitResources(state: ResourceState): void {
    setResourceDraft(() => ({ resourceUsed: state.resourceUsed, resourceTemp: state.resourceTemp }))
  }

  /** Activating spends the toggle's cost from this resource (so Rage's uses tracker and its "active" state never drift apart) — deactivating never refunds it, matching how raging doesn't give the use back when it ends. Plays (and, at the table, broadcasts) the toggle's own sound cue on activation only — see playAbilitySfx. */
  function toggleBuff(toggle: DerivedToggle, resource: DerivedResource): void {
    if (readOnly) return
    if (character.activeBuffs.includes(toggle.id)) {
      onSave({ activeBuffs: character.activeBuffs.filter((id) => id !== toggle.id) })
      return
    }
    const cost = toggle.cost?.amount ?? 0
    if (cost) {
      // Temporary points are spent first, like any other spend.
      const next = spendResource(resource, resourceDraft, cost)
      if (!next) return
      commitResources(next)
    }
    playAbilitySfx(toggle.name, sessionId)
    onSave({ activeBuffs: [...character.activeBuffs, toggle.id] })
  }

  function updateFeature(id: string, fields: Partial<Feature>): void {
    setFeatureDraft((prev) => ({ features: prev.features.map((f) => (f.id === id ? { ...f, ...fields } : f)) }))
  }

  function chooseSubclass(classIndex: number, subclassName: string): void {
    const nextClasses = character.classes.map((c, i) => (i === classIndex ? { ...c, subclass: subclassName } : c))
    onSave({ classes: nextClasses })
  }

  const hasAnyContent = resources.length > 0 || originFeatures.length > 0 || character.classes.length > 0 || featureDraft.features.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {resources.length > 0 && (
        <div>
          <div className="gb-label" style={{ margin: '0 0 4px' }}>
            Class Resources
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {resources.map((r) => {
              const remaining = resourceRemaining(r, resourceDraft)
              const toggle = derived.toggles.find((t) => t.cost?.resourceId === r.id)
              const active = !!toggle && character.activeBuffs.includes(toggle.id)
              const cost = toggle?.cost?.amount ?? 0
              return (
                <div key={r.id} className="gb-card" style={{ padding: 'var(--space-3)', borderColor: active ? 'var(--accent)' : undefined }}>
                  <HoverDetailCard title={r.name} subtitle={r.className ?? r.source} fields={[]} description={r.detail || r.description}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'default' }}>
                      <strong style={{ flex: 1 }}>{r.name}</strong>
                      {active && (
                        <span className="gb-badge gb-badge--accent" style={{ fontSize: 10 }}>
                          Active
                        </span>
                      )}
                      <span className="gb-badge" style={{ fontSize: 10 }}>
                        {r.className ?? r.source}
                      </span>
                    </div>
                    {r.description && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}>{r.description}</p>}
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 var(--space-2)' }}>
                      Recharges: {RECHARGE_LABEL[r.recharge] ?? r.recharge}
                    </p>

                    <ResourceTracker resource={r} state={resourceDraft} readOnly={readOnly} onChange={commitResources} />

                    {toggle && (
                      <Button
                        variant={active ? 'secondary' : 'primary'}
                        onClick={() => toggleBuff(toggle, r)}
                        disabled={readOnly || (!active && remaining < cost)}
                        style={{ width: '100%', marginTop: 6, fontSize: 12, padding: '4px 10px' }}
                        title={active ? `End ${toggle.name} — its bonuses stop applying immediately` : `Activate ${toggle.name} — applies its bonuses across the sheet until you end it`}
                      >
                        {active ? `End ${toggle.name}` : `Activate ${toggle.name}`}
                      </Button>
                    )}
                  </HoverDetailCard>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {(originFeatures.length > 0 || originChoices.length > 0) && (
        <div>
          <div className="gb-label">Species &amp; Background{originLabel ? ` — ${originLabel}` : ''}</div>
          {originFeatures.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: originChoices.length ? 6 : 0 }}>
              {originFeatures.map((f) => (
                <InfoChip key={f.key} title={f.name} subtitle={f.key.startsWith('species:') ? character.race : character.background} description={f.description || 'No description available.'} />
              ))}
            </div>
          )}
          <ChoiceList choices={originChoices} all={derived.choices} readOnly={readOnly} onSetPicks={setPicks} />
        </div>
      )}

      {character.classes.map((classLevel, index) => (
        <ClassFeatureSection
          key={index}
          classLevel={classLevel}
          classIndex={index}
          classId={normalized.classes[index]?.classId}
          subclassId={normalized.classes[index]?.subclassId}
          character={character}
          onSave={onSave}
          readOnly={readOnly}
          onSetPicks={setPicks}
          onChooseSubclass={chooseSubclass}
        />
      ))}

      {otherChoices.length > 0 && (
        <div>
          <div className="gb-label">Other Picks</div>
          <ChoiceList choices={otherChoices} all={derived.choices} readOnly onSetPicks={setPicks} />
        </div>
      )}

      <div>
        <div className="gb-label">Custom Notes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {featureDraft.features.map((feature) => (
            <div key={feature.id} className="gb-card" style={{ padding: 'var(--space-2)' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <input
                  className="gb-input"
                  style={{ flex: 2 }}
                  placeholder="Name"
                  value={feature.name}
                  onChange={(e) => updateFeature(feature.id, { name: e.target.value })}
                />
                <input
                  className="gb-input"
                  style={{ flex: 1 }}
                  placeholder="Source"
                  value={feature.source}
                  onChange={(e) => updateFeature(feature.id, { source: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setFeatureDraft((prev) => ({ features: prev.features.filter((f) => f.id !== feature.id) }))}
                  style={removeBtnStyle}
                >
                  <XIcon size={12} />
                </button>
              </div>
              <textarea
                className="gb-input"
                style={{ minHeight: 44, resize: 'vertical' }}
                placeholder="Description"
                value={feature.description}
                onChange={(e) => updateFeature(feature.id, { description: e.target.value })}
              />
            </div>
          ))}
          {featureDraft.features.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {hasAnyContent
                ? 'Anything outside the automatic system above — DM-granted boons, reflavored abilities, homebrew — goes here.'
                : 'Nothing here yet — set a race and class in Overview to see racial traits, class features, and Ability Score Improvements show up automatically.'}
            </p>
          )}
          <button
            type="button"
            className="gb-btn gb-btn--secondary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() =>
              setFeatureDraft((prev) => ({
                features: [...prev.features, { id: crypto.randomUUID(), name: '', source: '', description: '' }]
              }))
            }
          >
            + Add Note
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Everything one class contributes, straight from the content engine: the
 * class's and its subclass's features up to the class's level as hover
 * chips, and every choice they grant (ASIs and feats, Fighting Styles,
 * Metamagic, invocations, spell picks, subclass options — or a homebrew
 * class's own) as generic ChoiceCards. Nothing here knows which class it's
 * showing. The subclass itself is still picked by name on the class entry
 * (SubclassChooser), and Divine Smite keeps its own card since spending a
 * spell slot isn't something the engine models yet.
 */
function ClassFeatureSection({
  classLevel,
  classIndex,
  classId,
  subclassId,
  character,
  onSave,
  readOnly,
  onSetPicks,
  onChooseSubclass
}: {
  classLevel: ClassLevel
  classIndex: number
  /** The class's content-pack id (from normalizeSheet) — undefined for a custom class name. */
  classId?: string
  subclassId?: string
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
  onSetPicks: (choice: DerivedChoice, picks: string[]) => void
  onChooseSubclass: (classIndex: number, subclassName: string) => void
}): JSX.Element | null {
  const { derived, registry } = deriveSheet(character)
  if (!classLevel.className.trim()) return null
  const cls = classId ? registry.get('classes', classId) : undefined
  const subclasses = cls ? registry.all('subclasses').filter((s) => s.def.classId === cls.def.id || s.def.classId === cls.fullId) : []
  const subclass = subclassId ? registry.get('subclasses', subclassId) : undefined

  const isOwnFeature = (key: string): boolean =>
    !key.includes('#') && ((!!classId && key.startsWith(`class:${classId}:`)) || (!!subclassId && key.startsWith(`subclass:${subclassId}:`)))
  const features = derived.features.filter((f) => isOwnFeature(f.key))
  // An archetype this class granted (a bloodline, a patron): its unlocked features, under its own heading.
  const archetypes = derived.archetypes
    .filter((a) => !!classId && a.classId === classId)
    .map((a) => ({ ...a, features: derived.features.filter((f) => f.archetypeId === a.id && f.level !== undefined) }))
  const choices = derived.choices.filter((c) => !!classId && c.classId === classId)
  const customFeatures = character.customClassFeatures.filter(
    (f) => f.className.toLowerCase() === classLevel.className.toLowerCase() && f.level <= classLevel.level
  )
  const subclassLevel = cls?.def.subclassLevel ?? Infinity
  const subclassLabel = cls?.def.subclassLabel ?? 'Subclass'
  const isDivineSmiteClass = cls?.fullId === 'srd-5.2.1:paladin' && classLevel.level >= 2
  const needsSubclass = classLevel.level >= subclassLevel && !classLevel.subclass && subclasses.length > 0

  if (features.length === 0 && choices.length === 0 && customFeatures.length === 0 && !needsSubclass && !classLevel.subclass) return null

  return (
    <div>
      <div className="gb-label">{classLevel.className} Features</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {features.map((f) => (
            <InfoChip
              key={f.key}
              title={f.name === 'Sneak Attack' ? `Sneak Attack (${sneakAttackDice(classLevel.level)})` : f.name}
              subtitle={`${f.key.startsWith('subclass:') ? (subclass?.def.name ?? classLevel.subclass) : classLevel.className}${f.level !== undefined ? ` ${f.level}` : ''}`}
              description={f.description}
              accent={f.key.startsWith('subclass:')}
            />
          ))}
          {customFeatures.map((f) => (
            <InfoChip key={f.id} title={f.name} subtitle={`${classLevel.className} ${f.level} (custom)`} description={f.description} />
          ))}
          {classLevel.subclass && classLevel.level >= subclassLevel && (
            <InfoChip
              title={subclass?.def.name ?? classLevel.subclass}
              subtitle={`${subclassLabel} — ${classLevel.className} ${subclassLevel}`}
              description={subclass?.def.description || `Your ${classLevel.className.toLowerCase()} subclass.`}
              accent
            />
          )}
        </div>

        {archetypes.map((a) => (
          <div key={a.id}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 4px' }}>
              {a.name} <span style={{ opacity: 0.8 }}>· level {a.level}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {a.features.map((f) => (
                <InfoChip key={f.key} title={f.name} subtitle={`${a.name} ${f.level}`} description={f.description} accent />
              ))}
            </div>
          </div>
        ))}

        {isDivineSmiteClass && <DivineSmiteCard character={character} onSave={onSave} readOnly={readOnly} />}

        {needsSubclass && (
          <SubclassChooser
            classLabel={classLevel.className}
            featureName={subclassLabel}
            slotLevel={subclassLevel}
            options={subclasses.map((s) => ({ id: s.def.id, name: s.def.name, classId: s.def.classId, flavor: s.def.description }))}
            readOnly={readOnly}
            onChoose={(name) => onChooseSubclass(classIndex, name)}
          />
        )}

        <ChoiceList choices={choices} all={derived.choices} readOnly={readOnly} onSetPicks={onSetPicks} />
      </div>
    </div>
  )
}

const DIVINE_SMITE_DESCRIPTION =
  "As a Bonus Action immediately after hitting with a melee weapon or Unarmed Strike, expend a spell slot to deal an extra 2d8 Radiant damage, plus 1d8 for each spell level above 1st. The damage increases by 1d8 if the target is a Fiend or an Undead. Granted by Paladin's Smite (level 2), which also lets you cast it once per Long Rest without expending a slot — that free cast isn't tracked separately here, so just remember not to double up."

/**
 * The one class resource that's actually spent from spell slots instead of
 * its own pool — so unlike Rage/Ki/Sorcery Points (see CLASS_RESOURCES in
 * shared/dnd5e.ts), this doesn't track its own "uses"; "casting" it here
 * just marks a spell slot as used, the same as SpellsTab's own slot tracker
 * would, and shows what that slot's damage roll comes out to. Doesn't model
 * Paladin's Smite's once-per-Long-Rest free cast (see DIVINE_SMITE_DESCRIPTION).
 */
export function DivineSmiteCard({
  character,
  onSave,
  readOnly,
  sessionId = null
}: {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
  /** Threaded down from CombatTab, same as elsewhere — plays (and, at the table, broadcasts) the Paladin Smite cue on cast. */
  sessionId?: string | null
}): JSX.Element {
  const slotTotals = spellSlotsForClasses(character.classes)
  const availableLevels = Object.keys(slotTotals)
    .map(Number)
    .filter((level) => slotTotals[level] > (character.spellSlots[level]?.used ?? 0))
    .sort((a, b) => a - b)

  const [slotLevel, setSlotLevel] = useState<number>(availableLevels[0] ?? 1)
  const [vsUndeadOrFiend, setVsUndeadOrFiend] = useState(false)
  const [lastCast, setLastCast] = useState<string | null>(null)

  const effectiveLevel = availableLevels.includes(slotLevel) ? slotLevel : availableLevels[0]
  const dice = effectiveLevel ? Math.min(5, effectiveLevel + 1) + (vsUndeadOrFiend ? 1 : 0) : 0

  function cast(): void {
    if (readOnly || !effectiveLevel) return
    const used = (character.spellSlots[effectiveLevel]?.used ?? 0) + 1
    onSave({ spellSlots: { ...character.spellSlots, [effectiveLevel]: { total: slotTotals[effectiveLevel], used } } })
    setLastCast(`${dice}d8 radiant damage (spent a level ${effectiveLevel} slot).`)
    playAbilitySfx('Divine Smite', sessionId)
  }

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <HoverDetailCard title="Divine Smite" subtitle="Paladin's Smite — Paladin 2" fields={[]} description={DIVINE_SMITE_DESCRIPTION}>
        <strong style={{ cursor: 'default' }}>Divine Smite</strong>
      </HoverDetailCard>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>
        Expend a spell slot on a melee hit for extra radiant damage.
      </div>
      {availableLevels.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No spell slots available — rest to recover some.</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <select
              className="gb-input"
              value={effectiveLevel}
              onChange={(e) => setSlotLevel(Number(e.target.value))}
              style={{ fontSize: 12, flex: 1 }}
              disabled={readOnly}
            >
              {availableLevels.map((level) => (
                <option key={level} value={level}>
                  Level {level} slot ({slotTotals[level] - (character.spellSlots[level]?.used ?? 0)} left)
                </option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={vsUndeadOrFiend} onChange={(e) => setVsUndeadOrFiend(e.target.checked)} disabled={readOnly} />
              vs. undead/fiend
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Button variant="primary" onClick={cast} disabled={readOnly} style={{ fontSize: 12, padding: '4px 10px' }}>
              Cast ({dice}d8 radiant)
            </Button>
          </div>
        </>
      )}
      {lastCast && <p style={{ fontSize: 11, color: 'var(--accent)', margin: '6px 0 0' }}>{lastCast}</p>}
    </div>
  )
}

/**
 * A resource's tracker with temporary points counted in: boxes for a
 * "uses" resource (temporary points are extra dashed boxes after them), or
 * a number with Spend / Restore for a pool. Spending always takes
 * temporary points first; Restore only gives back spent regular points;
 * temporary points can be cleared with the X on their badge. Every change
 * comes back as a whole new state through onChange.
 */
export function ResourceTracker({
  resource,
  state,
  readOnly,
  onChange
}: {
  resource: DerivedResource
  state: ResourceState
  readOnly?: boolean
  onChange: (state: ResourceState) => void
}): JSX.Element {
  const used = Math.min(state.resourceUsed[resource.id] ?? 0, resource.max)
  const temp = Math.max(0, state.resourceTemp[resource.id] ?? 0)
  const tempBadge =
    temp > 0 ? (
      <span className="gb-badge gb-badge--accent" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Temporary points: spent first, gone on a rest">
        +{temp} temp
        {!readOnly && (
          <button type="button" onClick={() => onChange(removeTempPoints(resource, state))} title="Remove the temporary points" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
            <XIcon size={9} />
          </button>
        )}
      </span>
    ) : null
  return resource.display === 'uses' ? (
    <UsesTracker
      max={resource.max}
      used={used}
      temp={temp}
      readOnly={readOnly}
      onSetUsed={(n) => onChange(setResourceUsed(resource, state, n))}
      onSpendTemp={() => onChange(removeTempPoints(resource, state, 1))}
      badge={tempBadge}
    />
  ) : (
    <PoolTracker
      max={resource.max}
      used={used}
      temp={temp}
      readOnly={readOnly}
      onSpend={(n) => {
        const next = spendResource(resource, state, n)
        if (next) onChange(next)
      }}
      onRestore={(n) => onChange(restoreResource(resource, state, n))}
      badge={tempBadge}
    />
  )
}

function UsesTracker({
  max,
  used,
  temp,
  readOnly,
  onSetUsed,
  onSpendTemp,
  badge
}: {
  max: number
  used: number
  temp: number
  readOnly?: boolean
  onSetUsed: (used: number) => void
  onSpendTemp: () => void
  badge: ReactNode
}): JSX.Element {
  // A rage-at-20 style "unlimited" max renders as a plain counter instead
  // of 99 individual pips, which would just be noise.
  if (max > 20) {
    return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unlimited</span>
  }
  const box = { width: 16, height: 16, borderRadius: 3, padding: 0, cursor: readOnly ? 'default' : 'pointer' } as const
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {Array.from({ length: max }, (_, i) => (
          <button
            key={i}
            type="button"
            disabled={readOnly}
            onClick={() => (i >= used && temp > 0 ? onSpendTemp() : onSetUsed(i < used ? i : i + 1))}
            title={i < used ? 'Used' : temp > 0 ? 'Available — using one spends a temporary point first' : 'Available'}
            style={{ ...box, border: '1.5px solid var(--border-strong)', background: i < used ? 'transparent' : 'var(--accent)' }}
          />
        ))}
        {Array.from({ length: Math.min(temp, 20) }, (_, i) => (
          <button key={`t${i}`} type="button" disabled={readOnly} onClick={onSpendTemp} title="Temporary — click to spend" style={{ ...box, border: '1.5px dashed var(--accent)', background: 'var(--accent-subtle)' }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {max - used + temp} / {max}
      </span>
      {badge}
    </div>
  )
}

function PoolTracker({
  max,
  used,
  temp,
  readOnly,
  onSpend,
  onRestore,
  badge
}: {
  max: number
  used: number
  temp: number
  readOnly?: boolean
  onSpend: (amount: number) => void
  onRestore: (amount: number) => void
  badge: ReactNode
}): JSX.Element {
  const [amount, setAmount] = useState(1)
  const available = max - used + temp
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', minWidth: 56 }} title={temp ? `${max - used} regular + ${temp} temporary` : undefined}>
          {available} / {max}
        </span>
        <input
          type="number"
          min={1}
          className="gb-input"
          value={amount}
          disabled={readOnly}
          onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
          style={{ width: 52, fontSize: 12 }}
        />
        <button type="button" disabled={readOnly || available < amount} onClick={() => onSpend(amount)} className="gb-btn gb-btn--secondary" style={spendButtonStyle} title="Spend this many (temporary points first)">
          Spend
        </button>
        <button type="button" disabled={readOnly || used <= 0} onClick={() => onRestore(amount)} className="gb-btn gb-btn--secondary" style={spendButtonStyle} title="Restore this many spent points">
          Restore
        </button>
      </div>
      {badge}
    </div>
  )
}

const spendButtonStyle: CSSProperties = { fontSize: 11, padding: '4px 8px' }
const removeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
  padding: '0 2px'
}
