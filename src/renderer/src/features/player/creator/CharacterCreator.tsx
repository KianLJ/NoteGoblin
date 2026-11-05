import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ABILITIES, formatModifier, type CharacterSheetData } from '@shared/dnd5e'
import type { CharacterSheet } from '@shared/ipc'
import { FEATS } from '@shared/compendium'
import { Button } from '../../../ui/Button'
import { ArrowLeftIcon, ArrowRightIcon } from '../../../ui/icons'
import { useTerms } from '../../content/terms'
import { ClassEmblem } from './art'
import { AbilitiesStep, BackgroundStep, CheckIcon, ClassStep, DetailsStep, ReviewStep, SpeciesStep, SpellsStep } from './steps'
import { missingFor, useCreator, type Creator, type StepId } from './useCreator'
import './creator.css'

/**
 * The character creator: a full page that walks through the 2024 order —
 * class, background, species, ability scores, then name and details — with
 * the character filling in on a card beside it as you choose. Every pick
 * runs through the rules engine, so homebrew classes, species and
 * backgrounds show their own features and choices here too.
 */
export function CharacterCreator({
  initial,
  campaignPackIds,
  onCreate,
  onClose
}: {
  /** A character to edit, filled in; omitted for a new one. */
  initial?: CharacterSheet | null
  /** The open campaign's packs, for a new character to start on. */
  campaignPackIds?: string[] | null
  onCreate: (name: string, sheet: CharacterSheetData) => void
  onClose: () => void
}): JSX.Element {
  const c = useCreator({ initial, campaignPackIds })
  const terms = useTerms()
  const mainRef = useRef<HTMLDivElement>(null)
  const index = c.steps.indexOf(c.step)
  const label: Record<StepId, string> = {
    class: 'Class',
    background: terms.t('background', 'Background'),
    species: terms.t('species', 'Species'),
    abilities: 'Ability Scores',
    spells: 'Spells',
    details: 'Details',
    review: 'Review'
  }

  // Each step starts at the top.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [c.step])

  const go = (s: StepId): void => {
    if (c.reachable(s)) c.setStep(s)
  }
  const next = c.steps[index + 1]
  const canNext = c.done[c.step]

  return (
    <div className="cc">
      <header className="cc-top">
        <span className="cc-title">{c.editing ? `Editing ${initial?.name || 'character'}` : 'New character'}</span>
        <nav className="cc-steps" aria-label="Steps">
          {c.steps.map((s, i) => {
            const isDone = c.done[s] && s !== c.step && s !== 'review'
            return (
              <span key={s} style={{ display: 'contents' }}>
                {i > 0 && <span className={`cc-step-line${c.steps.slice(0, i).every((p) => c.done[p]) ? ' cc-step-line--done' : ''}`} />}
                <button type="button" className={`cc-step${s === c.step ? ' cc-step--on' : ''}${isDone ? ' cc-step--done' : ''}`} disabled={!c.reachable(s)} onClick={() => go(s)} aria-current={s === c.step ? 'step' : undefined} title={label[s]}>
                  <span className="cc-step-dot">{isDone ? <CheckIcon /> : i + 1}</span>
                  <span className="cc-step-label">{label[s]}</span>
                </button>
              </span>
            )
          })}
        </nav>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </header>

      <div className="cc-body">
        <main className="cc-main" ref={mainRef}>
          <div className="cc-main-inner cc-enter" key={c.step}>
            {c.step === 'class' && <ClassStep c={c} />}
            {c.step === 'background' && <BackgroundStep c={c} />}
            {c.step === 'species' && <SpeciesStep c={c} />}
            {c.step === 'abilities' && <AbilitiesStep c={c} />}
            {c.step === 'spells' && <SpellsStep c={c} />}
            {c.step === 'details' && <DetailsStep c={c} />}
            {c.step === 'review' && <ReviewStep c={c} onEdit={go} />}
          </div>
        </main>
        <aside className="cc-side" aria-label="Your character so far">
          <LiveSheet c={c} />
        </aside>
      </div>

      <footer className="cc-foot">
        {index > 0 && (
          <Button variant="secondary" onClick={() => c.setStep(c.steps[index - 1])}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeftIcon /> Back
            </span>
          </Button>
        )}
        <span className="cc-foot-status">{canNext ? '' : missingFor(c)}</span>
        {next ? (
          <Button variant="primary" disabled={!canNext} onClick={() => c.setStep(next)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Next: {label[next]} <ArrowRightIcon />
            </span>
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!c.steps.every((s) => c.done[s])}
            onClick={() => {
              const { name, sheet } = c.finish()
              onCreate(name, sheet)
            }}
          >
            {c.editing ? 'Save changes' : 'Create character'}
          </Button>
        )}
      </footer>
    </div>
  )
}

