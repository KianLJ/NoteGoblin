import { useEffect, useState } from 'react'
import { Button } from '../../ui/Button'
import { Fingerprint } from './Fingerprint'
import type { KnownHostSummary, ProbeResult } from '@shared/ipc'

type Step = 'closed' | 'invite' | 'address' | 'confirm' | 'connecting'

export function JoinCampaignPanel(): JSX.Element {
  const [step, setStep] = useState<Step>('closed')
  const [inviteCode, setInviteCode] = useState('')
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState('')
  const [expectedFingerprint, setExpectedFingerprint] = useState<string | null>(null)
  const [probe, setProbe] = useState<Extract<ProbeResult, { ok: true }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [knownHosts, setKnownHosts] = useState<KnownHostSummary[]>([])
  const [reconnectingAddress, setReconnectingAddress] = useState<string | null>(null)

  useEffect(() => {
    refreshKnownHosts()
  }, [])

  function refreshKnownHosts(): void {
    window.goblin.connections.list().then(setKnownHosts)
  }

  function reset(): void {
    setInviteCode('')
    setAddress('')
    setLabel('')
    setExpectedFingerprint(null)
    setProbe(null)
    setError(null)
  }

  function openPanel(): void {
    if (step === 'closed') {
      reset()
      setStep('invite')
    } else {
      setStep('closed')
    }
  }

  async function handleUseInviteCode(): Promise<void> {
    setError(null)
    const decoded = await window.goblin.connections.decodeInvite(inviteCode)
    if (!decoded.ok) {
      setError(decoded.error)
      return
    }
    setAddress(decoded.address)
    setLabel(decoded.label ?? '')
    setExpectedFingerprint(decoded.fingerprint)
    await runProbe(decoded.address, decoded.fingerprint)
  }

  async function handleProbeManualAddress(): Promise<void> {
    setError(null)
    if (!address.trim()) return
    setExpectedFingerprint(null)
    await runProbe(address.trim(), null)
  }

  /** Probes the address and decides whether the invite code's promised fingerprint (if any) still matches reality before showing a confirm step. */
  async function runProbe(targetAddress: string, expected: string | null): Promise<void> {
    const result = await window.goblin.connections.probe(targetAddress)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (expected && expected !== result.fingerprint) {
      setProbe({ ...result, status: 'mismatch', previousFingerprint: expected })
    } else {
      setProbe(result)
    }
    setStep('confirm')
  }

  async function handleConfirm(): Promise<void> {
    setStep('connecting')
    setError(null)
    const result = await window.goblin.connections.join(address.trim(), label.trim() || undefined)
    if (!result.ok) {
      setError(result.error)
      setStep('confirm')
      return
    }
    setStep('closed')
    reset()
    refreshKnownHosts()
  }

  /** One-click path for a host we already trust: only fall back to the confirm screen if its fingerprint has actually changed since we last saw it. */
  async function handleReconnect(host: KnownHostSummary): Promise<void> {
    setError(null)
    setReconnectingAddress(host.address)

    const result = await window.goblin.connections.probe(host.address)
    if (!result.ok) {
      setError(`${host.label}: ${result.error}`)
      setReconnectingAddress(null)
      return
    }

    if (result.status === 'match') {
      const joinResult = await window.goblin.connections.join(host.address)
      setReconnectingAddress(null)
      if (!joinResult.ok) {
        setError(`${host.label}: ${joinResult.error}`)
        return
      }
      refreshKnownHosts()
      return
    }

    // Fingerprint is new or changed — fall back to the full confirm flow.
    setReconnectingAddress(null)
    setAddress(host.address)
    setLabel(host.label)
    setExpectedFingerprint(null)
    setProbe(result)
    setStep('confirm')
  }

  async function handleForget(address: string): Promise<void> {
    await window.goblin.connections.forget(address)
    refreshKnownHosts()
  }

  return (
    <div>
      <Button variant="secondary" onClick={openPanel}>
        {step === 'closed' ? 'Join a Campaign' : 'Cancel'}
      </Button>

      {step !== 'closed' && (
        <div className="gb-card" style={{ marginTop: 'var(--space-3)', maxWidth: 420 }}>
          {step === 'invite' && (
            <>
              <label className="gb-label" htmlFor="invite-code">
                Invite code
              </label>
              <textarea
                id="invite-code"
                className="gb-input"
                style={{ minHeight: 72, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                placeholder="Paste the code your DM sent you"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
              <Button
                variant="primary"
                style={{ marginTop: 'var(--space-3)' }}
                onClick={handleUseInviteCode}
                disabled={!inviteCode.trim()}
              >
                Continue
              </Button>
              <button
                type="button"
                onClick={() => {
                  reset()
                  setStep('address')
                }}
                style={{
                  display: 'block',
                  marginTop: 'var(--space-3)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0
                }}
              >
                No invite code? Enter an address manually
              </button>
            </>
          )}

          {(step === 'address' || (step === 'confirm' && expectedFingerprint === null) || (step === 'connecting' && expectedFingerprint === null)) && (
            <>
              <label className="gb-label" htmlFor="host-address">
                Host address
              </label>
              <input
                id="host-address"
                className="gb-input"
                style={{ marginBottom: 'var(--space-3)' }}
                placeholder="100.x.x.x:47331"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value)
                  setStep('address')
                  setProbe(null)
                }}
                disabled={step === 'connecting'}
              />

              <label className="gb-label" htmlFor="host-label">
                Name it (optional)
              </label>
              <input
                id="host-label"
                className="gb-input"
                placeholder="e.g. Kian's Table"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={step === 'connecting'}
              />
            </>
          )}

          {step === 'address' && (
            <Button
              variant="primary"
              style={{ marginTop: 'var(--space-3)' }}
              onClick={handleProbeManualAddress}
              disabled={!address.trim()}
            >
              Continue
            </Button>
          )}

          {(step === 'confirm' || step === 'connecting') && probe && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              {probe.status === 'mismatch' ? (
                <div
                  style={{
                    background: 'var(--accent-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-3)'
                  }}
                >
                  <p style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}>
                    {expectedFingerprint
                      ? "This doesn't match the invite code"
                      : "This host's fingerprint changed"}
                  </p>
                  <p style={{ fontSize: 13, marginBottom: 'var(--space-2)' }}>
                    {expectedFingerprint ? 'The invite code promised:' : "It's previously connected as:"}
                  </p>
                  <Fingerprint value={probe.previousFingerprint ?? ''} />
                  <p style={{ fontSize: 13, margin: 'var(--space-2) 0' }}>Now presenting:</p>
                  <Fingerprint value={probe.fingerprint} />
                  <p style={{ fontSize: 12, marginTop: 'var(--space-2)' }}>
                    This could mean the server was reinstalled — or something suspicious. Only
                    continue if you're sure why it changed.
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ marginBottom: 'var(--space-1)' }}>
                    {label ? `Ready to connect to “${label}.”` : 'Ready to connect.'}
                  </p>
                  {!expectedFingerprint && (
                    <>
                      <p style={{ fontSize: 12, marginTop: 'var(--space-2)' }}>
                        {probe.status === 'new'
                          ? 'This host presents fingerprint (check it against what your DM shared):'
                          : 'Fingerprint matches what you trusted before:'}
                      </p>
                      <Fingerprint value={probe.fingerprint} />
                    </>
                  )}
                </div>
              )}

              <Button
                variant="primary"
                style={{ marginTop: 'var(--space-3)' }}
                onClick={handleConfirm}
                disabled={step === 'connecting'}
              >
                {step === 'connecting' ? 'Connecting…' : 'Trust & Connect'}
              </Button>
            </div>
          )}

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 'var(--space-3)' }}>
              {error}
            </p>
          )}
        </div>
      )}

      {step === 'closed' && error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 'var(--space-3)' }}>{error}</p>
      )}

      {knownHosts.length > 0 && (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <h3
            style={{
              fontSize: 14,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            Your Tables
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-2)'
            }}
          >
            {knownHosts.map((host) => (
              <div
                key={host.address}
                className="gb-card"
                style={{
                  padding: 'var(--space-3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{host.label}</div>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                    {host.address}
                  </code>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <Button
                    variant="secondary"
                    onClick={() => handleReconnect(host)}
                    disabled={reconnectingAddress === host.address}
                  >
                    {reconnectingAddress === host.address ? 'Connecting…' : 'Reconnect'}
                  </Button>
                  <Button variant="ghost" onClick={() => handleForget(host.address)}>
                    Forget
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
