import { useState, type ReactNode } from 'react'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import type { Spell } from '@shared/dnd5e'

interface CustomSpellFormProps {
  initial?: Spell
  onSave: (spell: Omit<Spell, 'id' | 'compendiumId'>) => void
  onClose: () => void
}

const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/** Full-screen form for a homebrew spell — every field the SRD compendium view shows (casting time, range, components, duration, etc.), not just a name and a description box, so the hover tooltip has real structured fields to show for custom spells too, the same as compendium-linked ones. */
export function CustomSpellForm({ initial, onSave, onClose }: CustomSpellFormProps): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [level, setLevel] = useState(initial?.level ?? 0)
  const [school, setSchool] = useState(initial?.school ?? '')
  const [castingTime, setCastingTime] = useState(initial?.castingTime ?? '1 action')
  const [range, setRange] = useState(initial?.range ?? '')
  const [components, setComponents] = useState(initial?.components ?? 'V, S')
  const [duration, setDuration] = useState(initial?.duration ?? 'Instantaneous')
  const [concentration, setConcentration] = useState(initial?.concentration ?? false)
  const [ritual, setRitual] = useState(initial?.ritual ?? false)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [higherLevel, setHigherLevel] = useState(initial?.higherLevel ?? '')

  function handleSave(): void {
    onSave({
      name: name.trim(),
      level,
      school: school.trim(),
      castingTime: castingTime.trim(),
      range: range.trim(),
      components: components.trim(),
      duration: duration.trim(),
      concentration,
      ritual,
      description,
      higherLevel: higherLevel.trim(),
      actionType: initial?.actionType ?? 'action'
    })
  }

  return (
    <Modal onClose={onClose} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20 }}>{initial ? 'Edit' : 'New'} Homebrew Spell</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 'var(--space-3)' }}>
          <Field label="Name">
            <input className="gb-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Spell name" />
          </Field>
          <Field label="Level">
            <select className="gb-input" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {SPELL_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl === 0 ? 'Cantrip' : lvl}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <Field label="School">
            <input className="gb-input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Evocation, Illusion…" />
          </Field>
          <Field label="Casting Time">
            <input className="gb-input" value={castingTime} onChange={(e) => setCastingTime(e.target.value)} placeholder="1 action" />
          </Field>
          <Field label="Range">
            <input className="gb-input" value={range} onChange={(e) => setRange(e.target.value)} placeholder="60 feet" />
          </Field>
          <Field label="Duration">
            <input className="gb-input" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Instantaneous" />
          </Field>
        </div>

        <Field label="Components">
          <input className="gb-input" value={components} onChange={(e) => setComponents(e.target.value)} placeholder="V, S, M (a pinch of salt)" />
        </Field>

        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={concentration} onChange={(e) => setConcentration(e.target.checked)} />
            Concentration
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={ritual} onChange={(e) => setRitual(e.target.checked)} />
            Ritual
          </label>
        </div>

        <Field label="Description">
          <textarea
            className="gb-input"
            style={{ minHeight: 140, resize: 'vertical' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What the spell does…"
          />
        </Field>

        <Field label="At Higher Levels (optional)">
          <textarea
            className="gb-input"
            style={{ minHeight: 60, resize: 'vertical' }}
            value={higherLevel}
            onChange={(e) => setHigherLevel(e.target.value)}
            placeholder="When cast using a higher-level slot…"
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!name.trim()}>
            {initial ? 'Save' : 'Add Spell'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <div className="gb-label">{label}</div>
      {children}
    </div>
  )
}
