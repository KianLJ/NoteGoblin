import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import type { HostAddressOption, HostingStatus } from '@shared/ipc'

interface HostingCornerProps {
  onStatusChange?: (status: HostingStatus) => void
}

/** A compact hosting toggle for the header — hosting is only about letting remote players connect, not a gate on editing your own campaigns, so it doesn't need to dominate the screen. */
export function HostingCorner({ onStatusChange }: HostingCornerProps): JSX.Element {
  const [status, setStatus] = useState<HostingStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.goblin.hosting.status().then((s) => {
      setStatus(s)
      onStatusChange?.(s)
    })
    // onStatusChange is expected to be referentially stable for the life of
    // this component — only re-run this fetch on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function start(): Promise<void> {
    setBusy(true)
    setError(null)
    const result = await window.goblin.hosting.start()
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const next: HostingStatus = { hosting: true, fingerprint: result.fingerprint, addresses: result.addresses }
    setStatus(next)
    onStatusChange?.(next)
  }

  async function stop(): Promise<void> {
    setBusy(true)
    await window.goblin.hosting.stop()
    setBusy(false)
    const next: HostingStatus = { hosting: false }
    setStatus(next)
    onStatusChange?.(next)
  }

  if (!status) return <></>

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="gb-btn gb-btn--secondary"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: status.hosting ? 'var(--success)' : 'var(--text-muted)'
          }}
        />
        {status.hosting ? 'Hosting' : 'Not Hosting'}
      </button>

      {open && (
        <div
          className="gb-card"
          style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320, zIndex: 20 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--space-2)'
            }}
          >
            <h3 style={{ fontSize: 15, margin: 0 }}>Your Table</h3>
            {status.hosting ? (
              <Button variant="secondary" onClick={stop} disabled={busy}>
                Stop Hosting
              </Button>
            ) : (
              <Button variant="primary" onClick={start} disabled={busy}>
                {busy ? 'Starting…' : 'Start Hosting'}
              </Button>
            )}
          </div>

          {status.hosting ? (
            <div>
              <p style={{ fontSize: 12, marginBottom: 'var(--space-2)' }}>
                Share an invite code so players can join live:
              </p>
              {status.addresses.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--danger)' }}>
                  No network address found — check Tailscale or LAN.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {status.addresses.map((option) => (
                    <InviteRow key={option.address} option={option} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              You can create and edit campaigns anytime, solo. Start hosting only when you want
              players to connect live.
            </p>
          )}

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 'var(--space-2)' }}>{error}</p>
          )}
        </div>
      )}
    </div>
  )
}

function InviteRow({ option }: { option: HostAddressOption }): JSX.Element {
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(option.inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-2)',
        background: 'var(--bg-sunken)',
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-2)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span className={`gb-badge ${option.kind === 'tailscale' ? 'gb-badge--accent' : ''}`}>
          {option.kind === 'tailscale' ? 'Tailscale' : 'LAN'}
        </span>
        <code
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {option.address}
        </code>
      </div>
      <Button variant="secondary" onClick={copy} style={{ flexShrink: 0, fontSize: 12, padding: '4px 8px' }}>
        {copied ? 'Copied!' : 'Copy'}
      </Button>
    </div>
  )
}
