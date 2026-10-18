// Pieces of the character sheet's always-visible parts, moved here from the
// old Overview tab: the subclass picker, damage resistances, the species
// choice prompt, the advantage badge, death saves and portrait reading.
import { useMemo, useState, type CSSProperties } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { DAMAGE_TYPES, type CharacterSheetData } from '@shared/dnd5e'
import type { DerivedCharacter } from '@shared/content/engine'
import { deriveSheet } from '@shared/content/sheet'
import { XIcon } from '../../../ui/icons'
import { Button } from '../../../ui/Button'
import { useActivePackRegistry, usePickerContent } from '../../content/pickerContent'
import { ChoiceList, useChoiceEditor } from '../ChoiceCards'

const PORTRAIT_MAX_DIMENSION = 256

/** Downscales/re-encodes an uploaded image client-side before it's stored inline in the sheet, so a large photo doesn't bloat every sheet read/write/sync. */
export function readPortraitFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not read image.'))
      img.onload = () => {
        const scale = Math.min(1, PORTRAIT_MAX_DIMENSION / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas unavailable.'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

const RESISTANCE_ROWS: { key: 'damageResistances' | 'damageVulnerabilities' | 'damageImmunities'; label: string }[] = [
  { key: 'damageResistances', label: 'Resistances' },
  { key: 'damageVulnerabilities', label: 'Vulnerabilities' },
  { key: 'damageImmunities', label: 'Immunities' }
]

const DERIVED_RELATION: Record<(typeof RESISTANCE_ROWS)[number]['key'], keyof DerivedCharacter['damageRelations']> = {
  damageResistances: 'resistances',
  damageVulnerabilities: 'vulnerabilities',
  damageImmunities: 'immunities'
}

/** Freeform damage-type tags per row, written straight through onSave (a discrete add/remove click, not something that needs debouncing) — plus a non-removable tag for whatever the content engine grants on top right now (Rage's B/P/S resistance, a species trait, an item, a homebrew feature). Those are shown separately from the stored list since they come from the build, not a permanent trait to save. */
export function ResistancesSection({
  character,
  derived,
  onSave,
  readOnly
}: {
  character: CharacterSheet
  derived: DerivedCharacter
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
}): JSX.Element {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // The SRD's damage types plus any the active packs add (vocabulary.damageTypes).
  const { registry } = useActivePackRegistry()
  const damageTypes = useMemo(() => {
    const names = [...DAMAGE_TYPES, ...registry.vocabulary.damageTypes.map((d) => registry.terminology[`damage.${d.id}`] ?? d.name)]
    return names.filter((n, i) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i)
  }, [registry])
  const grantedFor = (key: (typeof RESISTANCE_ROWS)[number]['key']): string[] =>
    derived.damageRelations[DERIVED_RELATION[key]].filter((t) => !character[key].some((s) => s.toLowerCase() === t.toLowerCase()))

  function addTagValue(key: (typeof RESISTANCE_ROWS)[number]['key'], rawValue: string): void {
    const value = rawValue.trim()
    if (!value || readOnly) return
    const current = character[key]
    if (current.some((t) => t.toLowerCase() === value.toLowerCase())) return
    onSave({ [key]: [...current, value] })
    setDrafts((prev) => ({ ...prev, [key]: '' }))
  }

  function addTag(key: (typeof RESISTANCE_ROWS)[number]['key']): void {
    addTagValue(key, drafts[key] ?? '')
  }

  function removeTag(key: (typeof RESISTANCE_ROWS)[number]['key'], value: string): void {
    onSave({ [key]: character[key].filter((t) => t !== value) })
  }

  return (
    <div className="gb-card" style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', flexDirection: 'column', maxWidth: 340 }}>
      {RESISTANCE_ROWS.map(({ key, label }) => (
        <div
          key={key}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            padding: '5px 0'
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          {character[key].map((tag) => (
            <span key={tag} className="gb-badge" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 8px' }}>
              {tag}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeTag(key, tag)}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, display: 'inline-flex' }}
                  title={`Remove ${tag}`}
                >
                  <XIcon size={10} />
                </button>
              )}
            </span>
          ))}
          {grantedFor(key).map((tag) => (
              <span
                key={`granted:${tag}`}
                className="gb-badge gb-badge--accent"
                style={{ fontSize: 12, padding: '3px 8px' }}
                title="Granted by a feature, item or active buff (e.g. Rage) — not stored on the sheet."
              >
                {tag}
              </span>
            ))}
          {!readOnly && (
            <input
              className="gb-input"
              list={`damage-types-${key}`}
              placeholder="Add…"
              value={drafts[key] ?? ''}
              onChange={(e) => {
                const value = e.target.value
                // A datalist pick fires this same 'input'/onChange event as typing does — no separate "option
                // selected" event exists — so an exact match against the known list is what tells the two apart
                // from an in-progress keystroke, letting a dropdown pick add immediately without needing Enter.
                if (damageTypes.some((t) => t.toLowerCase() === value.toLowerCase())) addTagValue(key, value)
                else setDrafts((prev) => ({ ...prev, [key]: value }))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag(key)
                }
              }}
              style={{ width: 80, marginLeft: 'auto', fontSize: 12, padding: '3px 6px' }}
            />
          )}
          <datalist id={`damage-types-${key}`}>
            {damageTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      ))}
    </div>
  )
}

