// The character sheet's always-visible parts: the left rail (identity, hit
// points, vitals, resources) and, around the tabs, the ability tiles and the
// skills column. All of them work from one shared SheetState (useSheetState).
import { useState } from 'react'
import { ABILITY_DESCRIPTIONS, activeAsiSlotChoices, exhaustionEffectsDescription, formatModifier, hitDicePools, type Ability } from '@shared/dnd5e'
import { skillModeOf, skillOf, skillProficiencyOf } from '@shared/content/sheet'
import { resourceRemaining } from '@shared/content/resourceMath'
import { FEATS } from '@shared/compendium'
import type { DerivedResource } from '@shared/content/engine'
import { Modal } from '../../../ui/Modal'
import { Button } from '../../../ui/Button'
import { XIcon } from '../../../ui/icons'
import { PencilIcon, StarIcon } from '../characterSheetTabs/icons'
import { HoverDetailCard } from '../HoverDetailCard'
import { useSheetRoller } from '../../dice/useSheetRoller'
import { useTerms } from '../../content/terms'
import { usePickerContent } from '../../content/pickerContent'
import type { SheetState } from './useSheetState'
import { AdvantageTag, DeathSaveRow, RaceExtrasPrompt, ResistancesSection, SubclassField, readPortraitFile } from './sheetBits'

/** XP needed for each level (2024 rules, same as 2014). */
const XP_FOR_LEVEL = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]
const CUSTOM = '__custom__'

/** What each SRD skill covers, in a line, for its hover card. */
const SKILL_SUMMARIES: Record<string, string> = {
  Acrobatics: 'Keeping your balance, tumbling, and staying on your feet in a tricky spot.',
  'Animal Handling': 'Calming, controlling or reading the intentions of an animal.',
  Arcana: 'Knowing about spells, magic items, planes and arcane traditions.',
  Athletics: 'Climbing, jumping, swimming, grappling and shoving.',
  Deception: 'Lying convincingly, bluffing and keeping a disguise up.',
  History: 'Recalling events, people, kingdoms and wars of the past.',
  Insight: 'Reading body language and telling when someone is lying.',
  Intimidation: 'Getting your way through threats and a show of force.',
  Investigation: 'Searching for clues and working out what they mean.',
  Medicine: 'Stabilizing the dying and diagnosing illness.',
  Nature: 'Knowing terrain, plants, animals and the weather.',
  Perception: 'Spotting, hearing or otherwise noticing things around you.',
  Performance: 'Entertaining a crowd with music, dance, acting or story.',
  Persuasion: 'Influencing others with tact, charm and good faith.',
  Religion: 'Knowing about deities, rites, holy symbols and cults.',
  'Sleight of Hand': 'Pickpocketing, palming an object and other quick hand tricks.',
  Stealth: 'Hiding and moving without being seen or heard.',
  Survival: 'Tracking, hunting, foraging and finding your way in the wild.'
}

// ---------------------------------------------------------------------------
// Identity

