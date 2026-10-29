import { useEffect, useState, type ReactNode } from 'react'
import { ABILITIES, formatModifier } from '@shared/dnd5e'
import type { CloudCharacter } from '@shared/cloudCharacter'
import type { KnownSpell } from '@shared/content/sheet'
import { getCharacter } from '../api'
import { useLoad } from '../data'
import { Status } from './Status'
import { AdvantageTag, RollChip, damageRoll, rollCheck, rollDamage } from '../roll'

const PROFICIENCY_MARK: Record<string, string> = { half: '½', proficient: '●', expertise: '◆' }
const PROFICIENCY_LABEL = { armor: 'Armor', weapon: 'Weapons', tool: 'Tools', language: 'Languages' } as const
const RECHARGE_LABEL: Record<string, string> = { long: 'long rest', short: 'short rest' }

/** A feature's source is a content pack id for anything curated ("srd-5.2.1") — only worth showing when it's something a person wrote, like a DM boon. */
function featureSource(source: string): string | undefined {
  return /^[a-z0-9.-]+$/.test(source) ? undefined : source
}
const SPELL_LEVEL_NAME = ['Cantrips', '1st level', '2nd level', '3rd level', '4th level', '5th level', '6th level', '7th level', '8th level', '9th level']

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }): JSX.Element {
  return (
    <details className="v-section" open={open}>
      <summary>{title}</summary>
      <div className="v-section-body">{children}</div>
    </details>
  )
}

function Stat({ label, value, sub, onRoll }: { label: string; value: ReactNode; sub?: ReactNode; onRoll?: () => void }): JSX.Element {
  const body = (
    <>
      <span className="v-stat-label">{label}</span>
      <span className="v-stat-value">{value}</span>
      {sub && <span className="v-stat-sub">{sub}</span>}
    </>
  )
  return onRoll ? (
    <button type="button" className="v-stat v-stat--roll" onClick={onRoll} title={`Roll ${label.toLowerCase()}`}>
      {body}
    </button>
  ) : (
    <div className="v-stat">{body}</div>
  )
}

/**
 * One known spell, as the desktop Spells tab card rolls it: its damage or
 * healing at the slot level you'd cast it with — the lowest one with slots
 * by default, any higher one you pick to upcast.
 */
function SpellEntry({ spell, numbersByLevel, roller }: { spell: KnownSpell; numbersByLevel?: Record<number, NonNullable<CloudCharacter['derived']['spellNumbers']>[string][number]>; roller: string }): JSX.Element {
  const castLevels = Object.keys(numbersByLevel ?? {})
    .map(Number)
    .sort((a, b) => a - b)
  const [castAt, setCastAt] = useState<number | undefined>(undefined)
  const level = castAt !== undefined && castLevels.includes(castAt) ? castAt : castLevels[0]
  const numbers = level !== undefined ? numbersByLevel?.[level] : undefined
  const dice = numbers?.damage ?? numbers?.healing
  const roll = dice ? damageRoll(dice) : null
  const rollLabel = `${spell.name} ${numbers?.damage ? 'Damage' : 'Healing'}`

  const meta = (
    <>
      {[spell.castingTime, spell.range, spell.concentration && 'Concentration', spell.ritual && 'Ritual'].filter(Boolean).join(' · ')}
      {numbers?.attackBonus !== undefined && <span className="v-spell-num">Atk {formatModifier(numbers.attackBonus)}</span>}
      {numbers?.saveDc !== undefined && (
        <span className="v-spell-num">
          {(numbers.saveAbility ?? '').toUpperCase()} DC {numbers.saveDc}
        </span>
      )}
      {dice &&
        (roll ? (
          <RollChip onRoll={() => rollDamage(roller, [roll.group], roll.flat, rollLabel)}>
            {numbers?.damage ? `${dice}${numbers.damageType ? ` ${numbers.damageType.toLowerCase()}` : ''}` : `Heals ${dice}`}
          </RollChip>
        ) : (
          <span className="v-spell-num">{numbers?.damage ? dice : `Heals ${dice}`}</span>
        ))}
      {castLevels.length > 1 && (
        <select
          className="v-cast-level"
          value={level}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setCastAt(Number(e.target.value))}
          aria-label={`Cast ${spell.name} at level`}
        >
          {castLevels.map((l) => (
            <option key={l} value={l}>
              Lvl {l}
            </option>
          ))}
        </select>
      )}
    </>
  )
  return (
    <Entry
      title={
        <>
          {spell.name}
          {spell.grantedBy && <span className="v-muted v-granted"> · {spell.grantedBy}</span>}
        </>
      }
      meta={meta}
      description={[spell.description, spell.higherLevel && `At higher levels: ${spell.higherLevel}`].filter(Boolean).join('\n\n')}
    />
  )
}

