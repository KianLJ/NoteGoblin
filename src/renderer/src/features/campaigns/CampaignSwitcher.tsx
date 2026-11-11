import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { useLastTruthy } from '../../ui/useLastTruthy'
import { XIcon } from '../../ui/icons'
import { CampaignIcon, PencilIcon } from './icons'
import type { Campaign } from '@shared/ipc'

interface CampaignSwitcherProps {
  canCreate: boolean
  current: Campaign | null
  onSelect: (campaign: Campaign) => void
  /** Fired after deleting whichever campaign is currently open, so the parent can drop it from view instead of continuing to show a now-nonexistent campaign. */
  onCurrentDeleted: () => void
  /** null while not hosting — shown as a green dot on the pill (starting and stopping is HostButton's, beside the campaign's name). */
  hostedSessionId: string | null
}

/**
 * The canvas's bottom-left "which campaign am I in" pill, and the menu it opens upward: the campaigns (rename and
 * delete on hover) and a new one. Always the DM's own table; a joined session's campaigns are driven by
 * the DM instead (see usePlayerWorkspace's auto-join). Classic layout keeps the old one (ClassicCampaignSwitcher).
 */
export function CampaignSwitcher({ canCreate, current, onSelect, onCurrentDeleted, hostedSessionId }: CampaignSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // null: the "New campaign" row; a string: its name field, open.
  const [newName, setNewName] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null)
  const lastPendingDelete = useLastTruthy(pendingDelete)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setNewName(null)
      return
    }
    refresh()
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !(e.target as Element).closest('input')) setOpen(false)
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

  function refresh(): void {
    window.goblin.campaigns.list().then((result) => {
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCampaigns(result.data)
    })
  }

  async function createCampaign(): Promise<void> {
    const name = newName?.trim()
    if (!name) return
    setError(null)
    const result = await window.goblin.campaigns.create(name)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNewName(null)
    setOpen(false)
    onSelect(result.data)
  }

  function startRename(campaign: Campaign): void {
    setRenamingId(campaign.id)
    setRenameValue(campaign.name)
  }

  async function commitRename(campaign: Campaign): Promise<void> {
    const trimmed = renameValue.trim()
    setRenamingId(null)
    if (!trimmed || trimmed === campaign.name) return
    setBusyId(campaign.id)
    setError(null)
    const result = await window.goblin.campaigns.rename(campaign.id, trimmed)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setCampaigns((prev) => prev?.map((c) => (c.id === campaign.id ? result.data : c)) ?? prev)
    if (current?.id === campaign.id) onSelect(result.data)
  }

  async function confirmDeleteCampaign(): Promise<void> {
    if (!pendingDelete) return
    const campaign = pendingDelete
    setPendingDelete(null)
    setBusyId(campaign.id)
    setError(null)
    const result = await window.goblin.campaigns.delete(campaign.id)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setCampaigns((prev) => prev?.filter((c) => c.id !== campaign.id) ?? prev)
    if (current?.id === campaign.id) onCurrentDeleted()
  }

  async function selectCampaign(campaign: Campaign): Promise<void> {
    if (campaign.myRole) {
      setOpen(false)
      onSelect(campaign)
      return
    }
    setBusyId(campaign.id)
    setError(null)
    const result = await window.goblin.campaigns.join(campaign.id)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setOpen(false)
    onSelect(result.data)
  }

  return (
    <div ref={containerRef} className="gb-switcher">
      {open && (
        <div className="gb-switcher-menu" role="menu">
          <div className="gb-switcher-heading">Campaigns</div>

          {campaigns !== null && campaigns.length === 0 && (
            <p className="gb-switcher-empty">{canCreate ? 'No campaigns yet.' : 'This table has no campaigns yet.'}</p>
          )}

          {campaigns && campaigns.length > 0 && (
            <div className="gb-switcher-list">
              {campaigns.map((campaign) =>
                renamingId === campaign.id ? (
                  <input
                    key={campaign.id}
                    autoFocus
                    className="gb-input gb-switcher-input"
                    value={renameValue}
                    aria-label="Campaign name"
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(campaign)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(campaign)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                  />
                ) : (
                  <div key={campaign.id} className={current?.id === campaign.id ? 'gb-switcher-row gb-switcher-row--current' : 'gb-switcher-row'}>
                    <button type="button" role="menuitem" className="gb-switcher-item" onClick={() => selectCampaign(campaign)} disabled={busyId === campaign.id}>
                      <span className="gb-switcher-item-name">{campaign.name}</span>
                      <span className="gb-switcher-item-role">
                        {busyId === campaign.id ? '…' : campaign.myRole === 'dm' ? 'DM' : campaign.myRole === 'player' ? 'Player' : 'Join'}
                      </span>
                    </button>
                    {campaign.myRole === 'dm' && (
                      <span className="gb-switcher-row-actions">
                        <button type="button" className="gb-switcher-icon" title="Rename" aria-label={`Rename ${campaign.name}`} onClick={() => startRename(campaign)} disabled={busyId === campaign.id}>
                          <PencilIcon />
                        </button>
                        <button type="button" className="gb-switcher-icon gb-switcher-icon--danger" title="Delete" aria-label={`Delete ${campaign.name}`} onClick={() => setPendingDelete(campaign)} disabled={busyId === campaign.id}>
                          <XIcon size={12} />
                        </button>
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {canCreate &&
            (newName === null ? (
              <button type="button" role="menuitem" className="gb-switcher-item gb-switcher-new" onClick={() => setNewName('')}>
                + New campaign
              </button>
            ) : (
              <input
                autoFocus
                className="gb-input gb-switcher-input"
                placeholder="Name it, then press Enter"
                aria-label="New campaign name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => !newName.trim() && setNewName(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createCampaign()
                  if (e.key === 'Escape') setNewName(null)
                }}
              />
            ))}

          {error && <p className="gb-switcher-error">{error}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="gb-switcher-trigger gb-switcher-trigger--icon"
        data-hosting={hostedSessionId ? 'on' : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={current ? `Campaign: ${current.name}${hostedSessionId ? ' (hosting)' : ''}` : 'Campaigns'}
      >
        <CampaignIcon />
        <span className="gb-switcher-trigger-name">{current ? current.name : canCreate ? '+ Add a campaign' : 'No campaign yet'}</span>
      </button>

      <Modal open={pendingDelete !== null} onClose={() => setPendingDelete(null)} width={360}>
        <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '0 0 var(--space-4)' }}>
          Delete "{lastPendingDelete?.name}"? Every note, folder, character, and message in it goes with it. This
          can't be undone.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
          <Button variant="primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={confirmDeleteCampaign}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