/** The character as it stands, worked out by the rules engine: it fills in as you choose, and briefly lights up what just changed. */
function LiveSheet({ c }: { c: Creator }): JSX.Element {
  const d = c.derived
  const hasScores = c.done.abilities || c.step === 'abilities' || c.editing
  const subtitle = [c.race ? `${c.race.name}${c.lineage ? ` (${c.lineage.name})` : ''}` : null, c.cls ? `${c.cls.name} ${c.level}` : null].filter(Boolean).join(' ')
  const skills = Object.values(d.skills)
    .filter((s) => s.proficiency)
    .map((s) => s.name)
  const feats = [c.backgroundFeat?.name ?? (c.background ? c.picker.originFeatFor(c.background.id)?.name : undefined), c.humanFeatChoice ? FEATS.find((f) => f.id === c.humanFeatChoice?.featId)?.name : undefined].filter(Boolean) as string[]
  // A background's own features are bookkeeping (its increases, feat and proficiencies show elsewhere on the card).
  const traits = d.features.filter((f) => !f.key.startsWith('background:'))
  const features = traits.filter((f, i) => traits.findIndex((g) => g.name === f.name) === i).map((f) => f.name)

  return (
    <div className="cc-sheet">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {c.cls && (
          <span className="cc-card-art" style={{ width: 44, height: 44, background: 'var(--accent)', color: 'var(--text-on-accent)' }}>
            <ClassEmblem classId={c.cls.id} size={30} />
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <div className={`cc-sheet-name${c.name.trim() ? '' : ' cc-sheet-name--empty'}`}>{c.name.trim() || 'Unnamed hero'}</div>
          <div className="cc-sheet-sub">{subtitle || 'Pick a class to begin'}</div>
          {c.background && <div className="cc-sheet-sub">{c.background.name}{c.alignment ? ` · ${c.alignment}` : ''}</div>}
        </div>
      </div>

      <div className="cc-vitals">
        <Flash value={c.cls ? d.maxHp : '—'}>
          <span>Hit points</span>
        </Flash>
        <Flash value={c.cls ? d.armorClass : '—'}>
          <span>Armour class</span>
        </Flash>
        <Flash value={c.race ? `${d.speeds.walk ?? c.race.speed}` : '—'}>
          <span>Speed</span>
        </Flash>
      </div>

      <div className="cc-sheet-abilities">
        {ABILITIES.map((a) => {
          const ab = d.abilities[a.id]
          const save = d.saves[a.id]
          return (
            <FlashBox key={a.id} watch={hasScores ? ab.score : 0} className="cc-sheet-ability">
              <small>
                {a.id.toUpperCase()}
                {save?.proficiency ? ' · save' : ''}
              </small>
              <b>{hasScores ? ab.score : '—'}</b>
              <i>{hasScores ? formatModifier(ab.mod) : ' '}</i>
            </FlashBox>
          )
        })}
      </div>

      <Section title="Skills" items={skills} empty="From your class, background and species" />
      <Section title="Feats" items={feats} empty="Your background gives one" />
      <Section title="Features and traits" items={features} empty="They appear as you choose" />
      <Section title="Languages" items={d.proficiencies.language} />
      {(d.spellcasting.granted.length > 0 || c.built.spells.length > 0) && <Section title="Spells" items={[...new Set([...c.built.spells.map((s) => s.name), ...d.spellcasting.granted.map((s) => s.name)])]} />}
    </div>
  )
}

function Section({ title, items, empty }: { title: string; items: string[]; empty?: string }): JSX.Element | null {
  if (!items.length && !empty) return null
  return (
    <div className="cc-sheet-section">
      <h4>{title}</h4>
      <FlashBox watch={items.join('|')}>{items.length ? items.join(', ') : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{empty}</span>}</FlashBox>
    </div>
  )
}

function Flash({ value, children }: { value: string | number; children: ReactNode }): JSX.Element {
  return (
    <FlashBox watch={value} className="cc-vital">
      <b>{value}</b>
      {children}
    </FlashBox>
  )
}

/** A box that briefly lights up when `watch` changes (after the first draw). */
function FlashBox({ watch, className, children }: { watch: unknown; className?: string; children: ReactNode }): JSX.Element {
  const [tick, setTick] = useState(0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setTick((t) => t + 1)
  }, [watch])
  return (
    <div key={tick} className={`${className ?? ''}${tick ? ' cc-flash' : ''}`}>
      {children}
    </div>
  )
}
