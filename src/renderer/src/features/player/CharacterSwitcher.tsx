import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import type { CharacterSheet } from '@shared/ipc'

interface CharacterSwitcherProps {
  characters: CharacterSheet[] | null
  current: CharacterSheet | null
  onSelect: (character: CharacterSheet) => void
  onRequestCreate: () => void
  /** Deletion lives here now, not on the sheet itself — a character you're actively looking at is exactly where a stray click is most likely to land, so putting the button somewhere you only visit to switch/manage characters cuts down on that risk on its own, on top of the two-click confirm below. */
  onDelete: (character: CharacterSheet) => void
}

/** Player mode's bottom-left corner control — picks/creates a character, the way CampaignSwitcher does for campaigns on the DM side. Fed from the shared player workspace state rather than fetching its own list. Creation itself opens the guided wizard (CharacterCreationWizard) rather than instant-creating here. */
export function CharacterSwitcher({ characters, current, onSelect, onRequestCreate, onDelete }: CharacterSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false)
  // Two clicks to actually delete: the first arms this row (button flips to
  // "Confirm delete?"), the second (still targeting the same character)
  // deletes it. Any other click — a different row's delete, selecting a
  // character, closing the menu — disarms it instead of carrying over.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmingId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleDeleteClick(character: CharacterSheet): void {
    if (confirmingId === character.id) {
      setConfirmingId(null)
      onDelete(character)
    } else {
      setConfirmingId(character.id)
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      {open && (
        <div
          className="gb-card"
          style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: 260, zIndex: 200 }}
        >
          <h3
            style={{
              fontSize: 11,
              margin: '0 0 var(--space-2)',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 700
            }}
          >
            Characters
          </h3>

          {characters === null ? null : characters.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
              No characters yet.
            </p>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                marginBottom: 'var(--space-3)',
                maxHeight: 220,
                overflowY: 'auto'
              }}
            >
              {characters.map((character) => (
                <div key={character.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onSelect(character)
                    }}
                    style={{
                      display: 'block',
                      flex: 1,
                      minWidth: 0,
                      textAlign: 'left',
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      cursor: 'pointer',
                      background: current?.id === character.id ? 'var(--accent-subtle)' : 'transparent',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {character.name || 'Untitled'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteClick(character)}
                    title={confirmingId === character.id ? 'Click again to permanently delete' : 'Delete this character'}
                    style={{
                      flexShrink: 0,
                      padding: confirmingId === character.id ? '4px 6px' : '4px 6px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${confirmingId === character.id ? 'var(--danger)' : 'transparent'}`,
                      background: confirmingId === character.id ? 'var(--danger)' : 'none',
                      color: confirmingId === character.id ? 'var(--text-on-accent)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: confirmingId === character.id ? 10 : 14,
                      fontWeight: confirmingId === character.id ? 700 : 400,
                      lineHeight: 1,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {confirmingId === character.id ? 'Confirm?' : '×'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="primary"
            onClick={() => {
              setOpen(false)
              onRequestCreate()
            }}
            style={{ width: '100%' }}
          >
            + New Character
          </Button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="gb-btn gb-btn--secondary"
        style={{ width: '100%', minWidth: 0, boxShadow: 'var(--shadow-md)' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? current.name || 'Untitled' : '+ Add a character'}
        </span>
      </button>
    </div>
  )
}
