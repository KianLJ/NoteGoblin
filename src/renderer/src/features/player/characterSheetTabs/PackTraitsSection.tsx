import type { CharacterSheet } from '@shared/ipc'
import type { CharacterSheetData } from '@shared/dnd5e'
import type { DerivedCharacter } from '@shared/content/engine'
import { HoverDetailCard } from '../HoverDetailCard'
import { Button } from '../../../ui/Button'
import { MinusIcon, PlusIcon, XIcon } from '../../../ui/icons'
import { useActivePackRegistry } from '../../content/pickerContent'
import { useTerms } from '../../content/terms'

const ABILITY_LABEL: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }

/**
 * Everything the enabled packs add to a character that has no fixed place
 * on the 5e sheet: ability aliases ("Cursed Energy ability"), counters the
 * player keeps (Breakthroughs), custom stats, senses, and combat numbers
 * that only show when something changes them (crit range, extra reactions,
 * attacks per action, damage reduction). Renders nothing for a plain SRD
 * character.
 */
export function PackTraitsSection({
  character,
  derived,
  onSave,
  readOnly
}: {
  character: CharacterSheet
  derived: DerivedCharacter
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
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

  if (!derived.abilityAliases.length && !derived.counters.length && !stats.length && !senses.length && !combat.length && !derived.damageReductions.length && !packConditions.length) return null

  function setConditions(next: { id: string; level?: number }[]): void {
    if (!readOnly) onSave({ activeConditions: next })
  }

  function setCounter(id: string, value: number, min: number, max?: number): void {
    if (readOnly) return
    const clamped = Math.max(min, max !== undefined ? Math.min(max, value) : value)
    onSave({ counters: { ...character.counters, [id]: clamped } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {derived.abilityAliases.map((a) => (
        <HoverDetailCard key={a.id} title={a.name} subtitle="Ability" fields={[]} description={a.description}>
          <label style={rowStyle}>
            <span style={{ flex: 1 }}>{a.name}</span>
            <select
              className="gb-input"
              value={a.ability}
              disabled={readOnly}
              onChange={(e) => onSave({ abilityAliases: { ...character.abilityAliases, [a.id]: e.target.value as (typeof a.options)[number] } })}
              style={{ fontSize: 12, padding: '2px 6px', borderColor: a.chosen ? undefined : 'var(--accent)' }}
            >
              {a.options.map((o) => (
                <option key={o} value={o}>
                  {terms.ability(o, ABILITY_LABEL[o] ?? o)}
                </option>
              ))}
            </select>
          </label>
        </HoverDetailCard>
      ))}

      {derived.counters.map((c) => (
        <HoverDetailCard key={c.id} title={c.name} subtitle="Counter" fields={[]} description={c.description}>
          <div style={rowStyle}>
            <span style={{ flex: 1 }}>{c.name}</span>
            <Button variant="secondary" style={stepStyle} disabled={readOnly || c.value <= c.min} onClick={() => setCounter(c.id, c.value - 1, c.min, c.max)} title={`Lower ${c.name}`}>
              <MinusIcon size={10} />
            </Button>
            <strong style={{ minWidth: 28, textAlign: 'center' }}>
              {c.value}
              {c.max !== undefined ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/{c.max}</span> : null}
            </strong>
            <Button
              variant="secondary"
              style={stepStyle}
              disabled={readOnly || (c.max !== undefined && c.value >= c.max)}
              onClick={() => setCounter(c.id, c.value + 1, c.min, c.max)}
              title={`Raise ${c.name}`}
            >
              <PlusIcon size={10} />
            </Button>
          </div>
        </HoverDetailCard>
      ))}

      {(stats.length > 0 || senses.length > 0 || combat.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
          {stats.map(([id, s]) => (
            <Tile key={id} label={s.name} value={String(s.value)} />
          ))}
          {senses.map((s) => (
            <Tile key={s.name} label={s.name} value={`${s.range} ft`} />
          ))}
          {combat.map((c) => (
            <Tile key={c.label} label={c.label} value={c.value} />
          ))}
        </div>
      )}

      {packConditions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Conditions</span>
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
          {!readOnly && packConditions.some((d) => !active.some((a) => a.id === d.id)) && (
            <select className="gb-input" value="" onChange={(e) => e.target.value && setConditions([...active, { id: e.target.value }])} style={{ fontSize: 11, padding: '2px 6px' }}>
              <option value="">Add…</option>
              {packConditions
                .filter((d) => !active.some((a) => a.id === d.id))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {registry.terminology[`condition.${d.id}`] ?? d.name}
                  </option>
                ))}
            </select>
          )}
        </div>
      )}

      {derived.damageReductions.length > 0 && (
        <div style={{ fontSize: 12 }}>
          <div className="gb-label" style={{ fontSize: 11, marginBottom: 2 }}>
            Damage Reduction
          </div>
          {derived.damageReductions.map((r, i) => (
            <div key={i} style={{ color: 'var(--text-secondary)' }}>
              <strong>−{r.amount}</strong> {r.damageTypes ? r.damageTypes.join(', ') : 'all'} damage
              <span style={{ color: 'var(--text-muted)' }}> · {r.label ?? r.source}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="gb-card" style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ fontSize: 15, color: 'var(--accent)' }}>{value}</strong>
    </div>
  )
}

const chipButton = { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex' } as const
const rowStyle = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 } as const
const stepStyle = { fontSize: 12, padding: '0 8px', lineHeight: '20px' } as const
