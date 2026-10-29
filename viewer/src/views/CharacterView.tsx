import { useEffect, useState, type ReactNode } from 'react'
import { ABILITIES, formatModifier } from '@shared/dnd5e'
import '@renderer/features/player/sheet/sheet.css'
import type { CloudCharacter } from '@shared/cloudCharacter'
import type { KnownSpell } from '@shared/content/sheet'
import { getCharacter } from '../api'
import { useLoad } from '../data'
import { Status } from './Status'
import { AdvantageTag, RollChip, damageRoll, rollCheck, rollDamage } from '../roll'

const PROFICIENCY_LABEL = { armor: 'Armor', weapon: 'Weapons', tool: 'Tools', language: 'Languages' } as const
const RECHARGE_LABEL: Record<string, string> = { long: 'long rest', short: 'short rest' }

/** A feature's source is a content pack id for anything curated ("srd-5.2.1") — only worth showing when it's something a person wrote, like a DM boon. */
function featureSource(source: string): string | undefined {
  return /^[a-z0-9.-]+$/.test(source) ? undefined : source
}
const SPELL_LEVEL_NAME = ['Cantrips', '1st level', '2nd level', '3rd level', '4th level', '5th level', '6th level', '7th level', '8th level', '9th level']

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

type Tab = 'Actions' | 'Spells' | 'Features' | 'Inventory' | 'Story'

// XP needed for each level (index = level - 1), for the identity card's bar.
const XP_FOR_LEVEL = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]

/**
 * The sheet laid out as the desktop's: a rail (who they are, hit points,
 * vitals, resources), ability tiles and tabs in the middle, skills and senses
 * on the right — the same classes as the desktop sheet (sheet.css), so it
 * reflows the same way, down to one column on a phone. Read-only; the dice
 * still roll.
 */
