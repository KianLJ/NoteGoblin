import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ABILITIES, ALIGNMENTS, CLASSES, SKILLS, abilityModifier, formatModifier, type Ability, type AbilityScores, type SkillName } from '@shared/dnd5e'
import { FEATS } from '@shared/compendium'
import type { DerivedFeature } from '@shared/content/engine'
import { ChoiceList, PickField } from '../ChoiceCards'
import { HoverDetailCard } from '../HoverDetailCard'
import { readPortraitFile } from '../sheet/sheetBits'
import { describePackContents } from '@shared/content/packFiles'
import { OriginFeatChooser } from '../AsiChoosers'
import { registryForPacks } from '@shared/content/migrate'
import { srdPack } from '@shared/content/srd'
import { useTerms } from '../../content/terms'
import { generateNpcName } from '../../../data/npcNames'
import { Button } from '../../../ui/Button'
import { DiceIcon, IconLabel, MinusIcon, PlusIcon } from '../../../ui/icons'
import { BackgroundEmblem, ClassEmblem, SpeciesEmblem, backgroundPitch, classPitch, speciesPitch } from './art'
import { POINT_BUY_BUDGET, POINT_BUY_COST, type AbilityMethod, type Creator, type SpellOption } from './useCreator'
import { SkillTiles, SpellTiles } from './tiles'

const abilityShort = (a: Ability): string => a.toUpperCase()
const abilityName = (a: Ability): string => ABILITIES.find((x) => x.id === a)?.label ?? a
const listAnd = (items: string[]): string => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)
const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

// --- Shared pieces ----------------------------------------------------------------------------------------

export function CheckIcon({ size = 12 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  )
}

function Heading({ kicker, title, children, aside }: { kicker: string; title: string; children?: ReactNode; aside?: ReactNode }): JSX.Element {
  return (
    <div className="cc-heading">
      <div>
        <div className="cc-kicker">{kicker}</div>
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {aside}
    </div>
  )
}