/** A name with its rules text tucked behind a tap — feature and spell descriptions are long, a phone screen isn't. */
function Entry({ title, meta, description }: { title: ReactNode; meta?: ReactNode; description?: string }): JSX.Element {
  if (!description?.trim()) {
    return (
      <div className="v-entry">
        <span className="v-entry-title">{title}</span>
        {meta && <span className="v-entry-meta">{meta}</span>}
      </div>
    )
  }
  return (
    <details className="v-entry">
      <summary>
        <span className="v-entry-title">{title}</span>
        {meta && <span className="v-entry-meta">{meta}</span>}
      </summary>
      <p className="v-entry-text">{description}</p>
    </details>
  )
}

function Body({ character }: { character: CloudCharacter }): JSX.Element {
  const { sheet, derived } = character
  const roller = character.name || 'You'
  const knownSpells: KnownSpell[] = derived.knownSpells ?? sheet.spells
  const walk = derived.speeds.walk ?? Object.values(derived.speeds)[0]
  const otherSpeeds = Object.entries(derived.speeds).filter(([name]) => name !== 'walk')
  const perception = derived.skills.find((s) => s.name === 'Perception')

  // Slots: totals from the engine (they follow class levels), used from the sheet.
  const slotLevels = new Map<number, number>()
  for (const pool of Object.values(derived.spellcasting.slots)) {
    for (const [level, count] of Object.entries(pool)) slotLevels.set(Number(level), (slotLevels.get(Number(level)) ?? 0) + count)
  }
  const spellsByLevel = new Map<number, KnownSpell[]>()
  for (const spell of [...knownSpells].sort((a, b) => a.name.localeCompare(b.name))) {
    spellsByLevel.set(spell.level, [...(spellsByLevel.get(spell.level) ?? []), spell])
  }

  const featureNames = new Set(derived.features.map((f) => f.name.toLowerCase()))
  const extraFeatures = sheet.features.filter((f) => !featureNames.has(f.name.toLowerCase()))
  const currency = (['pp', 'gp', 'ep', 'sp', 'cp'] as const).filter((c) => sheet.currency[c])
  const relations = [
    ['Resistant', derived.damageRelations.resistances],
    ['Immune', [...derived.damageRelations.immunities, ...derived.conditionImmunities]],
    ['Vulnerable', derived.damageRelations.vulnerabilities]
  ] as const
  const personality = [
    ['Personality', sheet.personalityTraits],
    ['Ideals', sheet.ideals],
    ['Bonds', sheet.bonds],
    ['Flaws', sheet.flaws],
    ['Backstory', sheet.backstory]
  ].filter(([, text]) => text.trim())

  return (
    <div className="v-stack">
      <header className="v-hero">
        {sheet.portraitDataUrl && <img className="v-portrait" src={sheet.portraitDataUrl} alt="" />}
        <div>
          <h2 className="v-hero-name">{character.name || 'Unnamed character'}</h2>
          {character.subtitle && <p className="v-hero-sub">{character.subtitle}</p>}
          <p className="v-hero-sub v-muted">
            Level {derived.level}
            {sheet.background && ` · ${sheet.background}`}
            {sheet.alignment && ` · ${sheet.alignment}`}
          </p>
        </div>
      </header>

      <div className="v-stats">
        <Stat
          label="Hit points"
          value={
            <>
              {sheet.currentHp}
              <span className="v-stat-of">/{derived.maxHp}</span>
            </>
          }
          sub={sheet.tempHp ? `+${sheet.tempHp} temp` : undefined}
        />
        <Stat label="Armor class" value={derived.armorClass} />
        <Stat
          label="Initiative"
          value={
            <>
              {formatModifier(derived.initiative)}
              <AdvantageTag kind={derived.initiativeMode} label="Initiative" />
            </>
          }
          onRoll={() => rollCheck(roller, 'Initiative', derived.initiative, { advantage: derived.initiativeMode ?? 'normal' })}
        />
        <Stat label="Speed" value={`${walk ?? 30} ft`} sub={otherSpeeds.map(([name, ft]) => `${name} ${ft}`).join(', ') || undefined} />
        <Stat label="Proficiency" value={formatModifier(derived.proficiencyBonus)} />
        {perception && <Stat label="Passive Perception" value={perception.passive} />}
      </div>

      {(sheet.exhaustionLevel > 0 || sheet.inspiration || sheet.currentHp <= 0) && (
        <div className="v-flags">
          {sheet.inspiration && <span className="gb-badge gb-badge--accent">Inspired</span>}
          {sheet.exhaustionLevel > 0 && <span className="gb-badge gb-badge--danger">Exhaustion {sheet.exhaustionLevel}</span>}
          {sheet.currentHp <= 0 && (
            <span className="gb-badge gb-badge--danger">
              Death saves {sheet.deathSaves.successes}✓ {sheet.deathSaves.failures}✗
            </span>
          )}
        </div>
      )}

      <div className="v-abilities">
        {ABILITIES.map((a) => {
          const score = derived.abilities[a.id]
          const save = derived.saves[a.id]
          const checkMode = derived.checkModes?.[a.id]
          return (
            <div key={a.id} className="v-ability">
              <button
                type="button"
                className="v-ability-check"
                onClick={() => rollCheck(roller, `${a.label} Check`, score?.mod ?? 0, { advantage: checkMode ?? 'normal' })}
                title={`Roll a ${a.label} check`}
              >
                <span className="v-ability-name">
                  {a.id.toUpperCase()}
                  <AdvantageTag kind={checkMode} label={`${a.label} checks`} />
                </span>
                <span className="v-ability-mod">{formatModifier(score?.mod ?? 0)}</span>
                <span className="v-ability-score">{score?.score ?? '—'}</span>
              </button>
              {save && (
                <button
                  type="button"
                  className={save.proficiency ? 'v-ability-save v-ability-save--prof' : 'v-ability-save'}
                  onClick={() => rollCheck(roller, `${a.label} Saving Throw`, save.bonus, { advantage: save.mode ?? 'normal' })}
                  title={`Roll a ${a.label} saving throw`}
                >
                  Save {formatModifier(save.bonus)}
                  <AdvantageTag kind={save.mode} label={`${a.label} saves`} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {derived.attacks.length > 0 && (
        <Section title="Attacks" open>
          {derived.attacks.map((a, i) => {
            // Same rule as the desktop's rollDerivedDamage: one kind of standard die plus a flat amount.
            const single = a.damageDice && a.damageDice.dice.length === 1 ? a.damageDice : null
            const damage = single
              ? damageRoll(`${single.dice[0].count}d${single.dice[0].sides}${single.flat ? (single.flat > 0 ? ` + ${single.flat}` : ` - ${-single.flat}`) : ''}`)
              : a.damageDice
                ? null
                : damageRoll(a.damage)
            const damageText = [`${a.damage} ${a.damageType}`.trim(), ...a.extraDamage.map((x) => `${x.damage}${x.damageType ? ` ${x.damageType}` : ''}`)].join(' + ')
            const mode = a.mode ?? derived.attackMode
            return (
              <Entry
                key={`${a.name}-${i}`}
                title={
                  <>
                    {a.name}
                    <AdvantageTag kind={mode} label={`${a.name} attacks`} />
                  </>
                }
                meta={
                  <>
                    <RollChip
                      onRollWith={(advantage) =>
                        rollCheck(roller, `${a.name} Attack`, a.attackBonus, {
                          advantage: advantage !== 'normal' ? advantage : (mode ?? 'normal'),
                          critOn: derived.critThreshold
                        })
                      }
                    >
                      {formatModifier(a.attackBonus)}
                    </RollChip>
                    {damage ? (
                      <RollChip onRoll={() => rollDamage(roller, [damage.group], damage.flat, `${a.name} Damage`)}>{damageText}</RollChip>
                    ) : (
                      <span>{damageText}</span>
                    )}
                  </>
                }
                description={a.description}
              />
            )
          })}
        </Section>
      )}

      <Section title="Skills">
        <div className="v-skills">
          {derived.skills
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => (
              <button
                key={s.name}
                type="button"
                className="v-skill"
                onClick={() => rollCheck(roller, `${s.name} Check`, s.bonus, { advantage: s.mode ?? 'normal' })}
                title={`Roll ${s.name}`}
              >
                <span className="v-skill-prof">{s.proficiency ? PROFICIENCY_MARK[s.proficiency] : ''}</span>
                <span className="v-skill-name">
                  {s.name} <span className="v-muted">({s.ability.toUpperCase()})</span>
                  <AdvantageTag kind={s.mode} label={`${s.name} checks`} />
                </span>
                <span className="v-skill-bonus">{formatModifier(s.bonus)}</span>
              </button>
            ))}
        </div>
      </Section>

      {(knownSpells.length > 0 || derived.spellcasting.dc !== null) && (
        <Section title="Spells">
          {derived.spellcasting.dc !== null && (
            <p className="v-spell-summary">
              <span className="v-muted">
                Save DC <strong>{derived.spellcasting.dc}</strong>
              </span>
              {derived.spellcasting.attackBonus !== null && (
                <RollChip onRoll={() => rollCheck(roller, 'Spell Attack', derived.spellcasting.attackBonus ?? 0)} title="Roll a spell attack">
                  Spell attack {formatModifier(derived.spellcasting.attackBonus)}
                </RollChip>
              )}
            </p>
          )}
          {[...spellsByLevel.entries()]
            .sort(([a], [b]) => a - b)
            .map(([level, spells]) => {
              const total = slotLevels.get(level) ?? 0
              const used = Math.min(total, sheet.spellSlots[level]?.used ?? 0)
              return (
                <div key={level} className="v-spell-level">
                  <h3>
                    {SPELL_LEVEL_NAME[level] ?? `Level ${level}`}
                    {level > 0 && total > 0 && (
                      <span className="v-slots" aria-label={`${total - used} of ${total} slots left`}>
                        {Array.from({ length: total }, (_, i) => (
                          <span key={i} className={i < total - used ? 'v-slot v-slot--full' : 'v-slot'} />
                        ))}
                      </span>
                    )}
                  </h3>
                  {spells.map((s) => (
                    <SpellEntry key={s.id} spell={s} numbersByLevel={derived.spellNumbers?.[s.id]} roller={roller} />
                  ))}
                </div>
              )
            })}
        </Section>
      )}

      {derived.resources.length > 0 && (
        <Section title="Resources">
          {derived.resources.map((r) => (
            <Entry
              key={r.name}
              title={r.name}
              meta={`${Math.max(0, r.max - r.used)}/${r.max} · ${RECHARGE_LABEL[r.recharge] ?? r.recharge}`}
              description={r.description}
            />
          ))}
        </Section>
      )}

      {(derived.features.length > 0 || extraFeatures.length > 0) && (
        <Section title="Features & traits">
          {derived.features.map((f, i) => (
            <Entry key={`${f.name}-${i}`} title={f.name} meta={featureSource(f.source)} description={f.description} />
          ))}
          {extraFeatures.map((f) => (
            <Entry key={f.id} title={f.name} meta={featureSource(f.source)} description={f.description} />
          ))}
        </Section>
      )}

      {(sheet.equipment.length > 0 || currency.length > 0) && (
        <Section title="Equipment">
          {currency.length > 0 && <p className="v-currency">{currency.map((c) => `${sheet.currency[c]} ${c}`).join(' · ')}</p>}
          {sheet.equipment.map((item) => (
            <Entry
              key={item.id}
              title={
                <>
                  {item.name}
                  {item.quantity > 1 && <span className="v-muted"> ×{item.quantity}</span>}
                </>
              }
              meta={[item.equipped && 'Equipped', item.attuned && 'Attuned'].filter(Boolean).join(' · ') || undefined}
              description={item.notes}
            />
          ))}
        </Section>
      )}

      <Section title="Proficiencies & defenses">
        {relations
          .filter(([, list]) => list.length > 0)
          .map(([label, list]) => (
            <p key={label}>
              <strong>{label}:</strong> {list.join(', ')}
            </p>
          ))}
        {derived.senses.length > 0 && (
          <p>
            <strong>Senses:</strong> {derived.senses.map((s) => `${s.name} ${s.range} ft`).join(', ')}
          </p>
        )}
        {(['armor', 'weapon', 'tool', 'language'] as const)
          .filter((k) => derived.proficiencies[k].length > 0)
          .map((k) => (
            <p key={k}>
              <strong>{PROFICIENCY_LABEL[k]}:</strong> {derived.proficiencies[k].join(', ')}
            </p>
          ))}
        {sheet.otherProficiencies.trim() && <p className="v-prewrap">{sheet.otherProficiencies}</p>}
        {derived.hitDice.length > 0 && (
          <p>
            <strong>Hit dice:</strong> {derived.hitDice.map((h) => `${h.count}d${h.die}`).join(' + ')}
          </p>
        )}
      </Section>

      {personality.length > 0 && (
        <Section title="Personality & backstory">
          {personality.map(([label, text]) => (
            <div key={label} className="v-prose">
              <h3>{label}</h3>
              <p className="v-prewrap">{text}</p>
            </div>
          ))}
        </Section>
      )}

      {sheet.notes.trim() && (
        <Section title="Notes">
          <p className="v-prewrap">{sheet.notes}</p>
        </Section>
      )}

      <p className="v-muted v-footnote">Synced {new Date(character.updatedAt).toLocaleString()} · read-only</p>
    </div>
  )
}

export function CharacterView({ characterId, setTitle }: { characterId: string; setTitle: (title: string) => void }): JSX.Element {
  const { data, error, reload } = useLoad(`character:${characterId}`, () => getCharacter(characterId))
  useEffect(() => setTitle(data?.name || 'Character'), [data?.name, setTitle])
  if (!data) return <Status error={error} loading onRetry={reload} />
  return <Body character={data} />
}
