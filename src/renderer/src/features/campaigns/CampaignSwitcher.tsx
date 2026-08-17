import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import type { Campaign } from '@shared/ipc'

interface CampaignSwitcherProps {
  canCreate: boolean
  current: Campaign | null
  onSelect: (campaign: Campaign) => void
  /** Fired after deleting whichever campaign is currently open, so the parent can drop it from view instead of continuing to show a now-nonexistent campaign. */
  onCurrentDeleted: () => void
}

/** Bottom-left "which campaign am I in" control — replaces the old always-visible campaign list with an Obsidian-style corner switcher. Always the DM's own table; a joined session's campaigns are driven by the DM instead (see usePlayerWorkspace's auto-join). */
export function CampaignSwitcher({ canCreate, current, onSelect, onCurrentDeleted }: CampaignSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) refresh()
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
    if (!newName.trim()) return
    setError(null)
    const result = await window.goblin.campaigns.create(newName.trim())
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNewName('')
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
    <div ref={containerRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      {open && (
        <div
          className="gb-card"
          style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: 280 }}
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
            Campaigns
          </h3>

          {campaigns === null ? null : campaigns.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
              {canCreate ? 'No campaigns yet.' : 'This table has no campaigns yet.'}
            </p>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                marginBottom: canCreate ? 'var(--space-3)' : 0,
                maxHeight: 220,
                overflowY: 'auto'
              }}
            >
              {campaigns.map((campaign) =>
                renamingId === campaign.id ? (
                  <input
                    key={campaign.id}
                    autoFocus
                    className="gb-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(campaign)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(campaign)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    style={{ fontSize: 13, padding: '5px 8px' }}
                  />
                ) : (
                  <div
                    key={campaign.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      borderRadius: 'var(--radius-sm)',
                      background: current?.id === campaign.id ? 'var(--accent-subtle)' : 'transparent'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => selectCampaign(campaign)}
                      disabled={busyId === campaign.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        flex: 1,
                        minWidth: 0,
                        padding: '6px 8px',
                        border: 'none',
                        background: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                        fontSize: 13
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {campaign.name}
                      </span>
                      <span
                        className={`gb-badge ${campaign.myRole === 'dm' ? 'gb-badge--accent' : ''}`}
                        style={{ fontSize: 10, flexShrink: 0 }}
                      >
                        {busyId === campaign.id
                          ? '…'
                          : campaign.myRole === 'dm'
                            ? 'DM'
                            : campaign.myRole === 'player'
                              ? 'Player'
                              : 'Join'}
                      </span>
                    </button>
                    {campaign.myRole === 'dm' && (
                      <>
                        <button
                          type="button"
                          title="Rename campaign"
                          onClick={() => startRename(campaign)}
                          disabled={busyId === campaign.id}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: 11,
                            cursor: 'pointer',
                            flexShrink: 0,
                            padding: '2px 4px'
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          title="Delete campaign"
                          onClick={() => setPendingDelete(campaign)}
                          disabled={busyId === campaign.id}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--danger)',
                            fontSize: 11,
                            cursor: 'pointer',
                            flexShrink: 0,
                            padding: '2px 4px 2px 0'
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {canCreate && (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="gb-input"
                placeholder="New campaign"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createCampaign()}
                style={{ fontSize: 13 }}
              />
              <Button variant="primary" onClick={createCampaign} disabled={!newName.trim()}>
                Add
              </Button>
            </div>
          )}

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 'var(--space-2)' }}>{error}</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="gb-btn gb-btn--secondary"
        style={{ width: '100%', minWidth: 0, boxShadow: 'var(--shadow-md)' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? current.name : canCreate ? '+ Add a campaign' : 'No campaign yet'}
        </span>
      </button>

      {pendingDelete && (
        <Modal onClose={() => setPendingDelete(null)} width={360}>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '0 0 var(--space-4)' }}>
            Delete "{pendingDelete.name}"? Every note, folder, character, and message in it goes with it. This can't
            be undone.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={confirmDeleteCampaign}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