function Body({ character }: { character: CloudCharacter }): JSX.Element {
  const { sheet, derived } = character
  const [tab, setTab] = useState<Tab>('Actions')
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

  const initials =
    (character.name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  const xpNext = XP_FOR_LEVEL[Math.min(derived.level, 19)]
  const xpPrev = XP_FOR_LEVEL[Math.max(0, Math.min(derived.level - 1, 19))]
  const xpProgress = derived.level >= 20 ? 1 : Math.max(0, Math.min(1, (sheet.experiencePoints - xpPrev) / Math.max(1, xpNext - xpPrev)))
  const hpTotal = Math.max(derived.maxHp, sheet.currentHp) + (sheet.tempHp ?? 0)
  const hitDiceText = derived.hitDice.map((h) => `${h.count}d${h.die}`).join(' + ')
  const caster = knownSpells.length > 0 || derived.spellcasting.dc !== null
  const tabs: Tab[] = ['Actions', ...(caster ? (['Spells'] as const) : []), 'Features', 'Inventory', 'Story']
  const shown = tabs.includes(tab) ? tab : 'Actions'
  const panel = (t: Tab): { display: string } => ({ display: shown === t ? 'block' : 'none' })

  return (
    <div className="gs-root v-sheet">
      <div className="gs">
        <aside className="gs-rail">
          {/* Who they are — as the desktop sheet's identity card. */}
          <div className="gs-card gs-span">
            <div className="gs-row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div className="v-portrait-box">{sheet.portraitDataUrl ? <img src={sheet.portraitDataUrl} alt="" /> : initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="v-sheet-name">{character.name || 'Unnamed character'}</div>
                <div className="gs-hint" style={{ marginTop: 2 }}>
                  {character.subtitle || 'No species or class yet'}
                </div>
                {(sheet.background || sheet.alignment) && <div className="gs-hint">{[sheet.background, sheet.alignment].filter(Boolean).join(' · ')}</div>}
              </div>
              {sheet.inspiration && (
                <span className="gb-badge gb-badge--accent" title="Inspiration">
                  Inspired
                </span>
              )}
            </div>
            <div className="gs-row" style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>Level {derived.level}</span>
              <div className="v-xpbar">
                <div style={{ width: `${xpProgress * 100}%` }} />
              </div>
              <span>{derived.level >= 20 ? `${sheet.experiencePoints.toLocaleString()} XP` : `${sheet.experiencePoints.toLocaleString()} / ${xpNext.toLocaleString()} XP`}</span>
            </div>
          </div>

          {/* Hit points, as the desktop card shows them (without the buttons — this is read-only). */}
          <div className="gs-card gs-span">
            <div className="gs-between">
              <span className="gs-label">Hit points</span>
              {hitDiceText && <span className="gs-chip">Hit dice {hitDiceText}</span>}
            </div>
            <div className="gs-row" style={{ alignItems: 'baseline', marginTop: 6 }}>
              <span className="gs-hp-now">{sheet.currentHp}</span>
              <span className="v-muted">/ {derived.maxHp}</span>
              {sheet.tempHp > 0 && <span className="gs-chip gs-chip--blue">+ {sheet.tempHp} temp</span>}
            </div>
            <div className="gs-hpbar" aria-hidden="true">
              <div className="gs-hp" style={{ width: `${(Math.max(0, sheet.currentHp) / hpTotal) * 100}%` }} />
              <div className="gs-tmp" style={{ width: `${((sheet.tempHp ?? 0) / hpTotal) * 100}%` }} />
            </div>
            {sheet.currentHp <= 0 && (
              <div className="gs-hint" style={{ marginTop: 8, color: 'var(--danger)' }}>
                Down — death saves {sheet.deathSaves.successes} ✓ · {sheet.deathSaves.failures} ✗
              </div>
            )}
            {sheet.exhaustionLevel > 0 && (
              <div className="gs-hint" style={{ marginTop: 6, color: 'var(--danger)' }}>
                Exhaustion {sheet.exhaustionLevel}
              </div>
            )}
          </div>

          <div className="gs-vitals gs-span">
            <div className="gs-vital" title="Armor class">
              <b>{derived.armorClass}</b>
              <span>AC</span>
            </div>
            <button type="button" className="gs-vital" onClick={() => rollCheck(roller, 'Initiative', derived.initiative, { advantage: derived.initiativeMode ?? 'normal' })} title="Roll initiative">
              <b>
                {formatModifier(derived.initiative)}
                <AdvantageTag kind={derived.initiativeMode} label="Initiative" />
              </b>
              <span>Init</span>
            </button>
            <div className="gs-vital" title={otherSpeeds.length ? otherSpeeds.map(([k, v]) => `${k} ${v} ft`).join(', ') : 'Speed'}>
              <b>{walk ?? 30}</b>
              <span>{otherSpeeds.length ? 'Speed +' : 'Speed'}</span>
            </div>
            <div className="gs-vital" title="Proficiency bonus">
              <b>{formatModifier(derived.proficiencyBonus)}</b>
              <span>Prof</span>
            </div>
          </div>

          {derived.resources.length > 0 && (
            <div className="gs-card gs-span">
              <span className="gs-label">Resources</span>
              <div className="v-cardlist">
                {derived.resources.map((r) => (
                  <Entry key={r.name} title={r.name} meta={`${Math.max(0, r.max - r.used)}/${r.max} · ${RECHARGE_LABEL[r.recharge] ?? r.recharge}`} description={r.description} />
                ))}
              </div>
            </div>
          )}
        </aside>

        <main className="gs-main">
          <div className="gs-abilities">
            {ABILITIES.map((a) => {
              const score = derived.abilities[a.id]
              const save = derived.saves[a.id]
              const checkMode = derived.checkModes?.[a.id]
              return (
                <div key={a.id} className="gs-ability">
                  <button type="button" className="gs-ability-check" onClick={() => rollCheck(roller, `${a.label} Check`, score?.mod ?? 0, { advantage: checkMode ?? 'normal' })} title={`Roll a ${a.label} check`}>
                    <div className="gs-label">
                      {a.id.toUpperCase()}
                      <AdvantageTag kind={checkMode} label={`${a.label} checks`} />
                    </div>
                    <div className="gs-ability-mod">{formatModifier(score?.mod ?? 0)}</div>
                    <div className="gs-hint">{score?.score ?? '—'}</div>
                  </button>
                  {save && (
                    <div className={`gs-ability-save${save.proficiency ? ' gs-ability-save--prof' : ''}`}>
                      <span className={`gs-dot${save.proficiency ? ' gs-dot--proficient' : ''}`} aria-label={save.proficiency ? 'Proficient' : undefined} />
                      <button type="button" onClick={() => rollCheck(roller, `${a.label} Saving Throw`, save.bonus, { advantage: save.mode ?? 'normal' })} title={`Roll a ${a.label} saving throw`}>
                        Save {formatModifier(save.bonus)}
                      </button>
                      <AdvantageTag kind={save.mode} label={`${a.label} saves`} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="gs-tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={shown === t} className={`gs-tab${shown === t ? ' gs-tab--on' : ''}`} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>

          <div className="gs-panel">
            <div style={panel('Actions')}>
              <div className="v-tabpanel">
                <span className="gs-label">Attacks</span>
                {derived.attacks.length === 0 && <p className="v-empty">No attacks.</p>}
                <div className="v-attack-grid">
                  {derived.attacks.map((a, i) => {
                    // Same rule as the desktop's rollDerivedDamage: one kind of standard die plus a flat amount.
                    const single = a.damageDice && a.damageDice.dice.length === 1 ? a.damageDice : null
                    const damage = single
                      ? damageRoll(`${single.dice[0].count}d${single.dice[0].sides}${single.flat ? (single.flat > 0 ? ` + ${single.flat}` : ` - ${-single.flat}`) : ''}`)
                      : a.damageDice
                        ? null
                        : damageRoll(a.damage)
                    const damageText = [a.damage, ...a.extraDamage.map((x) => `${x.damage}${x.damageType ? ` ${x.damageType}` : ''}`)].join(' + ')
                    const mode = a.mode ?? derived.attackMode
                    return (
                      <div key={`${a.name}-${i}`} className="gb-card v-attack">
                        <div className="gs-between" style={{ gap: 6 }}>
                          <strong className="v-attack-name">
                            {a.name}
                            <AdvantageTag kind={mode} label={`${a.name} attacks`} />
                          </strong>
                          {a.damageType && <span className="gb-badge">{a.damageType}</span>}
                        </div>
                        <div className="gs-row" style={{ gap: 6, marginTop: 6 }}>
                          <span className="v-attack-label">Atk</span>
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
                          {damage ? <RollChip onRoll={() => rollDamage(roller, [damage.group], damage.flat, `${a.name} Damage`)}>{damageText}</RollChip> : <span className="v-muted">{damageText}</span>}
                          {a.range && <span className="gs-hint">{a.range}</span>}
                        </div>
                        {a.description?.trim() && (
                          <details className="v-attack-more">
                            <summary>Details</summary>
                            <p className="v-entry-text">{a.description}</p>
                          </details>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {caster && (
              <div style={panel('Spells')}>
                <div className="v-tabpanel">
                  {derived.spellcasting.dc !== null && (
                    <div className="gs-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <div className="gs-vital" style={{ flex: '0 0 auto', padding: '6px 14px' }} title="Spell save DC">
                        <b>{derived.spellcasting.dc}</b>
                        <span>Save DC</span>
                      </div>
                      {derived.spellcasting.attackBonus !== null && (
                        <button type="button" className="gs-vital" style={{ flex: '0 0 auto', padding: '6px 14px' }} onClick={() => rollCheck(roller, 'Spell Attack', derived.spellcasting.attackBonus ?? 0)} title="Roll a spell attack">
                          <b>{formatModifier(derived.spellcasting.attackBonus)}</b>
                          <span>Spell attack</span>
                        </button>
                      )}
                    </div>
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
                          <div className="v-cardlist">
                            {spells.map((sp) => (
                              <SpellEntry key={sp.id} spell={sp} numbersByLevel={derived.spellNumbers?.[sp.id]} roller={roller} />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            <div style={panel('Features')}>
              <div className="v-tabpanel">
                {derived.features.length === 0 && extraFeatures.length === 0 && <p className="v-empty">No features yet.</p>}
                <div className="v-cardlist">
                  {derived.features.map((f, i) => (
                    <Entry key={`${f.name}-${i}`} title={f.name} meta={featureSource(f.source)} description={f.description} />
                  ))}
                  {extraFeatures.map((f) => (
                    <Entry key={f.id} title={f.name} meta={featureSource(f.source)} description={f.description} />
                  ))}
                </div>
              </div>
            </div>

            <div style={panel('Inventory')}>
              <div className="v-tabpanel">
                {currency.length > 0 && (
                  <div className="v-coins">
                    {currency.map((c) => (
                      <span key={c} className="gs-vital" style={{ flex: '0 0 auto', padding: '6px 12px' }}>
                        <b>{sheet.currency[c]}</b>
                        <span>{c}</span>
                      </span>
                    ))}
                  </div>
                )}
                {sheet.equipment.length === 0 && <p className="v-empty">Nothing carried.</p>}
                <div className="v-cardlist">
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
                </div>
              </div>
            </div>

            <div style={panel('Story')}>
              <div className="v-tabpanel">
                {personality.length === 0 && !sheet.notes.trim() && <p className="v-empty">No story written yet.</p>}
                {personality.map(([label, text]) => (
                  <div key={label} className="v-prose">
                    <span className="gs-label">{label}</span>
                    <p className="v-prewrap">{text}</p>
                  </div>
                ))}
                {sheet.notes.trim() && (
                  <div className="v-prose">
                    <span className="gs-label">Notes</span>
                    <p className="v-prewrap">{sheet.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        <aside className="gs-side">
          <div className="gs-card">
            <div className="gs-between" style={{ marginBottom: 6 }}>
              <span className="gs-label">Skills</span>
              <span className="gs-hint">Click to roll</span>
            </div>
            {derived.skills
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((sk) => (
                <div key={sk.name} className="gs-skill">
                  <span className={`gs-dot${sk.proficiency === 'proficient' ? ' gs-dot--proficient' : sk.proficiency === 'expertise' ? ' gs-dot--expertise' : ''}`} />
                  <button type="button" className="gs-skill-roll" onClick={() => rollCheck(roller, `${sk.name} Check`, sk.bonus, { advantage: sk.mode ?? 'normal' })} title={`Roll ${sk.name}`}>
                    {formatModifier(sk.bonus)}
                  </button>
                  <span className="gs-skill-name">
                    {sk.name}
                    <AdvantageTag kind={sk.mode} label={`${sk.name} checks`} />
                  </span>
                  <span className="gs-skill-ab">{sk.ability.toUpperCase()}</span>
                </div>
              ))}
          </div>

          <div className="gs-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="gs-label">Senses and defences</span>
            <div className="gs-hint" style={{ color: 'var(--text-secondary)' }}>
              {perception && <>Passive Perception {perception.passive}</>}
              {derived.senses.length > 0 && <> · {derived.senses.map((x) => `${x.name} ${x.range} ft`).join(', ')}</>}
            </div>
            {relations
              .filter(([, list]) => list.length > 0)
              .map(([label, list]) => (
                <div key={label} className="gs-hint" style={{ color: 'var(--text-secondary)' }}>
                  <strong>{label}:</strong> {list.join(', ')}
                </div>
              ))}
            {(['armor', 'weapon', 'tool', 'language'] as const)
              .filter((k) => derived.proficiencies[k].length > 0)
              .map((k) => (
                <div key={k} className="gs-hint" style={{ color: 'var(--text-secondary)' }}>
                  <strong>{PROFICIENCY_LABEL[k]}:</strong> {derived.proficiencies[k].join(', ')}
                </div>
              ))}
            {sheet.otherProficiencies.trim() && <div className="gs-hint v-prewrap">{sheet.otherProficiencies}</div>}
          </div>
          <p className="v-muted v-footnote">Synced {new Date(character.updatedAt).toLocaleString()} · read-only</p>
        </aside>
      </div>
    </div>
  )
}

export function CharacterView({ characterId, setTitle }: { characterId: string; setTitle: (title: string) => void }): JSX.Element {
  const { data, error, reload } = useLoad(`character:${characterId}`, () => getCharacter(characterId))
  useEffect(() => setTitle(data?.name || 'Character'), [data?.name, setTitle])
  if (!data) return <Status error={error} loading onRetry={reload} />
  return <Body character={data} />
}
