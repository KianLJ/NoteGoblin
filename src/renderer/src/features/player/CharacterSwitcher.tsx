import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import type { CharacterSheet } from '@shared/ipc'

interface CharacterSwitcherProps {
  characters: CharacterSheet[] | null
  current: CharacterSheet | null
  onSelect: (character: CharacterSheet) => void
  onRequestCreate: () => void
}

/** Player mode's bottom-left corner control — picks/creates a character, the way CampaignSwitcher does for campaigns on the DM side. Fed from the shared player workspace state rather than fetching its own list. Creation itself opens the guided wizard (CharacterCreationWizard) rather than instant-creating here. */
export function CharacterSwitcher({ characters, current, onSelect, onRequestCreate }: CharacterSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
                <button
                  key={character.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onSelect(character)
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
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
