import { useState, type ReactNode } from 'react'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import type { Attack } from '@shared/dnd5e'

interface CustomWeaponFormProps {
  initial?: Attack
  onSave: (attack: Omit<Attack, 'id' | 'compendiumId'>) => void
  onClose: () => void
}

/** Full-screen form for a homebrew weapon/attack — damage, type, range, and properties as real fields instead of one description box, so the hover tooltip has something structured to show for custom weapons too. */
export function CustomWeaponForm({ initial, onSave, onClose }: CustomWeaponFormProps): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [damage, setDamage] = useState(initial?.damage ?? '')
  const [damageType, setDamageType] = useState(initial?.damageType ?? '')
  const [weaponRange, setWeaponRange] = useState<'Melee' | 'Ranged'>(initial?.weaponRange ?? 'Melee')
  const [properties, setProperties] = useState(initial?.properties ?? '')
  const [attackAbility, setAttackAbility] = useState<'str' | 'dex'>(initial?.attackAbility ?? 'str')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  function handleSave(): void {
    onSave({
      name: name.trim(),
      damage: damage.trim(),
      damageType: damageType.trim(),
      weaponRange,
      properties: properties.trim(),
      attackAbility,
      notes,
      actionType: initial?.actionType ?? 'action'
    })
  }

  return (
    <Modal onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20 }}>{initial ? 'Edit' : 'New'} Homebrew Weapon</h2>

        <Field label="Name">
          <input className="gb-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Weapon name" />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
          <Field label="Damage">
            <input className="gb-input" value={damage} onChange={(e) => setDamage(e.target.value)} placeholder="1d8" />
          </Field>
          <Field label="Damage Type">
            <input className="gb-input" value={damageType} onChange={(e) => setDamageType(e.target.value)} placeholder="Slashing" />
          </Field>
          <Field label="Range">
            <select className="gb-input" value={weaponRange} onChange={(e) => setWeaponRange(e.target.value as 'Melee' | 'Ranged')}>
              <option value="Melee">Melee</option>
              <option value="Ranged">Ranged</option>
            </select>
          </Field>
        </div>

        <Field label="Attack Ability">
          <select className="gb-input" style={{ width: 140 }} value={attackAbility} onChange={(e) => setAttackAbility(e.target.value as 'str' | 'dex')}>
            <option value="str">Strength</option>
            <option value="dex">Dexterity</option>
          </select>
        </Field>

        <Field label="Properties">
          <input className="gb-input" value={properties} onChange={(e) => setProperties(e.target.value)} placeholder="Finesse, Light, Thrown (20/60)…" />
        </Field>

        <Field label="Notes">
          <textarea
            className="gb-input"
            style={{ minHeight: 100, resize: 'vertical' }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything else — special abilities, flavor, etc…"
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!name.trim()}>
            {initial ? 'Save' : 'Add Weapon'}
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
