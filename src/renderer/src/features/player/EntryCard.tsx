import type { CSSProperties, ReactNode } from 'react'

interface EntryCardProps {
  name: ReactNode
  badge?: ReactNode
  onEdit?: () => void
  onRemove: () => void
  children: ReactNode
}

/** Shared card chrome for one attack/spell/item entry — a name header (locked display or editable input, passed in by the caller) with an optional badge (level, weapon category, etc.), an edit button for custom entries, a remove button, and a body area below for the entry's fields. Used by CombatTab's Attacks, SpellsTab, and InventoryTab so all three read as one consistent card language. */
export function EntryCard({ name, badge, onEdit, onRemove, children }: EntryCardProps): JSX.Element {
  return (
    <div className="gb-card" style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>{name}</div>
        {badge}
        {onEdit && (
          <button type="button" onClick={onEdit} title="Edit description" style={editBtnStyle}>
            ✎
          </button>
        )}
        <button type="button" onClick={onRemove} title="Remove" style={removeBtnStyle}>
          ×
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{children}</div>
    </div>
  )
}

const cardStyle: CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  display: 'flex',
  flexDirection: 'column',
  gap: 6
}

const editBtnStyle: CSSProperties = {
  background: 'none',
  border: '1px solid var(--border-subtle)',
  borderRadius: '50%',
  width: 22,
  height: 22,
  flexShrink: 0,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 11,
  lineHeight: 1
}

const removeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 20,
  lineHeight: 1,
  padding: '0 4px',
  flexShrink: 0
}