/** Portrait, name, species and classes, XP toward the next level — and, behind Edit, everything that changes them. */
export function IdentityCard({ s, name, onName }: { s: SheetState; name: string; onName: (name: string) => void }): JSX.Element {
  const terms = useTerms()
  const [editing, setEditing] = useState(false)
  const { draft, readOnly, derivedSheet } = s
  const level = derivedSheet.derived.level
  const classLine = draft.classes
    .filter((c) => c.className)
    .map((c) => `${c.className} ${c.level}${c.subclass ? ` (${c.subclass})` : ''}`)
    .join(' / ')
  const next = XP_FOR_LEVEL[Math.min(level, 19)]
  const prev = XP_FOR_LEVEL[Math.max(0, Math.min(level - 1, 19))]
  const progress = level >= 20 ? 1 : Math.max(0, Math.min(1, (draft.experiencePoints - prev) / Math.max(1, next - prev)))
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

  return (
    <div className="gs-card gs-span">
      <div className="gs-row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <label
          title={readOnly ? undefined : 'Click to change the portrait'}
          style={{
            width: 54,
            height: 54,
            flexShrink: 0,
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-subtle)',
            color: 'var(--accent-hover)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            cursor: readOnly ? 'default' : 'pointer'
          }}
        >
          {draft.portraitDataUrl ? <img src={draft.portraitDataUrl} alt="Portrait" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials || '?'}
          {!readOnly && (
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void readPortraitFile(file).then(s.setPortrait)
                e.target.value = ''
              }}
            />
          )}
        </label>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1.15, overflowWrap: 'break-word' }}>{name || 'Unnamed'}</div>
          <div className="gs-hint" style={{ marginTop: 2 }}>
            {[draft.race, classLine].filter(Boolean).join(' · ') || 'No species or class yet'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            className="gs-iconbtn"
            disabled={readOnly}
            onClick={() => s.patch({ inspiration: !draft.inspiration })}
            title={`${terms.t('inspiration')}: ${draft.inspiration ? 'yes (click to spend)' : 'no (click when the DM grants it)'}`}
            aria-pressed={draft.inspiration}
            style={{ color: draft.inspiration ? 'var(--accent)' : undefined }}
          >
            <StarIcon size={18} filled={draft.inspiration} />
          </button>
          {!readOnly && (
            <button
              type="button"
              className="gs-iconbtn"
              onClick={() => setEditing((v) => !v)}
              title={editing ? 'Done editing' : 'Change name, species, class, level and XP'}
              aria-pressed={editing}
              style={{ color: editing ? 'var(--accent)' : undefined }}
            >
              <PencilIcon size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="gs-row" style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
        <span>Level {level}</span>
        <div style={{ flex: 1, height: 5, borderRadius: 9, background: 'var(--bg-sunken)', overflow: 'hidden' }}>
          <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
        <span>{level >= 20 ? `${draft.experiencePoints.toLocaleString()} XP` : `${draft.experiencePoints.toLocaleString()} / ${next.toLocaleString()} XP`}</span>
      </div>
      {!readOnly && level < 20 && (
        <LevelUpButton s={s} ready={level < 20 && draft.experiencePoints >= next} onNoClass={() => setEditing(true)} />
      )}
      {editing && !readOnly && <IdentityEditor s={s} name={name} onName={onName} />}
    </div>
  )
}

/**
 * Levels a class up by one without opening the editor (the level-up popup
 * then offers whatever the new level unlocks). With more than one class it
 * asks which; it glows once the XP reaches the next level.
 */
function LevelUpButton({ s, ready, onNoClass }: { s: SheetState; ready: boolean; onNoClass: () => void }): JSX.Element {
  const [choosing, setChoosing] = useState(false)
  const classes = s.draft.classes.map((c, i) => ({ ...c, i })).filter((c) => c.className.trim() && c.level < 20)
  function levelUp(i: number): void {
    s.updateClass(i, { level: s.draft.classes[i].level + 1 })
    setChoosing(false)
  }
  function click(): void {
    if (classes.length === 0) onNoClass()
    else if (classes.length === 1) levelUp(classes[0].i)
    else setChoosing((v) => !v)
  }
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        className={`gb-btn ${ready ? 'gb-btn--primary' : 'gb-btn--secondary'}`}
        style={{ width: '100%', fontSize: 13, padding: '5px 10px' }}
        onClick={click}
        title={
          classes.length === 0
            ? 'Pick a class first'
            : classes.length === 1
              ? `${classes[0].className} ${classes[0].level} to ${classes[0].level + 1}`
              : 'Choose which class gains the level'
        }
      >
        {ready ? 'Level up (enough XP)' : 'Level up'}
      </button>
      {choosing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {classes.map((c) => (
            <button key={c.i} type="button" className="gb-btn gb-btn--secondary" style={{ fontSize: 12, padding: '4px 10px', justifyContent: 'space-between', display: 'flex' }} onClick={() => levelUp(c.i)}>
              <span>{c.className}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {c.level} to {c.level + 1}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A number with − and + buttons either side, instead of a field's tiny spinner arrows. */
function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }): JSX.Element {
  return (
    <span className="gs-stepper" role="group" aria-label={label}>
      <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Lower ${label.toLowerCase()}`}>
        −
      </button>
      <span>{value}</span>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`Raise ${label.toLowerCase()}`}>
        +
      </button>
    </span>
  )
}

/** Species, classes (with level and subclass), multiclassing and XP. */
function IdentityEditor({ s, name, onName }: { s: SheetState; name: string; onName: (name: string) => void }): JSX.Element {
  const picker = usePickerContent()
  const terms = useTerms()
  const { draft, character, onSave } = s
  const [pendingRaceExtras, setPendingRaceExtras] = useState<string | null>(null)
  const [customClass, setCustomClass] = useState<Set<number>>(new Set())
  const classNames = picker.classes.map((c) => c.name)
  const currentRace = picker.races.find((r) => r.name.toLowerCase() === draft.race.trim().toLowerCase())
  const raceIsCustom = draft.race.trim() !== '' && !currentRace

  function changeRace(name: string): void {
    const race = picker.races.find((r) => r.name === name) ?? null
    s.patch({ race: race?.name ?? '' })
    const species = race ? s.derivedSheet.registry.all('species').find((sp) => sp.def.name.toLowerCase() === race.name.toLowerCase()) : undefined
    const hasChoices = !!species?.def.traits.some((t) => t.effects.some((e) => e.do.kind === 'grantChoice'))
    setPendingRaceExtras(race && hasChoices ? race.name : null)
    // A lineage belongs to the species it came from.
    if (character.raceLineageChoice && character.raceLineageChoice.raceId !== race?.id) onSave({ raceLineageChoice: null })
  }

  const field = { fontSize: 13, padding: '4px 8px', minWidth: 0 } as const
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className="gs-label">
        Name
        <input className="gb-input" style={{ ...field, width: '100%', marginTop: 3 }} value={name} onChange={(e) => onName(e.target.value)} />
      </label>
      <label className="gs-label">
        {terms.t('species', 'Race')}
        <select
          className="gb-input"
          style={{ ...field, width: '100%', marginTop: 3 }}
          value={raceIsCustom ? CUSTOM : (currentRace?.name ?? '')}
          onChange={(e) => (e.target.value === CUSTOM ? s.patch({ race: draft.race || 'Custom' }) : changeRace(e.target.value))}
        >
          <option value="">Select…</option>
          {picker.races.map((r) => (
            <option key={r.id} value={r.name}>
              {r.name}
            </option>
          ))}
          <option value={CUSTOM}>Custom…</option>
        </select>
      </label>
      {raceIsCustom && <input className="gb-input" style={field} value={draft.race} onChange={(e) => s.patch({ race: e.target.value })} placeholder="Species name" />}
      {pendingRaceExtras && <RaceExtrasPrompt raceName={pendingRaceExtras} character={character} onSave={onSave} onDone={() => setPendingRaceExtras(null)} />}

      <div className="gs-label">Classes</div>
      {(draft.classes.length ? draft.classes : [{ className: '', level: 1 }]).map((c, i) => {
        const isCustom = customClass.has(i) || (c.className.trim() !== '' && !classNames.includes(c.className))
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: 4 }}>
            <select
              className="gb-input"
              style={field}
              value={isCustom ? CUSTOM : c.className}
              onChange={(e) => {
                const v = e.target.value
                setCustomClass((prev) => {
                  const nextSet = new Set(prev)
                  if (v === CUSTOM) nextSet.add(i)
                  else nextSet.delete(i)
                  return nextSet
                })
                s.updateClass(i, { className: v === CUSTOM ? '' : v })
              }}
            >
              <option value="">Class…</option>
              {classNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value={CUSTOM}>Custom…</option>
            </select>
            <Stepper value={c.level} min={1} max={20} label="Level" onChange={(level) => s.updateClass(i, { level })} />
            {i > 0 ? (
              <button type="button" onClick={() => s.removeClass(i)} title="Remove this class" style={{ background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <XIcon size={12} />
              </button>
            ) : (
              <span />
            )}
            {isCustom && (
              <input className="gb-input" style={{ ...field, gridColumn: '1 / -1' }} value={c.className} onChange={(e) => s.updateClass(i, { className: e.target.value })} placeholder="Class name" />
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <SubclassField className={c.className} level={c.level} value={c.subclass ?? ''} onChange={(v) => s.updateClass(i, { subclass: v })} style={{ ...field, width: '100%' }} />
            </div>
          </div>
        )
      })}
      <button type="button" className="gs-chip" style={{ alignSelf: 'flex-start' }} onClick={() => s.patch({ classes: [...draft.classes, { className: '', level: 1 }] })}>
        + Add a class (multiclass)
      </button>
      <label className="gs-label">
        Experience points
        <input type="number" min={0} className="gb-input" style={{ ...field, width: '100%', marginTop: 3 }} value={draft.experiencePoints} onChange={(e) => s.patch({ experiencePoints: Math.max(0, Number(e.target.value) || 0) })} />
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hit points

export function HitPointsCard({ s }: { s: SheetState }): JSX.Element {
  const terms = useTerms()
  const { draft, maxHp, readOnly } = s
  const [amount, setAmount] = useState('')
  const [restOpen, setRestOpen] = useState(false)
  const pools = hitDicePools(draft.classes, draft.hitDiceUsed)
  const hdLeft = pools.reduce((n, p) => n + p.total - p.used, 0)
  const hdTotal = pools.reduce((n, p) => n + p.total, 0)
  const hdDice = [...new Set(pools.map((p) => `d${p.hitDie}`))].join('/')
  const total = Math.max(maxHp, draft.currentHp) + draft.tempHp
  const n = Number(amount)
  const valid = Number.isFinite(n) && n > 0
  const act = (fn: (n: number) => void): void => {
    if (!valid) return
    fn(n)
    setAmount('')
  }

  return (
    <div className="gs-card gs-span">
      <div className="gs-between">
        <span className="gs-label">Hit points</span>
        {hdTotal > 0 && (
          <span className="gs-chip" title={`${terms.t('hitDice')} left, spent on a short rest`}>
            {terms.t('hitDice')} {hdLeft}/{hdTotal} {hdDice}
          </span>
        )}
      </div>
      <div className="gs-row" style={{ alignItems: 'baseline', gap: 6, margin: '6px 0 8px' }}>
        {readOnly ? (
          <span className="gs-hp-now">{draft.currentHp}</span>
        ) : (
          <input
            type="number"
            aria-label="Current hit points"
            className="gs-hp-now"
            value={draft.currentHp}
            onChange={(e) => s.patch({ currentHp: Number(e.target.value) })}
            style={{ width: 76, background: 'transparent', border: '1px solid transparent', borderRadius: 'var(--radius-sm)', padding: 0 }}
          />
        )}
        <span style={{ color: 'var(--text-muted)' }}>/ {maxHp}</span>
        <label className="gs-chip gs-chip--blue" style={{ marginLeft: 'auto' }} title="Temporary hit points: lost first, gone on a long rest">
          +
          <input
            type="number"
            min={0}
            value={draft.tempHp}
            disabled={readOnly}
            onChange={(e) => s.patch({ tempHp: Math.max(0, Number(e.target.value) || 0) })}
            style={{ width: 28, background: 'transparent', border: 0, color: 'inherit', font: 'inherit', padding: 0, textAlign: 'center' }}
            aria-label="Temporary hit points"
          />
          temp
        </label>
      </div>
      <div className="gs-hpbar" aria-hidden="true">
        <div className="gs-hp" style={{ width: `${(Math.max(0, draft.currentHp) / total) * 100}%` }} />
        <div className="gs-tmp" style={{ width: `${(draft.tempHp / total) * 100}%` }} />
      </div>
      {!readOnly && (
        <>
          <div className="gs-row" style={{ marginTop: 10 }}>
            <input
              type="number"
              min={1}
              className="gb-input"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && act(s.damage)}
              aria-label="Damage or healing amount"
              style={{ width: 64, padding: '4px 8px' }}
            />
            <button type="button" className="gb-btn gb-btn--secondary" disabled={!valid} onClick={() => act(s.damage)} style={{ color: 'var(--danger)', flex: 1 }} title="Take this much damage (temporary HP first)">
              Damage
            </button>
            <button type="button" className="gb-btn gb-btn--secondary" disabled={!valid} onClick={() => act(s.heal)} style={{ color: 'var(--success)', flex: 1 }} title="Heal this much (up to max HP)">
              Heal
            </button>
          </div>
          <div className="gs-row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="gb-btn gb-btn--secondary"
              style={{ flex: 1 }}
              onClick={() => {
                s.shortRest()
                setRestOpen(true)
              }}
            >
              Short rest
            </button>
            <button type="button" className="gb-btn gb-btn--secondary" style={{ flex: 1 }} onClick={s.longRest}>
              Long rest
            </button>
          </div>
        </>
      )}
      {draft.currentHp <= 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 'var(--space-3)' }}>
          <DeathSaveRow label="Successes" count={draft.deathSaves.successes} onChange={(v) => s.patch({ deathSaves: { ...draft.deathSaves, successes: v } })} />
          <DeathSaveRow label="Failures" count={draft.deathSaves.failures} onChange={(v) => s.patch({ deathSaves: { ...draft.deathSaves, failures: v } })} />
        </div>
      )}
      <Modal open={restOpen} onClose={() => setRestOpen(false)} width={380}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18 }}>Short rest</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Spend {terms.t('hitDice').toLowerCase()} to heal: roll and add your {terms.ability('con', 'Constitution')} modifier. Death saves are already cleared.
            </p>
          </div>
          {pools.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No recognized class to draw hit dice from.</p>
          ) : (
            pools.map((pool) => (
              <div key={pool.className} className="gs-card gs-between">
                <span style={{ fontSize: 13 }}>
                  {pool.className} d{pool.hitDie}{' '}
                  <span style={{ color: 'var(--text-muted)' }}>
                    ({pool.total - pool.used}/{pool.total} left)
                  </span>
                </span>
                <Button variant="secondary" disabled={pool.total - pool.used <= 0} onClick={() => s.rollHitDie(pool)} style={{ fontSize: 12 }}>
                  Roll d{pool.hitDie}
                </Button>
              </div>
            ))
          )}
          <Button variant="primary" onClick={() => setRestOpen(false)}>
            Done
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vitals

export function VitalsRow({ s }: { s: SheetState }): JSX.Element {
  const terms = useTerms()
  const { derived } = s.derivedSheet
  const { rollCheck } = useSheetRoller(s.sessionId, s.character.name)
  const otherSpeeds = Object.entries(derived.speeds).filter(([k, v]) => k !== 'walk' && v > 0)
  return (
    <div className="gs-vitals gs-span">
      <div className="gs-vital" title={terms.t('armorClass')}>
        <b>{derived.armorClass}</b>
        <span>AC</span>
      </div>
      <button
        type="button"
        className="gs-vital"
        disabled={s.readOnly}
        onClick={() => rollCheck(terms.t('initiative'), derived.initiative, { advantage: derived.initiativeMode ?? 'normal' })}
        title={`Roll ${terms.t('initiative').toLowerCase()}`}
      >
        <b>
          {formatModifier(derived.initiative)}
          {derived.initiativeMode && <AdvantageTag kind={derived.initiativeMode} label="Initiative" />}
        </b>
        <span>Init</span>
      </button>
      <div className="gs-vital" title={otherSpeeds.length ? otherSpeeds.map(([k, v]) => `${k} ${v} ft`).join(', ') : terms.t('speed')}>
        <b>{derived.speeds.walk ?? 0}</b>
        <span>{otherSpeeds.length ? 'Speed +' : 'Speed'}</span>
      </div>
      <div className="gs-vital" title={terms.t('proficiencyBonus')}>
        <b>{formatModifier(derived.proficiencyBonus)}</b>
        <span>Prof</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resources

/** Every limited-use thing (class resources, item charges, homebrew pools) and exhaustion, tapped to spend. */
export function ResourcesCard({ s }: { s: SheetState }): JSX.Element | null {
  const { derived } = s.derivedSheet
  const { character, readOnly, onSave, draft } = s
  const state = { resourceUsed: character.resourceUsed, resourceTemp: character.resourceTemp ?? {} }
  const resources = derived.resources

  function setRemaining(r: DerivedResource, remaining: number): void {
    if (readOnly) return
    const used = Math.max(0, Math.min(r.max, r.max - remaining))
    onSave({ resourceUsed: { ...character.resourceUsed, [r.id]: used } })
  }

  return (
    <div className="gs-card gs-span">
      <div className="gs-label" style={{ marginBottom: 8 }}>
        Resources
      </div>
      {resources.length === 0 && <div className="gs-hint">Class resources and item charges show here.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {resources.map((r) => {
          const left = resourceRemaining(r, state)
          return (
            <HoverDetailCard key={r.id} title={r.name} subtitle={r.source} fields={[]} description={[r.description, `Recharges: ${r.recharge}`].filter(Boolean).join('\n\n')}>
              <div className="gs-between">
                <span style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                {r.max <= 10 && r.display !== 'pool' ? (
                  <div className="gs-pips">
                    {Array.from({ length: r.max }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={readOnly}
                        className={`gs-pip${i < left ? '' : ' gs-pip--spent'}`}
                        onClick={() => setRemaining(r, i < left ? i : i + 1)}
                        aria-label={`${r.name}: ${left} of ${r.max} left`}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="gs-row" style={{ gap: 4 }}>
                    <button type="button" className="gs-chip" disabled={readOnly || left <= 0} onClick={() => setRemaining(r, left - 1)} aria-label={`Spend 1 ${r.name}`}>
                      −
                    </button>
                    <span style={{ fontSize: 13, minWidth: 44, textAlign: 'center' }}>
                      {left} / {r.max}
                    </span>
                    <button type="button" className="gs-chip" disabled={readOnly || left >= r.max} onClick={() => setRemaining(r, left + 1)} aria-label={`Regain 1 ${r.name}`}>
                      +
                    </button>
                  </span>
                )}
              </div>
            </HoverDetailCard>
          )
        })}
        <div className="gs-between">
          <HoverDetailCard
            title={`Exhaustion ${draft.exhaustionLevel}`}
            subtitle={draft.exhaustionLevel >= 6 ? 'Death' : draft.exhaustionLevel <= 0 ? 'No exhaustion' : undefined}
            fields={[]}
            description={exhaustionEffectsDescription(draft.exhaustionLevel)}
          >
            <span style={{ fontSize: 13, color: draft.exhaustionLevel > 0 ? 'var(--danger)' : undefined }}>Exhaustion</span>
          </HoverDetailCard>
          <span className="gs-row" style={{ gap: 4 }}>
            <button type="button" className="gs-chip" disabled={readOnly || draft.exhaustionLevel <= 0} onClick={() => s.setExhaustion(draft.exhaustionLevel - 1)} aria-label="Lower exhaustion">
              −
            </button>
            <span style={{ fontSize: 13, minWidth: 18, textAlign: 'center' }}>{draft.exhaustionLevel}</span>
            <button type="button" className="gs-chip" disabled={readOnly || draft.exhaustionLevel >= 6} onClick={() => s.setExhaustion(draft.exhaustionLevel + 1)} aria-label="Raise exhaustion">
              +
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ability tiles

/** Where an ability's score bonuses come from (Ability Score Improvements and feats), for its hover card. */
function abilityBonusSources(s: SheetState, ability: Ability): string[] {
  const sources: string[] = []
  for (const slot of activeAsiSlotChoices(s.draft.classes, s.character.asiSlotChoices)) {
    if (slot.kind === 'ability' && slot.abilityIncreases?.[ability]) {
      sources.push(`+${slot.abilityIncreases[ability]} from Ability Score Improvement (level ${slot.level})`)
    } else if (slot.kind === 'feat') {
      const feat = FEATS.find((f) => f.id === slot.featId)
      for (const effect of feat?.effects ?? []) {
        if (effect.kind === 'abilityScore' && effect.ability === ability) sources.push(`+${effect.amount} from ${feat!.name}`)
        else if (effect.kind === 'abilityScoreChoice' && slot.chosenAbility === ability) sources.push(`+${effect.amount} from ${feat!.name}`)
      }
    }
  }
  return sources
}

/** Each ability as a tile: modifier (click for a check), score, and its save underneath (click to roll, the dot for proficiency). */
export function AbilityTiles({ s }: { s: SheetState }): JSX.Element {
  const terms = useTerms()
  const [editing, setEditing] = useState(false)
  const { derived } = s.derivedSheet
  const { rollCheck } = useSheetRoller(s.sessionId, s.character.name)
  return (
    <div>
      <div className="gs-abilities">
        {terms.abilities.map(({ id, label }) => {
          const a = derived.abilities[id as Ability]
          const save = derived.saves[id as Ability]
          const checkMode = derived.checkModes[id as Ability]
          const bonuses = abilityBonusSources(s, id as Ability)
          return (
            <div key={id} className="gs-ability">
              <HoverDetailCard
                title={label}
                subtitle={`Score ${a.score} · modifier ${formatModifier(a.mod)}`}
                fields={[]}
                description={ABILITY_DESCRIPTIONS[id as Ability]}
                extra={bonuses.length ? { label: 'Bonuses', value: bonuses.join('; ') } : undefined}
              >
                <button
                  type="button"
                  className="gs-ability-check"
                  disabled={s.readOnly || editing}
                  onClick={() => rollCheck(`${label} Check`, a.mod, { advantage: checkMode ?? 'normal' })}
                  title={`Roll a ${label} check`}
                >
                  <div className="gs-label">
                    {terms.abilityShort(id as Ability, label)}
                    {checkMode && <AdvantageTag kind={checkMode} label={`${label} checks`} />}
                  </div>
                  <div className="gs-ability-mod">{formatModifier(a.mod)}</div>
                  {editing ? (
                    <input
                      type="number"
                      min={1}
                      max={30}
                      className="gb-input"
                      style={{ width: '100%', textAlign: 'center', padding: '2px 4px' }}
                      value={s.draft.abilityScores[id as Ability]}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => s.updateAbilityScore(id as Ability, Number(e.target.value))}
                      aria-label={`${label} score`}
                    />
                  ) : (
                    <div className="gs-hint">{a.score}</div>
                  )}
                </button>
              </HoverDetailCard>
              <div className={`gs-ability-save${save.proficiency ? ' gs-ability-save--prof' : ''}`}>
                <button
                  type="button"
                  className={`gs-dot${save.proficiency ? ' gs-dot--proficient' : ''}`}
                  disabled={s.readOnly}
                  onClick={() => s.toggleSave(id as Ability)}
                  title={save.proficiency ? 'Proficient in this save (click to remove)' : 'Not proficient in this save (click to add)'}
                />
                <button
                  type="button"
                  disabled={s.readOnly}
                  onClick={() => rollCheck(`${label} Saving Throw`, save.bonus, { advantage: save.mode ?? 'normal' })}
                  title={`Roll a ${label} saving throw`}
                >
                  Save {formatModifier(save.bonus)}
                </button>
                {save.mode && <AdvantageTag kind={save.mode} label={`${label} saves`} />}
              </div>
            </div>
          )
        })}
      </div>
      {!s.readOnly && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" className="gs-chip" style={{ fontSize: 11 }} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done editing scores' : 'Edit scores'}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skills and senses

export function SkillsCard({ s }: { s: SheetState }): JSX.Element {
  const terms = useTerms()
  const { derived } = s.derivedSheet
  const { rollCheck } = useSheetRoller(s.sessionId, s.character.name)
  return (
    <div className="gs-card">
      <div className="gs-between" style={{ marginBottom: 6 }}>
        <span className="gs-label">{terms.t('skills')}</span>
        <span className="gs-hint">Click to roll</span>
      </div>
      {s.skillRows.map(({ id, ability }) => {
        const bonus = skillOf(derived, id)?.bonus ?? derived.abilities[ability].mod
        const prof = skillProficiencyOf(derived, id) ?? 'none'
        const mode = skillModeOf(derived, id)
        const abilityMod = derived.abilities[ability].mod
        const profPart = prof === 'expertise' ? derived.proficiencyBonus * 2 : prof === 'proficient' ? derived.proficiencyBonus : 0
        const other = bonus - abilityMod - profPart
        const breakdown = [
          `${terms.abilityShort(ability, ability.toUpperCase())} ${formatModifier(abilityMod)}`,
          profPart ? `${prof === 'expertise' ? 'Expertise' : 'Proficiency'} ${formatModifier(profPart)}` : null,
          other ? `Other ${formatModifier(other)}` : null
        ]
          .filter(Boolean)
          .join(' · ')
        const passive = derived.skills[id.toLowerCase()]?.passive ?? 10 + bonus
        return (
          <HoverDetailCard
            key={id}
            title={id}
            subtitle={`${terms.abilityShort(ability, ability.toUpperCase())} skill · ${formatModifier(bonus)}`}
            fields={[
              { label: 'Bonus', value: breakdown },
              { label: 'Passive', value: String(passive) }
            ]}
            description={[SKILL_SUMMARIES[id], mode ? `You have ${mode === 'advantage' ? 'advantage' : 'disadvantage'} on these checks.` : ''].filter(Boolean).join('\n\n')}
          >
          <div className="gs-skill">
            <button
              type="button"
              className={`gs-dot${prof === 'proficient' ? ' gs-dot--proficient' : prof === 'expertise' ? ' gs-dot--expertise' : ''}`}
              disabled={s.readOnly}
              onClick={() => s.cycleSkillProficiency(id)}
              title={prof === 'none' ? 'Not proficient (click to cycle)' : prof === 'proficient' ? 'Proficient (click for expertise)' : 'Expertise (click to clear)'}
            />
            <button type="button" className="gs-skill-roll" disabled={s.readOnly} onClick={() => rollCheck(`${id} Check`, bonus, { advantage: mode ?? 'normal' })} title={`Roll ${id}`}>
              {formatModifier(bonus)}
            </button>
            <span className="gs-skill-name">
              {id}
              {mode && <AdvantageTag kind={mode} label={`${id} checks`} />}
            </span>
            <span className="gs-skill-ab">{terms.abilityShort(ability, ability.toUpperCase())}</span>
          </div>
          </HoverDetailCard>
        )
      })}
    </div>
  )
}

/** Passive scores, senses, damage resistances and the free-text proficiencies and languages. */
export function SensesCard({ s }: { s: SheetState }): JSX.Element {
  const { derived } = s.derivedSheet
  const passive = (id: string, fallback: Ability): number => derived.skills[id]?.passive ?? 10 + derived.abilities[fallback].mod
  return (
    <div className="gs-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="gs-label">Senses and defences</span>
      <div className="gs-hint" style={{ color: 'var(--text-secondary)' }}>
        Passive Perception {passive('perception', 'wis')} · Insight {passive('insight', 'wis')} · Investigation {passive('investigation', 'int')}
      </div>
      <ResistancesSection character={s.character} derived={derived} onSave={s.onSave} readOnly={s.readOnly} />
      <label className="gs-label">
        Other proficiencies and languages
        <textarea
          className="gb-input"
          style={{ minHeight: 60, resize: 'vertical', marginTop: 4, width: '100%', fontSize: 12 }}
          value={s.draft.otherProficiencies}
          disabled={s.readOnly}
          onChange={(e) => s.patch({ otherProficiencies: e.target.value })}
          placeholder="Armor, weapons, tools, languages…"
        />
      </label>
    </div>
  )
}

/** Exhaustion 6 is death; say so above everything else. */
export function DeathBanner({ s, name }: { s: SheetState; name: string }): JSX.Element | null {
  if (s.draft.exhaustionLevel < 6) return null
  return (
    <div className="gs-card" style={{ borderColor: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, var(--bg-surface))', color: 'var(--danger)', fontWeight: 600, textAlign: 'center' }}>
      Exhaustion 6: {name || 'this character'} has died.
    </div>
  )
}