function Card({ on, onClick, art, name, line, tags }: { on: boolean; onClick: () => void; art: ReactNode; name: string; line?: string; tags?: ReactNode }): JSX.Element {
  // A description too long for the card shows in full on hover.
  // A callback ref, since wrapping the card in the hover card remounts it: whichever line is on screen is the one measured.
  const [cut, setCut] = useState(false)
  const observer = useRef<ResizeObserver | null>(null)
  const lineRef = useCallback((el: HTMLSpanElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    const measure = (): void => setCut(el.scrollHeight > el.clientHeight + 1)
    measure()
    observer.current = new ResizeObserver(measure)
    observer.current.observe(el)
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])
  const button = (
    <button
      type="button"
      className={`cc-card${on ? ' cc-card--on' : ''}`}
      aria-pressed={on}
      onClick={() => {
        onClick()
        // Bring the chosen option's details (drawn below the cards) into view once they're there.
        requestAnimationFrame(() => document.querySelector('.cc-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      }}
    >
      {on && (
        <span className="cc-check">
          <CheckIcon />
        </span>
      )}
      <span className="cc-card-art">{art}</span>
      <span className="cc-card-name">{name}</span>
      {line && (
        <span className="cc-card-line" ref={lineRef}>
          {line}
        </span>
      )}
      {tags && <span className="cc-card-meta">{tags}</span>}
    </button>
  )
  if (!cut || !line) return button
  return (
    <HoverDetailCard title={name} fields={[]} description={line} width={340} interceptWheel={false}>
      {button}
    </HoverDetailCard>
  )
}

function Detail({ art, title, sub, children }: { art: ReactNode; title: string; sub?: string; children: ReactNode }): JSX.Element {
  return (
    <section className="cc-detail" key={title} style={{ scrollMarginTop: 16 }}>
      <div className="cc-detail-head">
        <span className="cc-card-art" style={{ background: 'var(--accent)', color: 'var(--text-on-accent)' }}>
          {art}
        </span>
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
      </div>
      <div className="cc-detail-body">{children}</div>
    </section>
  )
}

function Facts({ items }: { items: Array<[string, ReactNode]> }): JSX.Element {
  return (
    <div className="cc-facts">
      {items
        .filter(([, v]) => v !== null && v !== '' && v !== undefined)
        .map(([label, value]) => (
          <div className="cc-fact" key={label}>
            <div className="cc-fact-label">{label}</div>
            <div className="cc-fact-value">{value}</div>
          </div>
        ))}
    </div>
  )
}

function Features({ title, features }: { title: string; features: DerivedFeature[] }): JSX.Element | null {
  // One card per feature name (an engine feature can show up once per effect).
  const unique = features.filter((f, i) => features.findIndex((g) => g.name === f.name) === i)
  if (!unique.length) return null
  return (
    <div className="cc-task">
      <div className="cc-task-head">{title}</div>
      <div className="cc-features">
        {unique.map((f) => (
          <div className="cc-feature" key={f.key}>
            <strong>{f.name}</strong>
            {f.description && <p>{f.description}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Task({ title, count, children }: { title: string; count?: { have: number; need: number }; children: ReactNode }): JSX.Element {
  return (
    <div className="cc-task">
      <div className="cc-task-head">
        {title}
        {count && (
          <span className={`cc-task-count${count.have >= count.need ? ' cc-task-count--done' : ''}`}>
            {count.have}/{count.need}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function useDescription(c: Creator): (kind: 'classes' | 'species' | 'backgrounds', id: string) => { description: string; size?: string } {
  // Read from this character's own packs, not whatever's active.
  const registry = useMemo(() => registryForPacks([srdPack(), ...c.selectedPacks]), [c.selectedPacks])
  return (kind, id) => {
    const reg = registry.get(kind, id)
    return { description: reg?.def.description ?? '', size: kind === 'species' ? (reg?.def as { size?: string } | undefined)?.size : undefined }
  }
}

// --- Content packs --------------------------------------------------------------------------------------------

/**
 * Which homebrew packs this character uses. Only their classes, species,
 * backgrounds, feats and spells are offered, so packs never mix between
 * characters; the SRD is always there. A pack another one needs comes with it.
 */
function PackPicker({ c }: { c: Creator }): JSX.Element | null {
  if (c.packPool.length === 0 && c.missingPacks.length === 0) return null
  const chosen = new Set(c.selectedPacks.map((p) => p.id))
  const neededBy = (id: string): string[] => c.selectedPacks.filter((p) => p.id !== id && p.dependsOn.includes(id)).map((p) => p.name)
  return (
    <section className="cc-panel">
      <div className="cc-boost-head">
        <div>
          <div className="cc-task-head">Content for this character</div>
          <div className="cc-hint">Only the packs ticked here are offered while you build them (the SRD is always included). Other characters keep their own.</div>
        </div>
        <span className="cc-task-count">{chosen.size ? `${chosen.size} pack${chosen.size === 1 ? '' : 's'}` : 'SRD only'}</span>
      </div>
      <div className="cc-tiles">
        {c.packPool.map((p) => {
          const on = chosen.has(p.id)
          const by = neededBy(p.id)
          const locked = on && !c.packIds.includes(p.id) && by.length > 0
          return (
            <button key={p.id} type="button" className={`cc-tile${on ? ' cc-tile--on' : ''}`} onClick={() => !locked && c.togglePack(p.id)} aria-pressed={on} title={locked ? `${by.join(', ')} needs this pack` : undefined}>
              <span className="cc-tile-head">
                <span className="cc-tile-tick">{on && <CheckIcon size={11} />}</span>
                <span className="cc-tile-title">{p.name}</span>
                <span className="cc-tile-tag">v{p.version}</span>
              </span>
              <span className="cc-tile-text">{describePackContents(p) || 'No entries yet'}</span>
              {locked && <span className="cc-tile-reason">Needed by {listAnd(by)}</span>}
            </button>
          )
        })}
      </div>
      {c.missingPacks.length > 0 && <div className="cc-warn">This character uses {listAnd(c.missingPacks)}, which isn’t on this device or in this campaign. Their content won’t show until it is.</div>}
    </section>
  )
}

// --- 1. Class ----------------------------------------------------------------------------------------------

export function ClassStep({ c }: { c: Creator }): JSX.Element {
  const describe = useDescription(c)
  const cls = c.cls
  const prof = c.previewDerived.proficiencies
  return (
    <>
      <Heading kicker="Step 1" title="Choose a class">
        Your class is what your character does best: how they fight, what magic they use, and the skills they lean on. Pick the one that sounds most fun to play.
        {c.editing && c.level > 1 ? ` They stay level ${c.level}, with everything they’ve picked since 1st level.` : ''}
      </Heading>
      <PackPicker c={c} />
      <div className="cc-grid">
        {c.picker.classes.map((k) => {
          const pitch = classPitch(k.id, describe('classes', k.id).description)
          return (
            <Card
              key={k.id}
              on={k.id === cls?.id}
              onClick={() => c.chooseClass(k.id)}
              art={<ClassEmblem classId={k.id} />}
              name={k.name}
              line={pitch.line}
              tags={
                <>
                  <span className="cc-tag">d{k.hitDie}</span>
                  {k.primaryAbility.length > 0 && <span className="cc-tag">{k.primaryAbility.map(abilityShort).join(' / ')}</span>}
                  {(pitch.role ?? (k.spellcastingAbility ? ['Spellcaster'] : [])).slice(0, 2).map((r) => (
                    <span key={r} className="cc-tag cc-tag--accent">
                      {r}
                    </span>
                  ))}
                </>
              }
            />
          )
        })}
      </div>

      {cls && (
        <Detail art={<ClassEmblem classId={cls.id} size={34} />} title={cls.name} sub={classPitch(cls.id, describe('classes', cls.id).description).line}>
          <Facts
            items={[
              ['Hit points at 1st level', `${cls.hitDie} + Constitution modifier`],
              ['Hit die', `d${cls.hitDie}`],
              ['Main ability', cls.primaryAbility.map(abilityName).join(cls.id === 'fighter' ? ' or ' : ' and ') || null],
              ['Saving throws', cls.savingThrowProficiencies.map(abilityName).join(', ')],
              ['Armour', prof.armor.length ? capitalise(listAnd(prof.armor)) : 'None'],
              ['Weapons', prof.weapon.length ? capitalise(listAnd(prof.weapon)) : null],
              ['Spellcasting', cls.spellcastingAbility ? abilityName(cls.spellcastingAbility) : null]
            ]}
          />
          <Task title={`Choose ${cls.skillChoice.choose} skill${cls.skillChoice.choose === 1 ? '' : 's'}`} count={{ have: c.chosenSkills.length, need: cls.skillChoice.choose }}>
            <SkillTiles
              skills={cls.skillChoice.from}
              chosen={c.chosenSkills}
              max={cls.skillChoice.choose}
              locked={(sk) => (c.background?.skillProficiencies.includes(sk as SkillName) ? `Your ${c.background.name} background gives this` : undefined)}
              onToggle={(sk) => c.toggleSkill(sk as SkillName)}
            />
          </Task>
          {c.classLevelChoices.some((x) => !x.parentKey) && (
            <Task title="Your class’s choices">
              <ChoiceList choices={c.classLevelChoices} all={c.previewDerived.choices} onSetPicks={c.setClassChoice} />
            </Task>
          )}
          <Features title="What you get at 1st level" features={c.previewDerived.features.filter((f) => f.key.startsWith('class:'))} />
        </Detail>
      )}
    </>
  )
}

// --- 2. Background ---------------------------------------------------------------------------------------

export function BackgroundStep({ c }: { c: Creator }): JSX.Element {
  const describe = useDescription(c)
  const b = c.background
  const featFor = (id: string, featId: string): { name: string; description: string } | undefined => {
    const fromPack = c.picker.originFeatFor(id)
    if (fromPack) return fromPack
    const f = FEATS.find((x) => x.id === featId)
    return f ? { name: f.name, description: f.desc } : undefined
  }
  const feat = b ? featFor(b.id, b.featId) : undefined
  const overlap = b ? b.skillProficiencies.filter((sk) => c.chosenSkills.includes(sk)) : []
  return (
    <>
      <Heading kicker="Step 2 · Origin" title="Choose a background">
        Your background is what your character did before adventuring. It gives you an origin feat, two skills, a tool, and the abilities you can raise in step 4.
      </Heading>
      <div className="cc-grid">
        {c.picker.backgrounds.map((k) => {
          const f = featFor(k.id, k.featId)
          return (
            <Card
              key={k.id}
              on={k.id === b?.id}
              onClick={() => c.chooseBackground(k.id)}
              art={<BackgroundEmblem />}
              name={k.name}
              line={backgroundPitch(k.id, describe('backgrounds', k.id).description)}
              tags={
                <>
                  {f && <span className="cc-tag cc-tag--accent">{f.name}</span>}
                  {k.abilityScores.length > 0 && k.abilityScores.length < 6 && <span className="cc-tag">{k.abilityScores.map(abilityShort).join(' ')}</span>}
                </>
              }
            />
          )
        })}
      </div>

      {b && (
        <Detail art={<BackgroundEmblem size={34} />} title={b.name} sub={backgroundPitch(b.id, describe('backgrounds', b.id).description)}>
          <Facts
            items={[
              ['Abilities to raise', b.abilityScores.length ? b.abilityScores.map(abilityName).join(', ') : null],
              ['Skills', b.skillProficiencies.length ? b.skillProficiencies.join(', ') : null],
              ['Tool', b.toolProficiency || null],
              ['Origin feat', feat?.name ?? null]
            ]}
          />
          {overlap.length > 0 && (
            <div className="cc-fact" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>
                You already picked {listAnd(overlap)} for your class. This background gives {overlap.length > 1 ? 'them' : 'it'} too, so you could swap {overlap.length > 1 ? 'those' : 'that'} for different class skills.
              </span>
              <Button variant="secondary" onClick={() => c.setStep('class')}>
                Change class skills
              </Button>
            </div>
          )}
          {feat && (
            <div className="cc-features">
              <div className="cc-feature">
                <strong>Origin feat: {feat.name}</strong>
                <p>{feat.description || 'No description yet.'}</p>
              </div>
            </div>
          )}
          {c.featSpellChoice && (
            <Task title={`${c.backgroundFeat?.name}: choose your spells`}>
              <div className="cc-hint">Spellcasting ability</div>
              <PickField
                title="Spellcasting ability"
                options={c.featSpellChoice.classes
                  .map((k) => {
                    const a = CLASSES.find((x) => x.name === k)?.spellcastingAbility ?? 'int'
                    return { id: a, name: `${k} (${abilityName(a)})` }
                  })
                  .filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i)}
                selected={[c.featSpellAbility]}
                onChange={(ids) => ids[0] && c.setFeatSpellAbility(ids[0] as Ability)}
              />
              <div className="cc-hint">Two cantrips ({c.featCantrips.length}/2)</div>
              <PickField title="Two cantrips" options={c.grantableCantrips.map((s) => ({ id: s.id, name: s.name, description: s.description }))} selected={c.featCantrips} max={2} onChange={c.setFeatCantrips} />
              <div className="cc-hint">A level 1 spell</div>
              <PickField
                title="A level 1 spell"
                options={c.grantableLeveledSpells.map((s) => ({ id: s.id, name: s.name, description: s.description }))}
                selected={c.featLeveledSpellId ? [c.featLeveledSpellId] : []}
                onChange={(ids) => c.setFeatLeveledSpellId(ids[0] ?? '')}
              />
            </Task>
          )}
          <Features title="Also from this background" features={c.previewDerived.features.filter((f) => f.key.startsWith('background:') && !/ability|origin-feat|proficienc|equipment/i.test(f.key))} />
        </Detail>
      )}
    </>
  )
}

// --- 3. Species --------------------------------------------------------------------------------------------

export function SpeciesStep({ c }: { c: Creator }): JSX.Element {
  const describe = useDescription(c)
  const terms = useTerms()
  const r = c.race
  const speciesWord = terms.t('species', 'Species')
  const bgFeat = c.backgroundFeat
  return (
    <>
      <Heading kicker="Step 3 · Origin" title={`Choose a ${speciesWord.toLowerCase()}`}>
        Your {speciesWord.toLowerCase()} gives you traits like darkvision, a special resistance or a natural gift for magic. It doesn’t change your ability scores.
      </Heading>
      <div className="cc-grid">
        {c.picker.races.map((k) => (
          <Card
            key={k.id}
            on={k.id === r?.id}
            onClick={() => c.chooseSpecies(k.id)}
            art={<SpeciesEmblem name={k.name} />}
            name={k.name}
            line={speciesPitch(k.id, describe('species', k.id).description)}
            tags={
              <>
                <span className="cc-tag">Speed {k.speed} ft.</span>
                {k.traits.slice(0, 1).map((t) => (
                  <span key={t} className="cc-tag cc-tag--accent">
                    {t}
                  </span>
                ))}
              </>
            }
          />
        ))}
      </div>

      {r && (
        <Detail art={<SpeciesEmblem name={r.name} size={34} />} title={r.name} sub={speciesPitch(r.id, describe('species', r.id).description)}>
          <Facts
            items={[
              ['Speed', `${r.speed} ft.`],
              ['Size', describe('species', r.id).size ?? null],
              ['Senses', Object.values(c.previewDerived.senses).map((s) => `${s.name} ${s.range} ft.`).join(', ') || null],
              ['Languages', c.previewDerived.proficiencies.language.length ? listAnd(c.previewDerived.proficiencies.language) : null]
            ]}
          />
          {r.id === 'human' && (
            <>
              <Task title="Skillful: one more skill" count={{ have: c.humanSkill ? 1 : 0, need: 1 }}>
                <SkillTiles
                  skills={SKILLS.map((s) => s.id)}
                  chosen={c.humanSkill ? [c.humanSkill] : []}
                  max={1}
                  locked={(sk) => (c.chosenSkills.includes(sk as SkillName) ? 'From your class' : c.background?.skillProficiencies.includes(sk as SkillName) ? 'From your background' : undefined)}
                  onToggle={(sk) => c.setHumanSkill(c.humanSkill === sk ? null : (sk as SkillName))}
                />
              </Task>
              <Task title="Versatile: an origin feat">
                <OriginFeatChooser label="Versatile" level={0} onResolve={c.setHumanFeatChoice} taken={bgFeat && !bgFeat.repeatable ? [{ id: bgFeat.id, why: `Your ${c.background?.name} background already gives this` }] : []} />
              </Task>
            </>
          )}
          {c.duplicateOriginFeat && <div className="cc-warn">Your background already gives {bgFeat?.name}, and it can only be taken once. Pick a different Versatile feat.</div>}
          {c.lineageOptions.length > 0 && (
            <Task title={r.traits.includes('Elven Lineage') ? 'Elven Lineage' : r.traits.includes('Fiendish Legacy') ? 'Fiendish Legacy' : 'Gnomish Lineage'} count={{ have: c.lineage ? 1 : 0, need: 1 }}>
              <div className="cc-features">
                {c.lineageOptions.map((l) => (
                  <button key={l.name} type="button" className={`cc-card${c.lineage?.name === l.name ? ' cc-card--on' : ''}`} onClick={() => c.setLineageName(l.name)} style={{ padding: 'var(--space-3)' }}>
                    <span className="cc-card-name" style={{ fontSize: 15 }}>
                      {l.name}
                    </span>
                    <span className="cc-card-line cc-card-line--full">
                      {l.description}
                    </span>
                  </button>
                ))}
              </div>
              {c.lineage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="cc-hint">Cast its spells with</span>
                  {(['int', 'wis', 'cha'] as Ability[]).map((a) => (
                    <button key={a} type="button" className={`cc-chip${c.lineageAbility === a ? ' cc-chip--on' : ''}`} onClick={() => c.setLineageAbility(a)}>
                      {abilityName(a)}
                    </button>
                  ))}
                </div>
              )}
              {c.lineage?.level3SpellId && <div className="cc-hint">Its 3rd- and 5th-level spells are added when you reach those levels.</div>}
            </Task>
          )}
          {c.speciesExtraChoices.length > 0 && (
            <Task title="Your choices">
              <ChoiceList choices={c.speciesExtraChoices} all={c.previewDerived.choices} onSetPicks={c.setSpeciesChoice} />
            </Task>
          )}
          <Features title="Traits" features={c.previewDerived.features.filter((f) => f.key.startsWith('species:'))} />
        </Detail>
      )}
    </>
  )
}

// --- 4. Ability scores -------------------------------------------------------------------------------------

const METHODS: Array<{ id: AbilityMethod; name: string; hint: string }> = [
  { id: 'standard', name: 'Standard array', hint: 'Deal out 15, 14, 13, 12, 10 and 8' },
  { id: 'pointBuy', name: 'Point buy', hint: `Spend ${POINT_BUY_BUDGET} points, 8 to 15 each` },
  { id: 'roll', name: 'Roll', hint: '4d6, drop the lowest, six times' },
  { id: 'manual', name: 'Enter them', hint: 'Type in scores your DM gave you' }
]

export function AbilitiesStep({ c }: { c: Creator }): JSX.Element {
  const terms = useTerms()
  const keyAbilities = c.cls?.primaryAbility ?? []
  const used = c.usedPoolIndexes()
  const usedIndexes = Object.values(used)
  const dealing = c.abilityMethod === 'standard' || c.abilityMethod === 'roll'
  // The score you've picked up from the pool, to put on an ability next.
  const [held, setHeld] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<Ability | null>(null)
  const pointsLeft = POINT_BUY_BUDGET - c.pointsSpent

  const place = (ability: Ability, poolIndex: number): void => {
    c.assignFromPool(ability, poolIndex)
    setHeld(null)
  }
  const clickAbility = (ability: Ability): void => {
    if (!dealing) return
    if (held !== null) place(ability, held)
    else if (c.assignment[ability] !== null) c.clearAssignment(ability)
  }
  // With nothing held, the next free score is picked up for you, so clicking abilities in order just works.
  const nextFree = c.pool.findIndex((_, i) => !usedIndexes.includes(i))

  return (
    <>
      <Heading
        kicker="Step 4"
        title="Set your ability scores"
        aside={
          <div style={{ display: 'flex', gap: 8 }}>
            {c.abilityMethod !== 'manual' && c.cls ? (
              <Button variant="secondary" onClick={c.suggestScores} title={`Put the best scores where a ${c.cls.name} needs them`}>
                Suggest for {c.cls.name}
              </Button>
            ) : null}
            {c.abilityMethod === 'roll' && (
              <Button variant="secondary" onClick={c.rerollPool}>
                <IconLabel icon={<DiceIcon size={14} />}>Roll again</IconLabel>
              </Button>
            )}
          </div>
        }
      >
        Six abilities measure what your character is good at.
        {keyAbilities.length > 0 && c.cls ? ` As a ${c.cls.name}, ${listAnd(keyAbilities.map(abilityName))} matter${keyAbilities.length > 1 ? '' : 's'} most, and Constitution gives you more hit points.` : ''}
      </Heading>

      <div className="cc-methods">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`cc-method${c.abilityMethod === m.id ? ' cc-method--on' : ''}`}
            onClick={() => {
              setHeld(null)
              c.setAbilityMethod(m.id)
            }}
          >
            <strong>{m.name}</strong>
            <span>{m.hint}</span>
          </button>
        ))}
      </div>

      {dealing && (
        <div className="cc-tray">
          <div className="cc-tray-dice">
            {c.pool.map((v, i) => {
              const isUsed = usedIndexes.includes(i)
              return (
                <button
                  key={i}
                  type="button"
                  className={`cc-die${isUsed ? ' cc-die--used' : ''}${held === i ? ' cc-die--held' : ''}`}
                  disabled={isUsed}
                  draggable={!isUsed}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', String(i))
                    e.dataTransfer.effectAllowed = 'move'
                    setHeld(i)
                  }}
                  onDragEnd={() => setDragOver(null)}
                  onClick={() => setHeld(held === i ? null : i)}
                  aria-label={`Score ${v}`}
                >
                  {v}
                </button>
              )
            })}
          </div>
          <span className="cc-hint">
            {held !== null ? `Now click an ability to give it ${c.pool[held]}.` : usedIndexes.length === 6 ? 'All placed. Click an ability to take its score back.' : 'Pick a score, then click an ability (or drag it there).'}
          </span>
        </div>
      )}
      {c.abilityMethod === 'pointBuy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>Points spent</span>
            <strong style={{ color: pointsLeft < 0 ? 'var(--danger)' : undefined }}>
              {c.pointsSpent} / {POINT_BUY_BUDGET}
            </strong>
          </div>
          <div className="cc-budget">
            <div style={{ width: `${Math.min(100, (c.pointsSpent / POINT_BUY_BUDGET) * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="cc-abilities">
        {terms.abilities.map(({ id, label }) => {
          const base = c.baseScores[id]
          const bonus = c.backgroundBonuses[id] ?? 0
          const total = c.finalScores[id]
          const isKey = keyAbilities.includes(id)
          const unset = dealing && c.assignment[id] === null
          const target = dealing && (held !== null || dragOver === id)
          return (
            <div
              key={id}
              className={`cc-ability${isKey ? ' cc-ability--key' : ''}${dealing ? ' cc-ability--slot' : ''}${target ? ' cc-ability--target' : ''}${dragOver === id ? ' cc-ability--over' : ''}`}
              role={dealing ? 'button' : undefined}
              tabIndex={dealing ? 0 : undefined}
              onClick={() => clickAbility(id)}
              onKeyDown={(e) => {
                if (dealing && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  if (held === null && unset && nextFree >= 0) place(id, nextFree)
                  else clickAbility(id)
                }
              }}
              onDragOver={(e) => {
                if (!dealing) return
                e.preventDefault()
                setDragOver(id)
              }}
              onDragLeave={() => setDragOver((d) => (d === id ? null : d))}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(null)
                const i = Number(e.dataTransfer.getData('text/plain'))
                if (Number.isInteger(i)) place(id, i)
              }}
            >
              <div className="cc-ability-top">
                <span className="cc-ability-name">{label}</span>
                {isKey && <span className="cc-tag cc-tag--accent">Key for {c.cls?.name}</span>}
              </div>
              <div className="cc-ability-score">
                <span className={`cc-ability-total${unset ? ' cc-ability-total--empty' : ''}`}>{unset ? (held !== null ? c.pool[held] : '?') : total}</span>
                {!unset && <span className="cc-ability-mod">{formatModifier(abilityModifier(total))}</span>}
              </div>
              <div className="cc-ability-break">
                {unset ? (held !== null ? 'Click to place it here' : 'Drop a score here') : bonus ? `${base} base + ${bonus} from ${c.background?.name}` : `${base} base`}
              </div>
              {c.abilityMethod === 'pointBuy' && (
                <div className="cc-stepper">
                  <button type="button" disabled={c.pointBuy[id] <= 8} onClick={() => c.setPointBuy({ ...c.pointBuy, [id]: c.pointBuy[id] - 1 })} aria-label={`Lower ${label}`}>
                    <MinusIcon />
                  </button>
                  <button
                    type="button"
                    disabled={c.pointBuy[id] >= 15 || (POINT_BUY_COST[c.pointBuy[id] + 1] ?? 99) - POINT_BUY_COST[c.pointBuy[id]] > pointsLeft}
                    onClick={() => c.setPointBuy({ ...c.pointBuy, [id]: c.pointBuy[id] + 1 })}
                    aria-label={`Raise ${label}`}
                  >
                    <PlusIcon />
                  </button>
                  <span className="cc-hint">costs {POINT_BUY_COST[c.pointBuy[id]]}</span>
                </div>
              )}
              {c.abilityMethod === 'manual' && (
                <input
                  type="number"
                  min={3}
                  max={20}
                  className="gb-input"
                  value={c.manualScores[id]}
                  onChange={(e) => c.setManualScores({ ...c.manualScores, [id]: Number(e.target.value) })}
                  style={{ width: 90 }}
                  aria-label={label}
                />
              )}
            </div>
          )
        })}
      </div>

      <BackgroundBoost c={c} />
    </>
  )
}

/**
 * The background's ability increase, as a choice of two shapes (+2 and +1,
 * or +1 to three), then which abilities get them.
 */
function BackgroundBoost({ c }: { c: Creator }): JSX.Element | null {
  const b = c.background
  const options = b?.abilityScores ?? []
  if (!b || options.length === 0) return null
  const split = c.bonusMode === 'split'
  const plusTwo = options.find((a) => c.bonus[a] === 2) ?? null
  const plusOne = options.filter((a) => c.bonus[a] === 1)
  const setSplit = (): void => {
    c.setBonusMode('split')
    c.setBonus({})
  }
  const setEven = (): void => {
    c.setBonusMode('even')
    c.setBonus(options.length === 3 ? Object.fromEntries(options.map((a) => [a, 1])) : {})
  }
  // Picking the +2 on the ability that had the +1 moves the +1 off it.
  const pickTwo = (a: Ability): void => c.setBonus({ [a]: 2, ...(plusOne[0] && plusOne[0] !== a ? { [plusOne[0]]: 1 } : {}) })
  const pickOne = (a: Ability): void => c.setBonus({ ...(plusTwo ? { [plusTwo]: 2 } : {}), [a]: 1 })
  const toggleEven = (a: Ability): void => {
    const next = { ...c.bonus, [a]: c.bonus[a] ? 0 : 1 }
    if (Object.values(next).filter((v) => v === 1).length <= 3) c.setBonus(next)
  }
  return (
    <section className="cc-boost">
      <div className="cc-boost-head">
        <div>
          <div className="cc-task-head">Your {b.name} background boost</div>
          <div className="cc-hint">It raises {listAnd(options.map(abilityName))}. Choose how to spread it.</div>
        </div>
        <span className={`cc-task-count${c.bonusDone ? ' cc-task-count--done' : ''}`}>{c.bonusDone ? 'Done' : 'Not finished'}</span>
      </div>
      <div className="cc-boost-modes">
        <button type="button" className={`cc-method${split ? ' cc-method--on' : ''}`} onClick={setSplit}>
          <strong>+2 and +1</strong>
          <span>A big boost to one ability, a small one to another</span>
        </button>
        <button type="button" className={`cc-method${!split ? ' cc-method--on' : ''}`} onClick={setEven}>
          <strong>+1, +1, +1</strong>
          <span>A small boost to three abilities</span>
        </button>
      </div>
      {split ? (
        <div className="cc-boost-rows">
          <BoostRow label="+2 to" options={options} on={(a) => plusTwo === a} onPick={pickTwo} />
          <BoostRow label="+1 to" options={options} on={(a) => plusOne.includes(a)} disabled={(a) => a === plusTwo} onPick={pickOne} />
        </div>
      ) : options.length === 3 ? (
        <div className="cc-hint">{listAnd(options.map(abilityName))} each get +1.</div>
      ) : (
        <div className="cc-boost-rows">
          <BoostRow label="+1 to three" options={options} on={(a) => c.bonus[a] === 1} onPick={toggleEven} />
        </div>
      )}
    </section>
  )
}

function BoostRow({ label, options, on, disabled, onPick }: { label: string; options: Ability[]; on: (a: Ability) => boolean; disabled?: (a: Ability) => boolean; onPick: (a: Ability) => void }): JSX.Element {
  return (
    <div className="cc-boost-row">
      <span className="cc-boost-label">{label}</span>
      <div className="cc-segment">
        {options.map((a) => (
          <button key={a} type="button" className={on(a) ? 'on' : ''} disabled={disabled?.(a)} onClick={() => onPick(a)}>
            {abilityName(a)}
          </button>
        ))}
      </div>
    </div>
  )
}

// --- Spells ------------------------------------------------------------------------------------------------

export function SpellsStep({ c }: { c: Creator }): JSX.Element {
  const [query, setQuery] = useState('')
  const [origin, setOrigin] = useState<'all' | 'srd' | 'homebrew'>('all')
  const q = query.trim().toLowerCase()
  const isHomebrew = (s: SpellOption): boolean => s.id.startsWith('pack:')
  const hasHomebrew = [...c.cantripOptions, ...c.levelOneOptions].some(isHomebrew)
  const match = (s: SpellOption): boolean =>
    (origin === 'all' || (origin === 'homebrew') === isHomebrew(s)) && (!q || s.name.toLowerCase().includes(q) || s.school.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
  const source = c.casting.sources[0]
  const prepares = c.casting.preparedLimit !== null
  const chosenNames = (ids: string[], options: SpellOption[]): string => ids.map((id) => options.find((o) => o.id === id)?.name).filter(Boolean).join(', ')
  return (
    <>
      <Heading kicker="Step 5" title="Choose your spells">
        As a {c.cls?.name} you cast with {source ? abilityName(source.ability as Ability) : 'your spellcasting ability'}
        {c.casting.dc !== null ? `: your spell save DC is ${c.casting.dc} and your spell attack is ${formatModifier(c.casting.attackBonus ?? 0)}` : ''}. Hover a spell to read it in full.
        {prepares ? ' You can change which spells you have prepared after a long rest.' : ''}
      </Heading>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="gb-input" type="search" placeholder="Search spells by name, school or effect" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 420, maxWidth: '100%' }} />
        {hasHomebrew && (
          <div className="cc-segment" role="group" aria-label="Spell source">
            {(
              [
                ['all', 'All spells'],
                ['srd', 'SRD'],
                ['homebrew', 'Homebrew']
              ] as const
            ).map(([id, text]) => (
              <button key={id} type="button" className={origin === id ? 'on' : ''} onClick={() => setOrigin(id)}>
                {text}
              </button>
            ))}
          </div>
        )}
      </div>
      {c.cantripsNeeded > 0 && (
        <Task title={`Cantrips: choose ${c.cantripsNeeded}`} count={{ have: c.chosenCantrips.length, need: c.cantripsNeeded }}>
          <div className="cc-hint">Cantrips are spells you can cast as often as you like. {c.chosenCantrips.length ? `Chosen: ${chosenNames(c.chosenCantrips, c.cantripOptions)}.` : ''}</div>
          <SpellTiles spells={c.cantripOptions.filter(match)} chosen={c.chosenCantrips} full={c.chosenCantrips.length >= c.cantripsNeeded} onToggle={c.toggleSpell} />
        </Task>
      )}
      {c.spellsNeeded > 0 && (
        <Task title={`Level 1 spells: ${prepares ? 'prepare' : 'learn'} ${c.spellsNeeded}`} count={{ have: c.chosenLevelOne.length, need: c.spellsNeeded }}>
          <div className="cc-hint">
            These use your spell slots ({Object.values(c.casting.slots).reduce((n, pool) => n + (pool[1] ?? 0), 0)} at level 1).{' '}
            {c.chosenLevelOne.length ? `Chosen: ${chosenNames(c.chosenLevelOne, c.levelOneOptions)}.` : ''}
          </div>
          <SpellTiles spells={c.levelOneOptions.filter(match)} chosen={c.chosenLevelOne} full={c.chosenLevelOne.length >= c.spellsNeeded} onToggle={c.toggleSpell} />
        </Task>
      )}
    </>
  )
}

// --- Details -----------------------------------------------------------------------------------------------

const RANDOM_EYES = ['Brown', 'Blue', 'Green', 'Hazel', 'Amber', 'Grey', 'Violet', 'Black']
const RANDOM_SKIN = ['Pale', 'Fair', 'Olive', 'Tan', 'Bronze', 'Brown', 'Dark', 'Ashen', 'Grey', 'Green-tinged']
const RANDOM_HAIR = ['Black', 'Brown', 'Auburn', 'Blonde', 'Red', 'Silver', 'White', 'Bald', 'Braided black', 'Curly brown']
const randomOf = <T,>(pool: readonly T[]): T => pool[Math.floor(Math.random() * pool.length)]
const RANDOMIZERS: Record<string, () => string> = {
  age: () => `${18 + Math.floor(Math.random() * 60)}`,
  height: () => `${4 + Math.floor(Math.random() * 3)}'${Math.floor(Math.random() * 12)}"`,
  weight: () => `${100 + Math.floor(Math.random() * 150)} lbs`,
  eyes: () => randomOf(RANDOM_EYES),
  skin: () => randomOf(RANDOM_SKIN),
  hair: () => randomOf(RANDOM_HAIR)
}

/** What each alignment means, in a line. */
const ALIGNMENT_LINE: Record<string, string> = {
  'Lawful Good': 'Does what’s right, and keeps their word.',
  'Neutral Good': 'Helps others as best they can.',
  'Chaotic Good': 'Follows their conscience over any rule.',
  'Lawful Neutral': 'Lives by a code, a law or a tradition.',
  'True Neutral': 'Keeps out of moral fights; seeks balance.',
  'Chaotic Neutral': 'Follows their whims and prizes freedom.',
  'Lawful Evil': 'Takes what they want, within a strict code.',
  'Neutral Evil': 'Does whatever they can get away with.',
  'Chaotic Evil': 'Acts on cruel whims, with no restraint.'
}

/** Prompts for the four personality boxes, so a blank one isn't a wall. */
const PERSONALITY: Array<{ key: 'personalityTraits' | 'ideals' | 'bonds' | 'flaws'; label: string; prompt: string }> = [
  { key: 'personalityTraits', label: 'Personality', prompt: 'How do they act? Talkative, guarded, reckless, kind…' },
  { key: 'ideals', label: 'Ideals', prompt: 'What do they believe in or fight for?' },
  { key: 'bonds', label: 'Bonds', prompt: 'Who or what do they care about most?' },
  { key: 'flaws', label: 'Flaws', prompt: 'What gets them into trouble?' }
]

function RandomButton({ title, onClick }: { title: string; onClick: () => void }): JSX.Element {
  return (
    <button type="button" className="gb-btn gb-btn--secondary" title={title} aria-label={title} onClick={onClick} style={{ flexShrink: 0, padding: '0 10px' }}>
      <DiceIcon size={14} />
    </button>
  )
}

/** A portrait to click (or drop an image on); the class emblem stands in until there is one. */
function PortraitPicker({ c, size = 132 }: { c: Creator; size?: number }): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const take = (file: File | undefined): void => {
    if (file && file.type.startsWith('image/')) readPortraitFile(file).then(c.setPortrait, () => undefined)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        className={`cc-portrait${over ? ' cc-portrait--over' : ''}`}
        style={{ width: size, height: size }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          take(e.dataTransfer.files[0])
        }}
        title="Choose a portrait"
      >
        {c.portrait ? <img src={c.portrait} alt="" /> : c.cls ? <ClassEmblem classId={c.cls.id} size={size * 0.45} /> : <span>?</span>}
        <span className="cc-portrait-hint">{c.portrait ? 'Change' : 'Add a portrait'}</span>
      </button>
      {c.portrait && (
        <button type="button" className="gb-btn gb-btn--ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => c.setPortrait(null)}>
          Remove
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
    </div>
  )
}

export function DetailsStep({ c }: { c: Creator }): JSX.Element {
  const subtitle = [c.race?.name, c.cls ? `${c.cls.name} ${c.level}` : null, c.background?.name].filter(Boolean).join(' · ')
  return (
    <>
      <Heading kicker={`Step ${c.steps.indexOf('details') + 1}`} title="Who are they?">
        Give your character a name, a face, and a personality. Only the name is needed; the rest can wait, and it all stays editable on the sheet.
      </Heading>
      <div className="cc-two">
        <div className="cc-col">
          <section className="cc-panel cc-identity">
            <PortraitPicker c={c} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="gb-label">Name</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="gb-input cc-name-input" autoFocus value={c.name} onChange={(e) => c.setName(e.target.value)} placeholder="Name your character" style={{ flex: 1, minWidth: 0 }} />
                <RandomButton title="Random name" onClick={() => c.setName(generateNpcName(c.race?.name ?? 'Human'))} />
              </div>
              <span className="cc-hint">{subtitle}</span>
            </div>
          </section>

          <section className="cc-panel">
            <div className="cc-task-head">
              Alignment <span className="cc-task-count">{c.alignment || 'Unaligned'}</span>
            </div>
            <div className="cc-align">
              {ALIGNMENTS.map((a) => (
                <button key={a} type="button" className={c.alignment === a ? 'on' : ''} onClick={() => c.setAlignment(c.alignment === a ? '' : a)}>
                  <strong>{a}</strong>
                  <span>{ALIGNMENT_LINE[a]}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="cc-panel">
            <div className="cc-task-head">Appearance</div>
            <div className="cc-fields">
              {(['age', 'height', 'weight', 'eyes', 'skin', 'hair'] as const).map((field) => (
                <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="gb-label" style={{ textTransform: 'capitalize' }}>
                    {field}
                  </span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <input className="gb-input" value={c.appearance[field]} onChange={(e) => c.setAppearance({ ...c.appearance, [field]: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                    <RandomButton title={`Random ${field}`} onClick={() => c.setAppearance({ ...c.appearance, [field]: RANDOMIZERS[field]() })} />
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="cc-col">
          <section className="cc-panel">
            <div className="cc-task-head">Personality</div>
            <div className="cc-persona">
              {PERSONALITY.map((p) => (
                <label key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="gb-label">{p.label}</span>
                  <textarea className="gb-input" rows={3} value={c.personality[p.key]} onChange={(e) => c.setPersonality({ ...c.personality, [p.key]: e.target.value })} placeholder={p.prompt} style={{ resize: 'vertical' }} />
                </label>
              ))}
            </div>
          </section>
          <section className="cc-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="cc-task-head">Backstory</div>
            <textarea
              className="gb-input"
              value={c.backstory}
              onChange={(e) => c.setBackstory(e.target.value)}
              placeholder="Where they come from, what they want, who they left behind…"
              style={{ flex: 1, minHeight: 180, resize: 'vertical' }}
            />
          </section>
        </div>
      </div>
    </>
  )
}

// --- Review ------------------------------------------------------------------------------------------------

type EditableStep = 'class' | 'background' | 'species' | 'abilities' | 'spells' | 'details'

export function ReviewStep({ c, onEdit }: { c: Creator; onEdit: (step: EditableStep) => void }): JSX.Element {
  const d = c.derived
  const scores: AbilityScores = c.finalScores
  const skills = Object.values(d.skills)
    .filter((s) => s.proficiency)
    .map((s) => `${s.name} ${formatModifier(s.bonus)}`)
  const feats = [c.backgroundFeat?.name ?? (c.background ? c.picker.originFeatFor(c.background.id)?.name : undefined), c.humanFeatChoice ? FEATS.find((f) => f.id === c.humanFeatChoice?.featId)?.name : undefined].filter(Boolean) as string[]
  const spells = c.built.spells.map((s) => s.name)
  const traits = d.features.filter((f, i) => !f.key.startsWith('background:') && d.features.findIndex((g) => g.name === f.name) === i).map((f) => f.name)
  const subtitle = [c.race ? `${c.race.name}${c.lineage ? ` (${c.lineage.name})` : ''}` : null, c.cls ? `${c.cls.name} ${c.level}` : null].filter(Boolean).join(' ')
  const story = PERSONALITY.filter((p) => c.personality[p.key].trim())

  const choice = (label: string, value: ReactNode, step: EditableStep): JSX.Element => (
    <div className="cc-choice">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="cc-fact-label">{label}</div>
        <div className="cc-fact-value">{value || '—'}</div>
      </div>
      <button type="button" className="gb-btn gb-btn--ghost" onClick={() => onEdit(step)} style={{ fontSize: 12 }}>
        Change
      </button>
    </div>
  )
  const list = (title: string, items: string[], empty = 'None'): JSX.Element => (
    <section className="cc-panel">
      <div className="cc-task-head">
        {title} <span className="cc-task-count">{items.length || ''}</span>
      </div>
      <div className="cc-chips">{items.length ? items.map((s) => <span key={s} className="cc-tag cc-tag--accent" style={{ fontSize: 12, padding: '4px 10px' }}>{s}</span>) : <span className="cc-hint">{empty}</span>}</div>
    </section>
  )

  return (
    <>
      <section className="cc-hero">
        <PortraitPicker c={c} size={120} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cc-kicker">Step {c.steps.indexOf('review') + 1} · Ready to go</div>
          <h2 className="cc-hero-name">{c.name.trim() || 'Unnamed hero'}</h2>
          <div className="cc-hero-sub">
            {subtitle}
            {c.background ? ` · ${c.background.name}` : ''}
            {c.alignment ? ` · ${c.alignment}` : ''}
          </div>
          <div className="cc-hero-stats">
            {(
              [
                ['Hit points', d.maxHp],
                ['Armour class', d.armorClass],
                ['Initiative', formatModifier(d.initiative)],
                ['Speed', `${d.speeds.walk ?? c.race?.speed ?? 30} ft.`],
                ['Proficiency', formatModifier(d.proficiencyBonus)],
                ...(d.spellcasting.dc !== null ? ([['Spell save DC', d.spellcasting.dc]] as const) : [])
              ] as Array<readonly [string, string | number]>
            ).map(([label, value]) => (
              <div key={label} className="cc-hero-stat">
                <b>{value}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="cc-review-abilities">
        {ABILITIES.map((a) => (
          <div key={a.id} className={`cc-review-ability${d.saves[a.id]?.proficiency ? ' cc-review-ability--save' : ''}`}>
            <span>{a.label}</span>
            <b>{formatModifier(abilityModifier(scores[a.id]))}</b>
            <i>{scores[a.id]}</i>
            {d.saves[a.id]?.proficiency && <small>Save proficiency</small>}
          </div>
        ))}
      </div>

      <div className="cc-two">
        <div className="cc-col">
          <section className="cc-panel">
            <div className="cc-task-head">Your choices</div>
            <div className="cc-choices">
              {choice('Class', c.cls ? `${c.cls.name} ${c.level}` : '', 'class')}
              {choice('Background', c.background?.name, 'background')}
              {choice('Species', c.race ? `${c.race.name}${c.lineage ? ` (${c.lineage.name})` : ''}` : '', 'species')}
              {choice('Ability scores', ABILITIES.map((a) => `${abilityShort(a.id)} ${scores[a.id]}`).join(' · '), 'abilities')}
              {c.isCaster && choice('Spells', `${spells.length} chosen`, 'spells')}
              {choice('Name, look and story', [c.name.trim(), c.alignment, c.appearance.age && `age ${c.appearance.age}`].filter(Boolean).join(', '), 'details')}
            </div>
          </section>
          {story.length > 0 || c.backstory.trim() ? (
            <section className="cc-panel">
              <div className="cc-task-head">Story</div>
              {story.map((p) => (
                <div key={p.key} style={{ fontSize: 13 }}>
                  <span className="cc-fact-label">{p.label}</span>
                  <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{c.personality[p.key]}</div>
                </div>
              ))}
              {c.backstory.trim() && (
                <div style={{ fontSize: 13 }}>
                  <span className="cc-fact-label">Backstory</span>
                  <div className="cc-review-backstory">{c.backstory}</div>
                </div>
              )}
            </section>
          ) : null}
        </div>
        <div className="cc-col">
          {list('Skills', skills)}
          {list('Feats', feats)}
          {c.isCaster && list('Spells', spells)}
          {list('Features and traits', traits)}
          {list('Starting equipment', c.built.equipment.map((e) => `${e.quantity > 1 ? `${e.quantity} × ` : ''}${e.name}`))}
        </div>
      </div>
    </>
  )
}
