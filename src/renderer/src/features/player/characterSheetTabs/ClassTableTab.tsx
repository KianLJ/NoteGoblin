import type { CSSProperties } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { CharacterSheetData, CustomClassFeature } from '@shared/dnd5e'
import { choicePatch } from '@shared/content/legacyMirror'
import { normalizeForActivePacks } from '@shared/content/sheet'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { useDerivedSheet } from '../useDerivedSheet'
import { HoverDetailCard } from '../HoverDetailCard'
import { XIcon } from '../../../ui/icons'

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

function proficiencyBonusAtLevel(level: number): number {
  return 2 + Math.floor((level - 1) / 4)
}

interface ClassTableDraft {
  customClassFeatures: CustomClassFeature[]
}

interface ClassTableTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
}

/** Each of the character's classes as its full 1–20 table (see ClassTable), plus an editable list of custom features for homebrew classes or levels the content doesn't cover — both feed the level-up prompt. */
export function ClassTableTab({ character, onSave, readOnly }: ClassTableTabProps): JSX.Element {
  const [draft, setDraft] = useAutosaveDraft<ClassTableDraft>(
    { customClassFeatures: character.customClassFeatures },
    onSave,
    readOnly
  )

  function patch(fields: Partial<ClassTableDraft>): void {
    setDraft((prev) => ({ ...prev, ...fields }))
  }

  function updateCustom(id: string, fields: Partial<CustomClassFeature>): void {
    patch({ customClassFeatures: draft.customClassFeatures.map((f) => (f.id === id ? { ...f, ...fields } : f)) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {character.classes.map((c, classIndex) => (
        <ClassTable key={`${classIndex}:${c.className}`} character={character} classIndex={classIndex} readOnly={readOnly} onSave={onSave} />
      ))}

      <div>
        <div className="gb-label">Custom Class Features</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>
          For homebrew classes or anything the curated table doesn't cover — these show up in the level-up prompt too.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {draft.customClassFeatures.map((feature) => (
            <div key={feature.id} className="gb-card" style={{ padding: 'var(--space-2)' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <input
                  className="gb-input"
                  style={{ flex: 2 }}
                  placeholder="Class"
                  value={feature.className}
                  onChange={(e) => updateCustom(feature.id, { className: e.target.value })}
                />
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="gb-input"
                  style={{ width: 70 }}
                  placeholder="Lvl"
                  value={feature.level}
                  onChange={(e) => updateCustom(feature.id, { level: Number(e.target.value) })}
                />
                <input
                  className="gb-input"
                  style={{ flex: 2 }}
                  placeholder="Feature name"
                  value={feature.name}
                  onChange={(e) => updateCustom(feature.id, { name: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() =>
                    patch({ customClassFeatures: draft.customClassFeatures.filter((f) => f.id !== feature.id) })
                  }
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
                onChange={(e) => updateCustom(feature.id, { description: e.target.value })}
              />
            </div>
          ))}
          <button
            type="button"
            className="gb-btn gb-btn--secondary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() =>
              patch({
                customClassFeatures: [
                  ...draft.customClassFeatures,
                  { id: crypto.randomUUID(), className: character.classes[0]?.className ?? '', level: 1, name: '', description: '' }
                ]
              })
            }
          >
            + Add Custom Feature
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * One class's full 1–20 table, read from the content registry (the SRD
 * classes live there too, so built-in and homebrew classes look the same):
 * level and proficiency bonus, each level's class, subclass and archetype
 * features (hover one for its text) with whatever was picked there, the
 * class's own columns (Rages, Sneak Attack, a homebrew Mana…) and spell
 * slots. A wide homebrew table scrolls sideways inside itself with Level
 * pinned; the current level is highlighted and later levels dimmed.
 */
function ClassTable({
  character,
  classIndex,
  readOnly,
  onSave
}: {
  character: CharacterSheet
  classIndex: number
  readOnly?: boolean
  onSave: (patch: Partial<CharacterSheetData>) => void
}): JSX.Element {
  const { derived, registry } = useDerivedSheet(character)
  const raw = character.classes[classIndex]
  const c = normalizeForActivePacks(character).classes[classIndex]
  const cls = c?.classId ? registry.get('classes', c.classId) : undefined
  const title = (
    <div className="gs-label" style={{ marginBottom: 8 }}>
      {raw?.className || 'Unnamed class'} · level {raw?.level ?? 1}
      {raw?.subclass ? ` · ${raw.subclass}` : ''}
    </div>
  )
  if (!c || !cls) {
    return (
      <div>
        {title}
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Not a recognized class. Add its progression below as custom features, or import the content pack it comes from (Content Packs, top right).
        </p>
      </div>
    )
  }
  const sub = c.subclassId ? registry.get('subclasses', c.subclassId) : undefined
  const archetypes = derived.archetypes.flatMap((a) => {
    const reg = a.classId === cls.fullId ? registry.get('archetypes', a.id) : undefined
    return reg ? [{ ...a, def: reg.def }] : []
  })
  const columns = [...cls.def.columns, ...(sub?.def.columns ?? []), ...archetypes.flatMap((a) => a.def.columns)].filter((col) =>
    col.values.some((v) => v !== undefined && v !== '' && v !== 0)
  )
  const slotRows = cls.def.spellcasting?.slots?.rows ?? sub?.def.spellcasting?.slots?.rows ?? []
  const slotCount = Math.max(0, ...slotRows.map((r) => r.reduce((last, n, i) => (n > 0 ? i + 1 : last), 0)))
  const choices = derived.choices.filter((ch) => ch.classId === cls.fullId && !ch.parentKey && ch.picks.length > 0)
  const nameOf = (choice: (typeof choices)[number], id: string): string => choice.options.find((o) => o.id === id)?.name ?? id
  const subclassLabel = cls.def.subclassLabel ?? 'Subclass'

  function clearSubclass(): void {
    onSave({ classes: character.classes.map((k, i) => (i === classIndex ? { ...k, subclass: undefined } : k)) })
  }

  return (
    <div>
      {title}
      {cls.def.description && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>{cls.def.description}</p>}
      <div className="gs-ct-wrap">
        <table className="gs-ct">
          <thead>
            {slotCount > 0 && (
              <tr>
                <th className="lvl" />
                <th colSpan={2 + columns.length} />
                <th className="grp" colSpan={slotCount}>
                  Spell slots per level
                </th>
              </tr>
            )}
            <tr>
              <th className="lvl">Level</th>
              <th>Prof</th>
              <th className="feat">Features</th>
              {columns.map((col) => (
                <th key={col.id}>{col.label}</th>
              ))}
              {Array.from({ length: slotCount }, (_, i) => (
                <th key={i}>{ORDINALS[i] ?? `${i + 1}th`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((level) => {
              const subFeatures = sub ? (sub.def.levels.find((l) => l.level === level)?.features ?? []).map((f) => ({ ...f, source: sub.def.name })) : []
              // The class's "Subclass feature" placeholder gives way to the real one once there's a subclass.
              const features = [
                ...(cls.def.levels.find((l) => l.level === level)?.features ?? [])
                  .filter((f) => !(subFeatures.length > 0 && /^subclass feature$/i.test(f.name)))
                  .map((f) => ({ ...f, source: '' })),
                ...subFeatures,
                ...archetypes.flatMap((a) => (a.def.levels.find((l) => l.level === level)?.features ?? []).map((f) => ({ ...f, source: a.name })))
              ]
              const picks = choices.filter((ch) => ch.level === level)
              const slots = slotRows[level - 1] ?? []
              const isSubclassPick = level === cls.def.subclassLevel && !!raw?.subclass
              return (
                <tr key={level} className={level === c.level ? 'now' : level > c.level ? 'future' : undefined}>
                  <td className="lvl">{level}</td>
                  <td>+{proficiencyBonusAtLevel(level)}</td>
                  <td className="feat">
                    {features.length === 0 && !isSubclassPick && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    {features.map((f, idx) => (
                      <span key={`${f.source}:${f.id}`}>
                        <HoverDetailCard title={f.name} subtitle={f.source || `${raw?.className ?? ''} ${level}`} fields={[]} description={f.description} inline>
                          <span className={`gs-ct-feature${f.source ? ' gs-ct-feature--sub' : ''}`}>{f.name}</span>
                        </HoverDetailCard>
                        {idx < features.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                    {isSubclassPick && !readOnly && <ResolvedChoiceRow label={`${subclassLabel}: ${raw!.subclass}`} onChange={clearSubclass} />}
                    {picks.map((choice) =>
                      readOnly ? (
                        <div key={choice.key} style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {choice.label}: {choice.picks.map((id) => nameOf(choice, id)).join(', ')}
                        </div>
                      ) : (
                        <ResolvedChoiceRow
                          key={choice.key}
                          label={`${choice.label}: ${choice.picks.map((id) => nameOf(choice, id)).join(', ')}`}
                          onChange={() => onSave(choicePatch(character, derived, choice, []))}
                        />
                      )
                    )}
                  </td>
                  {columns.map((col) => {
                    const v = col.values[level - 1]
                    return <td key={col.id}>{v === undefined || v === '' || v === 0 ? '—' : v}</td>
                  })}
                  {Array.from({ length: slotCount }, (_, i) => (
                    <td key={i}>{slots[i] ? slots[i] : '—'}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** One resolved level-up decision, with a "Change" button to clear it — clearing just deletes the underlying record, the same as removing it from wherever else it's editable (Overview's ability hover for an ASI, Features' chips for everything else); the inline chooser reappears there afterward so the player can re-pick. */
function ResolvedChoiceRow({ label, onChange }: { label: string; onChange: () => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{label}</span>
      <button
        type="button"
        onClick={onChange}
        title="Clear this choice so you can pick again"
        style={{
          background: 'none',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 10,
          padding: '2px 6px',
          flexShrink: 0
        }}
      >
        Change
      </button>
    </div>
  )
}

const removeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  padding: '0 6px'
}