/** SRD-backed subclass picker — a dropdown of the real SRD subclass(es) for a recognized class (just one per class, per the SRD's own scope; see shared/compendium.ts), falling back to a freeform text input for an unrecognized/homebrew class name. A legacy or homebrew value that doesn't match any SRD option is kept as an extra "(custom)" option instead of being silently dropped. */
export function SubclassField({
  className,
  level,
  value,
  onChange,
  style
}: {
  className: string
  /** This class's current level — gates the dropdown until the class's real subclass-choice level, since normal D&D doesn't let you pick one early. Ignored for homebrew classes (no SRD data to gate against anyway). */
  level: number
  value: string
  onChange: (value: string) => void
  style?: CSSProperties
}): JSX.Element {
  const picker = usePickerContent()
  const cls = picker.classes.find((c) => c.name.toLowerCase() === className.trim().toLowerCase())
  const options = cls ? picker.subclassesFor(cls.name) : []
  if (options.length === 0) {
    return <input className="gb-input" style={style} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Subclass" />
  }
  // Not yet chosen and not yet eligible — normal 5e picks a subclass via
  // the inline chooser that auto-appears in Combat's Features tab once the
  // class reaches subclassLevel (see FeaturesTab.tsx's SubclassChooser),
  // not freely here. Once it's been set (or the eligible level is reached,
  // e.g. an existing character that predates this gate), the field opens
  // back up so a mistaken pick is still correctable.
  if (!value && cls && level < cls.subclassLevel) {
    return (
      <div
        style={{ ...style, padding: '5px 8px', fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}
        title={`Chosen via Level Up at ${cls.name} level ${cls.subclassLevel}`}
      >
        Chosen at level {cls.subclassLevel}
      </div>
    )
  }
  const isKnownOrEmpty = value === '' || options.some((o) => o.name === value)
  return (
    <select className="gb-input" style={style} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select subclass…</option>
      {!isKnownOrEmpty && <option value={value}>{value} (custom)</option>}
      {options.map((o) => (
        <option key={o.id} value={o.name}>
          {o.name}
        </option>
      ))}
    </select>
  )
}

/**
 * Shown right after picking a species with its own trait-level choices via
 * the Race dropdown above (Human's Skillful/Versatile, Elf/Gnome/Tiefling's
 * lineage, or any homebrew species' choices) — the species' choices from
 * the content engine as generic ChoiceCards, saved the same way as on the
 * Features tab (which keeps showing them afterwards). Waits for the race
 * change itself to save first, since the choices come from the saved sheet.
 */
export function RaceExtrasPrompt({
  raceName,
  character,
  onSave,
  onDone
}: {
  raceName: string
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  onDone: () => void
}): JSX.Element {
  const setPicks = useChoiceEditor(character, onSave)
  const saved = character.race.trim().toLowerCase() === raceName.trim().toLowerCase()
  const { derived } = deriveSheet(character)
  const speciesChoices = derived.choices.filter((c) => c.sourceKey.startsWith('species:'))

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {saved ? `${raceName} has choices to make — pick them below (they stay on the Features tab too).` : 'Saving…'}
      </div>
      {saved && <ChoiceList choices={speciesChoices} all={derived.choices} onSetPicks={setPicks} />}
      <div>
        <Button variant="primary" onClick={onDone} style={{ fontSize: 12, padding: '4px 10px' }}>
          Done
        </Button>
      </div>
    </div>
  )
}

/** A small green "A" / red "D" badge — advantage or disadvantage currently in effect on a skill, ability check, saving throw, attack roll, or Initiative (from a feat's *Advantage/*Disadvantage effect, or equipped armor's Stealth disadvantage; see effective*Advantage in shared/compendium.ts). Purely informational, same read-only hover-for-detail spirit as the rest of the sheet. */
export function AdvantageTag({ kind, label }: { kind: 'advantage' | 'disadvantage'; label: string }): JSX.Element {
  return (
    <span
      title={kind === 'advantage' ? `Advantage on ${label}` : `Disadvantage on ${label}`}
      style={{
        display: 'inline-block',
        marginLeft: 3,
        width: 12,
        height: 12,
        lineHeight: '12px',
        textAlign: 'center',
        fontSize: 9,
        fontWeight: 700,
        borderRadius: '50%',
        color: '#fff',
        background: kind === 'advantage' ? 'var(--success)' : 'var(--danger)'
      }}
    >
      {kind === 'advantage' ? 'A' : 'D'}
    </span>
  )
}

export function DeathSaveRow({ label, count, onChange }: { label: string; count: number; onChange: (n: number) => void }): JSX.Element {
  return (
    <div>
      <div className="gb-label" style={{ fontSize: 10 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(count === i ? i - 1 : i)}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '1px solid var(--border-strong)',
              background: i <= count ? 'var(--accent)' : 'transparent',
              cursor: 'pointer'
            }}
          />
        ))}
      </div>
    </div>
  )
}

