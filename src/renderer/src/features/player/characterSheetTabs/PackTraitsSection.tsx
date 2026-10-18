import type { ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { formatModifier, type CharacterSheetData } from '@shared/dnd5e'
import type { DerivedCharacter } from '@shared/content/engine'
import { HoverDetailCard } from '../HoverDetailCard'
import { Button } from '../../../ui/Button'
import { MinusIcon, PlusIcon, XIcon } from '../../../ui/icons'
import { useActivePackRegistry } from '../../content/pickerContent'
import { useTerms } from '../../content/terms'

const ABILITY_LABEL: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }

/**
 * Everything the enabled packs add to a character that has no fixed place
 * on the 5e sheet, each in its own headed card on a row of its own under
 * the Overview header: ability aliases ("Channelling ability" — pick one
 * of its abilities), counters the player keeps (Renown), custom
 * stats and senses, conditions, and combat numbers that only show when
 * something changes them (crit range, extra reactions, attacks per action,
 * damage reduction), plus reminders: rules text from feats and features the
 * sheet can't calculate (Alert, Savage Attacker), named with the text on
 * hover. Descriptions show on hover too, so every card stays compact.
 */
export function PackTraitsSection({
  character,
  derived,
  onSave,
  readOnly,
  part = 'all'
}: {
  character: CharacterSheet
  derived: DerivedCharacter
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
  /** Just the reminders card, everything but it, or both — so the sheet can put reminders somewhere of their own. */
  part?: 'all' | 'reminders' | 'rest'
}): JSX.Element | null {
  const { registry } = useActivePackRegistry()
  const terms = useTerms()
  // Conditions the packs define (exhaustion keeps its own control in the header).
  const packConditions = registry.vocabulary.conditions.filter((c) => c.id !== 'exhaustion')
  const active = character.activeConditions ?? []
  const stats = Object.entries(derived.stats).filter(([, s]) => s.display)
  const senses = Object.values(derived.senses)
  const combat = [
    derived.critThreshold !== 20 ? { label: 'Critical hit', value: `${derived.critThreshold}–20` } : null,
    derived.attacksPerAction !== 1 ? { label: 'Attacks per action', value: String(derived.attacksPerAction) } : null,
    derived.reactions !== 1 ? { label: 'Reactions', value: String(derived.reactions) } : null
  ].filter((x): x is { label: string; value: string } => !!x)
  const numbers = [
    ...stats.map(([id, s]) => ({ key: `stat:${id}`, label: s.name, value: String(s.value) })),
    ...senses.map((s) => ({ key: `sense:${s.name}`, label: s.name, value: `${s.range} ft` })),
    ...combat.map((c) => ({ key: c.label, label: c.label, value: c.value }))
  ]

  // Rules text the sheet can't calculate (a feat's "once per turn, reroll…") — listed by name, the text on hover.
  const notes = derived.notes

  const rest = part !== 'reminders'
  const reminders = part !== 'rest' && notes.length > 0
  if (!reminders && !(rest && (derived.abilityAliases.length || derived.counters.length || numbers.length || derived.damageReductions.length || packConditions.length))) return null

  function setConditions(next: { id: string; level?: number }[]): void {
    if (!readOnly) onSave({ activeConditions: next })
  }

  function setCounter(id: string, value: number, min: number, max?: number): void {
    if (readOnly) return
    const clamped = Math.max(min, max !== undefined ? Math.min(max, value) : value)
    onSave({ counters: { ...character.counters, [id]: clamped } })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-3)', alignItems: 'start' }}>
      {rest && derived.abilityAliases.map((a) => (
        <Card key={a.id} title={a.name} description={a.description} hint={a.chosen ? undefined : 'Not picked yet'}>
          <div role="radiogroup" aria-label={a.name} style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(a.options.length, 3)}, 1fr)`, gap: 6 }}>
            {a.options.map((o) => {
              const on = a.ability === o
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={readOnly}
                  onClick={() => onSave({ abilityAliases: { ...character.abilityAliases, [a.id]: o } })}
                  className="gb-card"
                  style={{
                    padding: '6px 8px',
                    cursor: readOnly ? 'default' : 'pointer',
                    textAlign: 'center',
                    borderColor: on ? 'var(--accent)' : undefined,
                    background: on ? 'var(--accent-subtle)' : undefined,
                    minWidth: 0
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: on ? 700 : 400, color: on ? 'var(--accent-hover)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {terms.ability(o, ABILITY_LABEL[o] ?? o)}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: on ? 'var(--accent)' : 'var(--text-muted)' }}>{formatModifier(derived.abilities[o].mod)}</div>
                </button>
              )
            })}
          </div>
        </Card>
      ))}

      {rest && derived.counters.map((c) => (
        <Card key={c.id} title={c.name} description={c.description}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)' }}>
            <Button variant="secondary" style={stepStyle} disabled={readOnly || c.value <= c.min} onClick={() => setCounter(c.id, c.value - 1, c.min, c.max)} title={`Lower ${c.name}`}>
              <MinusIcon size={12} />
            </Button>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', minWidth: 48, textAlign: 'center' }}>
              {c.value}
              {c.max !== undefined && <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}> / {c.max}</span>}
            </span>
            <Button
              variant="secondary"
              style={stepStyle}
              disabled={readOnly || (c.max !== undefined && c.value >= c.max)}
              onClick={() => setCounter(c.id, c.value + 1, c.min, c.max)}
              title={`Raise ${c.name}`}
            >
              <PlusIcon size={12} />
            </Button>
          </div>
        </Card>
      ))}

      {rest && numbers.length > 0 && (
        <Card title="Stats & Senses">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}>
            {numbers.map((n) => (
              <div key={n.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', lineHeight: 1.2 }}>{n.label}</span>
                <strong style={{ fontSize: 16, color: 'var(--accent)' }}>{n.value}</strong>
              </div>
            ))}
          </div>
        </Card>
      )}

      {rest && packConditions.length > 0 && (
        <Card title="Conditions">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 12 }}>
            {active.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>None</span>}
            {active.map((c) => {
              const def = packConditions.find((d) => d.id === c.id)
              if (!def) return null
              const level = c.level ?? 1
              return (
                <HoverDetailCard key={c.id} title={def.name} subtitle={def.maxLevel ? `Level ${level} of ${def.maxLevel}` : 'Condition'} fields={[]} description={def.description}>
                  <span className="gb-badge gb-badge--accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                    {registry.terminology[`condition.${def.id}`] ?? def.name}
                    {def.maxLevel !== undefined && (
                      <>
                        <button type="button" style={chipButton} disabled={readOnly || level <= 1} onClick={() => setConditions(active.map((x) => (x.id === c.id ? { ...x, level: level - 1 } : x)))} title="Lower">
                          <MinusIcon size={9} />
                        </button>
                        {level}
                        <button type="button" style={chipButton} disabled={readOnly || level >= def.maxLevel} onClick={() => setConditions(active.map((x) => (x.id === c.id ? { ...x, level: level + 1 } : x)))} title="Raise">
                          <PlusIcon size={9} />
                        </button>
                      </>
                    )}
                    {!readOnly && (
                      <button type="button" style={chipButton} onClick={() => setConditions(active.filter((x) => x.id !== c.id))} title={`Remove ${def.name}`}>
                        <XIcon size={9} />
                      </button>
                    )}
                  </span>
                </HoverDetailCard>
              )
            })}
          </div>
          {!readOnly && packConditions.some((d) => !active.some((a) => a.id === d.id)) && (
            <select className="gb-input" value="" onChange={(e) => e.target.value && setConditions([...active, { id: e.target.value }])} style={{ fontSize: 12, padding: '4px 6px', width: '100%' }}>
              <option value="">Add a condition…</option>
              {packConditions
                .filter((d) => !active.some((a) => a.id === d.id))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {registry.terminology[`condition.${d.id}`] ?? d.name}
                  </option>
                ))}
            </select>
          )}
        </Card>
      )}

      {reminders && (
        <Card title="Reminders" hint="Hover for the rule">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {notes.map((n, i) => (
              <HoverDetailCard key={i} title={n.source} subtitle="Reminder" fields={[]} description={n.text}>
                <span className="gb-badge" style={{ fontSize: 11, cursor: 'default' }}>
                  {n.source}
                </span>
              </HoverDetailCard>
            ))}
          </div>
        </Card>
      )}

      {rest && derived.damageReductions.length > 0 && (
        <Card title="Damage Reduction">
          {derived.damageReductions.map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--accent)' }}>−{r.amount}</strong> {r.damageTypes ? r.damageTypes.join(', ') : 'all'} damage
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.label ?? r.source}</div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

/** One headed card: a title and its control; the description (if any) shows on hover over the card. */
function Card({ title, description, hint, children }: { title: string; description?: string; hint?: string; children: ReactNode }): JSX.Element {
  const body = (
    <div className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div className="gb-label" style={{ margin: 0, flex: 1 }}>
          {title}
        </div>
        {hint && <span style={{ fontSize: 10, color: 'var(--accent)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
  return description ? (
    <HoverDetailCard title={title} fields={[]} description={description}>
      {body}
    </HoverDetailCard>
  ) : (
    body
  )
}

const chipButton = { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex' } as const
const stepStyle = { padding: '6px 10px', display: 'inline-flex', alignItems: 'center' } as const
