import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import type { Campaign } from '@shared/ipc'

interface CampaignSwitcherProps {
  /** Omit for the DM's own table; pass a connected host's address for a remote table. */
  address?: string
  canCreate: boolean
  current: Campaign | null
  onSelect: (campaign: Campaign) => void
}

/** Bottom-left "which campaign am I in" control — replaces the old always-visible campaign list with an Obsidian-style corner switcher. */
export function CampaignSwitcher({ address, canCreate, current, onSelect }: CampaignSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) refresh()
  }, [open, address])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function refresh(): void {
    window.goblin.campaigns.list(address).then((result) => {
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
    const result = await window.goblin.campaigns.create(newName.trim(), address)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNewName('')
    setOpen(false)
    onSelect(result.data)
  }

  async function selectCampaign(campaign: Campaign): Promise<void> {
    if (campaign.myRole) {
      setOpen(false)
      onSelect(campaign)
      return
    }
    setBusyId(campaign.id)
    setError(null)
    const result = await window.goblin.campaigns.join(campaign.id, address)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setOpen(false)
    onSelect(result.data)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
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
              {campaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => selectCampaign(campaign)}
                  disabled={busyId === campaign.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: current?.id === campaign.id ? 'var(--accent-subtle)' : 'transparent',
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
              ))}
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
        style={{ maxWidth: 240, boxShadow: 'var(--shadow-md)' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? current.name : canCreate ? '+ Add a campaign' : 'No campaign yet'}
        </span>
      </button>
    </div>
  )
}
