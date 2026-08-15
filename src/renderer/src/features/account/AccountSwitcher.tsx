import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Button } from '../../ui/Button'
import { ChevronRightIcon } from '../campaigns/icons'
import { emitIdentitySwitched } from '../auth/identityEvents'
import type { IdentitySummary } from '@shared/ipc'

/**
 * Local test accounts — the identity table already supports any number of
 * rows (one per display name), this just exposes listing/switching. Handy
 * for exercising the join flow without a second device: host as one
 * identity, switch to another here, then join your own hosted campaign
 * through the real network path instead of faking it.
 */
export function AccountSwitcher(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [accounts, setAccounts] = useState<IdentitySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [passwordPromptId, setPasswordPromptId] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [rememberOnSwitch, setRememberOnSwitch] = useState(true)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')

  function refresh(): void {
    window.goblin.identity.list().then(setAccounts)
  }

  useEffect(() => {
    if (open) refresh()
  }, [open])

  async function performSwitch(account: IdentitySummary, withPassword?: string): Promise<void> {
    setError(null)
    const result = await window.goblin.identity.switch(account.id, withPassword, rememberOnSwitch)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPasswordPromptId(null)
    setPassword('')
    emitIdentitySwitched(result.identity)
  }

  function handleRowClick(account: IdentitySummary): void {
    if (account.current) return
    if (account.remembered) {
      void performSwitch(account)
      return
    }
    setError(null)
    setPassword('')
    setPasswordPromptId(account.id)
  }

  async function handleForgetSaved(id: string, e: ReactMouseEvent): Promise<void> {
    e.stopPropagation()
    await window.goblin.identity.forgetSaved(id)
    refresh()
  }

  async function handleCreate(): Promise<void> {
    setError(null)
    if (newName.trim().length < 2) {
      setError('Pick a display name with at least 2 characters.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password should be at least 8 characters.')
      return
    }
    const result = await window.goblin.identity.create(newName.trim(), newPassword)
    if (!result.ok) {
      setError(result.error)
      return
    }
    // Test accounts are meant to be switched to quickly — remember it by
    // default rather than making you retype the password every time.
    await window.goblin.identity.remember(true)
    setNewName('')
    setNewPassword('')
    setCreating(false)
    emitIdentitySwitched(result.identity)
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          margin: '0 0 var(--space-2)',
          cursor: 'pointer'
        }}
      >
        <span
          style={{
            display: 'flex',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 100ms',
            color: 'var(--text-muted)'
          }}
        >
          <ChevronRightIcon />
        </span>
        <h3 style={{ fontSize: 14, margin: 0 }}>Switch account</h3>
      </button>

      {open && (
        <div>
          {accounts === null && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>}

          {accounts?.map((account) => (
            <div key={account.id} style={{ marginBottom: 2 }}>
              <button
                type="button"
                onClick={() => handleRowClick(account)}
                disabled={account.current}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: account.current ? 'var(--accent-subtle)' : 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  cursor: account.current ? 'default' : 'pointer',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  if (!account.current) e.currentTarget.style.background = 'var(--bg-sunken)'
                }}
                onMouseLeave={(e) => {
                  if (!account.current) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {account.displayName}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {account.current && (
                    <span className="gb-badge gb-badge--accent" style={{ fontSize: 10 }}>
                      Current
                    </span>
                  )}
                  {!account.current && account.remembered && (
                    <span
                      role="button"
                      title="Forget saved password"
                      onClick={(e) => void handleForgetSaved(account.id, e)}
                      style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline' }}
                    >
                      forget
                    </span>
                  )}
                </span>
              </button>

              {passwordPromptId === account.id && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 8px 8px' }}>
                  <input
                    autoFocus
                    type="password"
                    className="gb-input"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void performSwitch(account, password)}
                    style={{ fontSize: 13 }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={rememberOnSwitch}
                      onChange={(e) => setRememberOnSwitch(e.target.checked)}
                    />
                    Remember this account
                  </label>
                  <Button variant="secondary" onClick={() => void performSwitch(account, password)} disabled={!password}>
                    Switch
                  </Button>
                </div>
              )}
            </div>
          ))}

          {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '4px 0' }}>{error}</p>}

          {creating ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              <input
                autoFocus
                className="gb-input"
                placeholder="Display name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ fontSize: 13 }}
              />
              <input
                type="password"
                className="gb-input"
                placeholder="Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
                style={{ fontSize: 13 }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <Button variant="primary" onClick={handleCreate} style={{ flex: 1 }}>
                  Create &amp; switch
                </Button>
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                marginTop: 4,
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                background: 'none',
                color: 'var(--text-muted)',
                fontSize: 13,
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-sunken)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              + New test account
            </button>
          )}
        </div>
      )}
    </div>
  )
}
