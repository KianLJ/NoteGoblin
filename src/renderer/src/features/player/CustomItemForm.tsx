import { useState, type ReactNode } from 'react'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import type { EquipmentItem } from '@shared/dnd5e'

interface CustomItemFormProps {
  initial?: EquipmentItem
  onSave: (item: Omit<EquipmentItem, 'id' | 'compendiumId' | 'magicItemId'>) => void
  onClose: () => void
}

/** Full-screen form for a homebrew inventory item — category, cost, weight, and description as real fields instead of one description box, so the hover tooltip has something structured to show for custom items too. */
export function CustomItemForm({ initial, onSave, onClose }: CustomItemFormProps): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [cost, setCost] = useState(initial?.cost ?? '')
  const [weight, setWeight] = useState(initial?.weight ?? 0)
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1)
  const [notes, setNotes] = useState(initial?.notes ?? '')

  function handleSave(): void {
    onSave({ name: name.trim(), category: category.trim(), cost: cost.trim(), weight, quantity, notes, equipped: initial?.equipped ?? false })
  }

  return (
    <Modal onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20 }}>{initial ? 'Edit' : 'New'} Homebrew Item</h2>

        <Field label="Name">
          <input className="gb-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <Field label="Category">
            <input className="gb-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Adventuring Gear, Potion…" />
          </Field>
          <Field label="Cost">
            <input className="gb-input" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="5 gp" />
          </Field>
          <Field label="Weight (lb.)">
            <input type="number" min={0} className="gb-input" value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
          </Field>
          <Field label="Quantity">
            <input type="number" min={0} className="gb-input" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            className="gb-input"
            style={{ minHeight: 120, resize: 'vertical' }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What it does, what it looks like…"
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!name.trim()}>
            {initial ? 'Save' : 'Add Item'}
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
