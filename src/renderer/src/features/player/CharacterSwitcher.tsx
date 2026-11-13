import { useEffect, useRef, useState } from 'react'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { stopMusic } from '../audio/musicEngine'
import type { CharacterSheet } from '@shared/ipc'
import { PencilIcon, XIcon } from '../../ui/icons'
import { UserIcon } from './icons'

interface CharacterSwitcherProps {
  characters: CharacterSheet[] | null
  current: CharacterSheet | null
  onSelect: (character: CharacterSheet) => void
  onRequestCreate: () => void
  /** Opens the full-page character creator again on this character, filled in, to change its choices. */
  onRequestEdit: (character: CharacterSheet) => void
  /** Deletion lives here, not on the sheet itself — a character you're actively looking at is exactly where a stray click is most likely to land, so it's somewhere you only visit to switch/manage characters, behind a two-click confirm. */
  onDelete: (character: CharacterSheet) => void
  /** The joined session id, if any (the switcher's button shows when you're at someone's table). */
  sessionId: string | null
}

/**
 * Player mode's bottom-left corner: the character's portrait (sliding out its name on hover), opening a menu of
 * characters (edit and delete on hover), a new one, and leaving the table — the player side's twin of
 * CampaignSwitcher, sharing its look (canvas.css's gb-switcher-*). Classic layout keeps the old one (ClassicCharacterSwitcher).
 */
/** Leaving the DM's table: beside the campaign's name, top left, like the DM's Host button. */
export function LeaveTableButton({ onLeft }: { onLeft: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false)
  return (
    <ConfirmButton
      label={busy ? 'Leaving…' : 'Leave'}
      confirmLabel="Leave the table?"
      variant="ghost"
      danger
      disabled={busy}
      onConfirm={async () => {
        setBusy(true)
        await window.goblin.sessions.leave()
        stopMusic()
        setBusy(false)
        onLeft()
      }}
      title="Disconnect from the DM’s session"
      style={{ fontSize: 11, padding: '2px 10px', borderRadius: 999 }}
    />
  )
}

export function CharacterSwitcher({ characters, current, onSelect, onRequestCreate, onRequestEdit, onDelete, sessionId }: CharacterSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false)
  // Two clicks to delete: the first arms the row's delete ("Delete?"), the second deletes. Anything else disarms it.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setConfirmingId(null)
      return
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const name = (c: CharacterSheet): string => c.name || 'Untitled'

  return (
    <div ref={containerRef} className="gb-switcher">
      {open && (
        <div className="gb-switcher-menu" role="menu">
          <div className="gb-switcher-heading">Characters</div>

          {characters !== null && characters.length === 0 && <p className="gb-switcher-empty">No characters yet.</p>}

          {characters && characters.length > 0 && (
            <div className="gb-switcher-list">
              {characters.map((character) => (
                <div key={character.id} className={current?.id === character.id ? 'gb-switcher-row gb-switcher-row--current' : 'gb-switcher-row'}>
                  <button
                    type="button"
                    role="menuitem"
                    className="gb-switcher-item"
                    onClick={() => {
                      setOpen(false)
                      onSelect(character)
                    }}
                  >
                    <Portrait character={character} />
                    <span className="gb-switcher-item-name">{name(character)}</span>
                  </button>
                  <span className="gb-switcher-row-actions" style={confirmingId === character.id ? { display: 'flex' } : undefined}>
                    <button
                      type="button"
                      className="gb-switcher-icon"
                      title="Edit in the character creator"
                      aria-label={`Edit ${name(character)}`}
                      onClick={() => {
                        setOpen(false)
                        onRequestEdit(character)
                      }}
                    >
                      <PencilIcon size={12} />
                    </button>
                    {confirmingId === character.id ? (
                      <button type="button" className="gb-switcher-confirm" autoFocus onBlur={() => setConfirmingId(null)} onClick={() => onDelete(character)}>
                        Delete?
                      </button>
                    ) : (
                      <button type="button" className="gb-switcher-icon gb-switcher-icon--danger" title="Delete" aria-label={`Delete ${name(character)}`} onClick={() => setConfirmingId(character.id)}>
                        <XIcon size={12} />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            role="menuitem"
            className="gb-switcher-item gb-switcher-new"
            onClick={() => {
              setOpen(false)
              onRequestCreate()
            }}
          >
            + New character
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={current?.portraitDataUrl ? 'gb-switcher-trigger gb-switcher-trigger--icon gb-switcher-trigger--portrait' : 'gb-switcher-trigger gb-switcher-trigger--icon'}
        data-hosting={sessionId ? 'on' : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={current ? `Character: ${name(current)}${sessionId ? ' (at the DM’s table)' : ''}` : 'Characters'}
      >
        {current?.portraitDataUrl ? <img className="gb-switcher-portrait" src={current.portraitDataUrl} alt="" /> : <UserIcon />}
        <span className="gb-switcher-trigger-name">{current ? name(current) : '+ Add a character'}</span>
      </button>
    </div>
  )
}

/** A row's small portrait, or its initial when it has none. */
function Portrait({ character }: { character: CharacterSheet }): JSX.Element {
  return character.portraitDataUrl ? (
    <img className="gb-switcher-portrait gb-switcher-portrait--row" src={character.portraitDataUrl} alt="" />
  ) : (
    <span className="gb-switcher-portrait gb-switcher-portrait--row gb-switcher-initial" aria-hidden="true">
      {(character.name || '?').trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
