import { useEffect, useMemo, useRef, useState } from 'react'
import { deriveCharacter } from '@shared/content/engine'
import type { Registry } from '@shared/content/registry'
import { formatModifier } from '@shared/dnd5e'
import { buildFromSetup, defaultTestSetup, type TestSetup } from './TestCharacterPanel'

/** How long a changed number stays highlighted. */
const FLASH_MS = 2500

/**
 * The test character, small enough to sit beside the entry editor: pick
 * the class and level, see the key numbers, resources and actions — and
 * whatever an edit just changed is highlighted for a moment, so the effect
 * of each change is visible without switching tabs. The full panel is the
 * Test character tab.
 */
export function TestSummary({
  registry,
  packId,
  setup,
  onSetup,
  hasErrors
}: {
  registry: Registry | null
  packId: string
  setup: TestSetup | null
  onSetup: (setup: TestSetup) => void
  hasErrors: boolean
}): JSX.Element {
  const s = useMemo(() => (registry ? (setup ?? defaultTestSetup(registry, packId)) : null), [registry, setup, packId])
  const derived = useMemo(() => (registry && s ? deriveCharacter(buildFromSetup(s, registry), registry) : null), [registry, s])

  const rows: Array<{ key: string; label: string; value: string }> = derived
    ? [
        { key: 'ac', label: 'AC', value: String(derived.armorClass) },
        { key: 'hp', label: 'HP', value: String(derived.maxHp) },
        { key: 'prof', label: 'Proficiency', value: formatModifier(derived.proficiencyBonus) },
        { key: 'init', label: 'Initiative', value: formatModifier(derived.initiative) },
        ...Object.entries(derived.speeds).map(([k, v]) => ({ key: `speed.${k}`, label: k === 'walk' ? 'Speed' : `${k} speed`, value: `${v} ft` })),
        ...(derived.spellcasting.dc !== null ? [{ key: 'dc', label: 'Spell DC', value: String(derived.spellcasting.dc) }] : []),
        ...Object.entries(derived.stats).map(([id, st]) => ({ key: `stat.${id}`, label: st.name, value: String(st.value) })),
        ...derived.counters.map((c) => ({ key: `counter.${c.id}`, label: c.name, value: String(c.value) })),
        ...derived.resources.map((r) => ({ key: `res.${r.id}`, label: r.name, value: `${r.max}${r.shortRestRegain ? ` (+${r.shortRestRegain} short rest)` : ''}` })),
        ...(derived.critThreshold !== 20 ? [{ key: 'crit', label: 'Crit on', value: `${derived.critThreshold}+` }] : []),
        ...derived.damageReductions.map((r, i) => ({ key: `dr.${i}`, label: 'Damage reduction', value: `−${r.amount}` }))
      ]
    : []
  const actions = derived ? [...derived.actions.map((a) => a.name), ...derived.attacks.filter((a) => a.kind === 'granted').map((a) => a.name)] : []
  const problems = derived ? derived.diagnostics.filter((d) => d.source !== 'srd-5.2.1') : []

  // What changed since the last derive, highlighted for a moment.
  const previous = useRef<Map<string, string> | null>(null)
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const signature = rows.map((r) => `${r.key}=${r.value}`).join('|') + `|actions=${actions.join(',')}`
  useEffect(() => {
    const now = new Map(rows.map((r) => [r.key, r.value]))
    now.set('actions', actions.join(','))
    const before = previous.current
    previous.current = now
    if (!before) return
    const diff = new Set([...now].filter(([k, v]) => before.get(k) !== v).map(([k]) => k))
    if (diff.size === 0) return
    setChanged(diff)
    const t = setTimeout(() => setChanged(new Set()), FLASH_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  if (!registry || !s || !derived) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Fix the pack's errors and the test character appears here.</p>
  }
  const classes = registry.all('classes')
  const ownFirst = [...classes.filter((c) => c.packId === packId), ...classes.filter((c) => c.packId !== packId)]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <select className="gb-input" value={s.classId} onChange={(e) => onSetup({ ...s, classId: e.target.value, subclassId: '', choices: {} })} style={{ fontSize: 11, padding: '2px 4px', flex: 1, minWidth: 0 }}>
          {ownFirst.map((c) => (
            <option key={c.fullId} value={c.fullId}>
              {c.def.name}
            </option>
          ))}
        </select>
        <input
          className="gb-input"
          type="number"
          min={1}
          max={20}
          value={s.level}
          onChange={(e) => onSetup({ ...s, level: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
          style={{ width: 46, fontSize: 11, padding: '2px 4px' }}
          title="Level"
        />
      </div>
      {hasErrors && <div style={{ fontSize: 11, color: 'var(--danger)' }}>Using the last version without errors.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((r) => (
          <div
            key={r.key}
            style={{
              display: 'flex',
              gap: 6,
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              background: changed.has(r.key) ? 'var(--accent-subtle)' : 'transparent',
              transition: 'background 300ms'
            }}
          >
            <span style={{ flex: 1, color: 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            <strong style={{ color: changed.has(r.key) ? 'var(--accent-hover)' : 'var(--text-primary)' }}>{r.value}</strong>
          </div>
        ))}
      </div>
      {actions.length > 0 && (
        <div style={{ padding: '2px 6px', borderRadius: 'var(--radius-sm)', background: changed.has('actions') ? 'var(--accent-subtle)' : 'transparent' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Actions</div>
          <div>{actions.join(', ')}</div>
        </div>
      )}
      <div style={{ fontSize: 11, color: problems.length ? 'var(--danger)' : 'var(--text-muted)' }}>
        {problems.length ? `${problems.length} problem${problems.length === 1 ? '' : 's'} — see the Test character tab` : `${derived.features.length} features at level ${s.level}`}
      </div>
    </div>
  )
}
