import { useEffect, useState } from 'react'
import { Button } from '../../ui/Button'
import type { HostAddressOption, HostingStatus } from '@shared/ipc'

export function HostingPanel(): JSX.Element {
  const [status, setStatus] = useState<HostingStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.goblin.hosting.status().then(setStatus)
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
    setStatus({ hosting: true, fingerprint: result.fingerprint, addresses: result.addresses })
  }

  async function stop(): Promise<void> {
    setBusy(true)
    await window.goblin.hosting.stop()
    setBusy(false)
    setStatus({ hosting: false })
  }

  if (!status) return <div className="gb-card" style={{ minHeight: 120 }} />

  return (
    <div className="gb-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span className={`gb-badge ${status.hosting ? 'gb-badge--success' : ''}`}>
            {status.hosting ? 'Hosting' : 'Not Hosting'}
          </span>
          <h3 style={{ marginTop: 'var(--space-2)', fontSize: 17 }}>Your Table</h3>
        </div>
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
        <div style={{ marginTop: 'var(--space-3)' }}>
          <p style={{ marginBottom: 'var(--space-2)' }}>
            Send a player this invite code — pasting it is all they need to join, fingerprint
            included.
          </p>
          {status.addresses.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--danger)' }}>
              No network address was found to share — check you're connected to Tailscale or a
              LAN.
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
        <p style={{ marginTop: 'var(--space-3)' }}>
          Starting hosting opens your table on your local network so players can join with
          Tailscale or LAN.
        </p>
      )}

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 'var(--space-2)' }}>{error}</p>
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
        gap: 'var(--space-3)',
        background: 'var(--bg-sunken)',
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-2) var(--space-3)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span className={`gb-badge ${option.kind === 'tailscale' ? 'gb-badge--accent' : ''}`}>
          {option.kind === 'tailscale' ? 'Tailscale' : 'LAN'}
        </span>
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{option.address}</code>
      </div>
      <Button variant="secondary" onClick={copy}>
        {copied ? 'Copied!' : 'Copy Invite Code'}
      </Button>
    </div>
  )
}
