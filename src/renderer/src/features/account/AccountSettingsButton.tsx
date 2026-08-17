import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { GearIcon } from './icons'
import { ChevronRightIcon } from '../campaigns/icons'
import { ColorTokenEditor } from './ColorTokenEditor'
import { emitIdentitySwitched } from '../auth/identityEvents'
import { getStoredMode, setThemeMode, type ThemeMode } from '../../theme'
import type { Identity } from '@shared/ipc'
import type { AdminAccountSummary } from '@shared/relay'

/** Bottom-left gear button, next to the campaign switcher — lets you view/edit your local identity's display name and password, and manage remembered login. */
export function AccountSettingsButton(): JSX.Element {
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
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      {open && (
        <div
          className="gb-card"
          style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: 300, zIndex: 200 }}
        >
          <AccountSettingsForm />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="gb-btn gb-btn--secondary"
        title="Account settings"
        style={{ padding: 'var(--space-2)', boxShadow: 'var(--shadow-md)' }}
      >
        <GearIcon />
      </button>
    </div>
  )
}

function AccountSettingsForm(): JSX.Element {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  const [remembered, setRemembered] = useState<boolean | null>(null)

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getStoredMode())
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const [adminOpen, setAdminOpen] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountSummary[] | null>(null)
  const [adminBusyId, setAdminBusyId] = useState<string | null>(null)

  const [vaultOpen, setVaultOpen] = useState(false)
  const [vaultPath, setVaultPathState] = useState<string | null | undefined>(undefined)
  const [vaultBusy, setVaultBusy] = useState(false)
  const [vaultError, setVaultError] = useState<string | null>(null)
  const [vaultMigrated, setVaultMigrated] = useState<{ campaigns: number; notes: number; folders: number } | null>(null)

  function chooseThemeMode(mode: ThemeMode): void {
    setThemeMode(mode)
    setThemeModeState(mode)
  }

  useEffect(() => {
    window.goblin.identity.getCurrent().then((i) => {
      if (i) {
        setIdentity(i)
        setDisplayName(i.displayName)
      }
    })
    window.goblin.identity.hasRemembered().then(setRemembered)
  }, [])

  async function saveDisplayName(): Promise<void> {
    setNameError(null)
    setNameSaved(false)
    if (displayName.trim().length < 2) {
      setNameError('Pick a display name with at least 2 characters.')
      return
    }
    const result = await window.goblin.identity.updateDisplayName(displayName.trim())
    if (!result.ok) {
      setNameError(result.error)
      return
    }
    setIdentity(result.identity)
    setNameSaved(true)
  }

  async function savePassword(): Promise<void> {
    setPasswordError(null)
    setPasswordSaved(false)
    if (newPassword.length < 8) {
      setPasswordError('New password should be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }
    const result = await window.goblin.identity.changePassword(currentPassword, newPassword)
    if (!result.ok) {
      setPasswordError(result.error)
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordSaved(true)
  }

  async function toggleRemembered(): Promise<void> {
    const next = !remembered
    const result = await window.goblin.identity.remember(next)
    if (result.ok) setRemembered(next)
  }

  async function signOut(): Promise<void> {
    setSigningOut(true)
    await window.goblin.identity.signOut()
    emitIdentitySwitched(null)
  }

  async function loadAdminAccounts(): Promise<void> {
    setAdminError(null)
    const result = await window.goblin.relay.admin.listAccounts()
    if (!result.ok) {
      setAdminError(result.error)
      setAdminAccounts(null)
      return
    }
    setAdminAccounts(result.data)
  }

  async function loadVaultPath(): Promise<void> {
    setVaultPathState(await window.goblin.files.getVaultPath())
  }

  async function chooseVaultFolder(): Promise<void> {
    setVaultError(null)
    setVaultMigrated(null)
    setVaultBusy(true)
    const result = await window.goblin.files.chooseVaultFolder()
    setVaultBusy(false)
    if (!result.ok) {
      if (result.error !== 'Cancelled.') setVaultError(result.error)
      return
    }
    setVaultPathState(result.data.vaultPath)
    setVaultMigrated(result.data.migrated)
  }

  async function removeAdminAccount(account: AdminAccountSummary): Promise<void> {
    if (!window.confirm(`Delete the relay account "${account.username}"? This can't be undone.`)) return
    setAdminBusyId(account.userId)
    setAdminError(null)
    const result = await window.goblin.relay.admin.removeAccount(account.userId)
    setAdminBusyId(null)
    if (!result.ok) {
      setAdminError(result.error)
      return
    }
    setAdminAccounts((prev) => prev?.filter((a) => a.userId !== account.userId) ?? prev)
  }

  if (!identity) {
    return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
  }

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 var(--space-2)' }}>Profile</h3>

      <label className="gb-label" htmlFor="settings-display-name">
        Display name
      </label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        <input
          id="settings-display-name"
          className="gb-input"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value)
            setNameSaved(false)
          }}
        />
        <Button variant="secondary" onClick={saveDisplayName}>
          Save
        </Button>
      </div>
      {nameError && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{nameError}</p>}
      {nameSaved && <p style={{ color: 'var(--success)', fontSize: 12 }}>Saved.</p>}

      <hr className="gb-divider" style={{ margin: 'var(--space-3) 0 var(--space-2)' }} />

      <button
        type="button"
        onClick={() => setAppearanceOpen((o) => !o)}
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
            transform: appearanceOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 100ms',
            color: 'var(--text-muted)'
          }}
        >
          <ChevronRightIcon />
        </span>
        <h3 style={{ fontSize: 14, margin: 0 }}>Appearance</h3>
      </button>
      {appearanceOpen && (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-3)' }}>
            {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => chooseThemeMode(mode)}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: themeMode === mode ? 'var(--accent-subtle)' : 'transparent',
                  color: themeMode === mode ? 'var(--accent-hover)' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: themeMode === mode ? 700 : 400,
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {mode}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <ColorTokenEditor themeMode={themeMode} />
          </div>
        </>
      )}

      <hr className="gb-divider" style={{ margin: 'var(--space-2) 0' }} />

      <button
        type="button"
        onClick={() => setPasswordOpen((o) => !o)}
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
            transform: passwordOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 100ms',
            color: 'var(--text-muted)'
          }}
        >
          <ChevronRightIcon />
        </span>
        <h3 style={{ fontSize: 14, margin: 0 }}>Change password</h3>
      </button>
      {passwordOpen && (
        <>
          <input
            type="password"
            className="gb-input"
            placeholder="Current password"
            style={{ marginBottom: 6 }}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <input
            type="password"
            className="gb-input"
            placeholder="New password"
            style={{ marginBottom: 6 }}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <input
            type="password"
            className="gb-input"
            placeholder="Confirm new password"
            style={{ marginBottom: 6 }}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          <Button
            variant="secondary"
            onClick={savePassword}
            disabled={!currentPassword || !newPassword}
            style={{ width: '100%' }}
          >
            Update Password
          </Button>
          {passwordError && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{passwordError}</p>
          )}
          {passwordSaved && (
            <p style={{ color: 'var(--success)', fontSize: 12, marginTop: 4 }}>Password updated.</p>
          )}
        </>
      )}

      <hr className="gb-divider" style={{ margin: 'var(--space-2) 0' }} />

      <button
        type="button"
        onClick={() => setAccountOpen((o) => !o)}
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
            transform: accountOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 100ms',
            color: 'var(--text-muted)'
          }}
        >
          <ChevronRightIcon />
        </span>
        <h3 style={{ fontSize: 14, margin: 0 }}>Account</h3>
      </button>
      {accountOpen && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <span style={{ fontSize: 13 }}>Remember this account</span>
            <Button variant="secondary" onClick={toggleRemembered}>
              {remembered ? 'Forget' : 'Remember'}
            </Button>
          </div>

          <Button variant="secondary" onClick={signOut} disabled={signingOut} style={{ width: '100%' }}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </>
      )}

      <hr className="gb-divider" style={{ margin: 'var(--space-2) 0' }} />

      <button
        type="button"
        onClick={() => {
          setVaultOpen((o) => {
            const next = !o
            if (next && vaultPath === undefined) void loadVaultPath()
            return next
          })
        }}
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
            transform: vaultOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 100ms',
            color: 'var(--text-muted)'
          }}
        >
          <ChevronRightIcon />
        </span>
        <h3 style={{ fontSize: 14, margin: 0 }}>Notes Folder</h3>
      </button>
      {vaultOpen && (
        <>
          {vaultPath ? (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: 'var(--space-2)' }}>
                Your campaigns are stored as real files in:
                <br />
                <span style={{ color: 'var(--text-primary)' }}>{vaultPath}</span>
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                Each campaign gets its own folder — notes are plain .md files you can open, copy, or share directly.
              </p>
            </>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
              Campaigns currently live in NoteGoblin's internal storage. Choose a folder to store them as real files
              instead — your existing campaigns will be copied over automatically (nothing is deleted).
            </p>
          )}
          <Button variant="secondary" onClick={chooseVaultFolder} disabled={vaultBusy} style={{ width: '100%' }}>
            {vaultBusy ? 'Migrating…' : vaultPath ? 'Choose a different folder…' : 'Choose folder…'}
          </Button>
          {vaultError && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{vaultError}</p>}
          {vaultMigrated && (
            <p style={{ color: 'var(--success)', fontSize: 12, marginTop: 4 }}>
              Copied {vaultMigrated.campaigns} campaign{vaultMigrated.campaigns === 1 ? '' : 's'},{' '}
              {vaultMigrated.notes} note{vaultMigrated.notes === 1 ? '' : 's'}, and {vaultMigrated.folders} folder
              {vaultMigrated.folders === 1 ? '' : 's'}.
            </p>
          )}
        </>
      )}

      {identity.displayName.trim().toLowerCase() === 'kyonk' && (
        <>
          <hr className="gb-divider" style={{ margin: 'var(--space-2) 0' }} />

          <button
            type="button"
            onClick={() => {
              setAdminOpen((o) => {
                const next = !o
                if (next && adminAccounts === null) void loadAdminAccounts()
                return next
              })
            }}
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
                transform: adminOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 100ms',
                color: 'var(--text-muted)'
              }}
            >
              <ChevronRightIcon />
            </span>
            <h3 style={{ fontSize: 14, margin: 0 }}>Relay admin</h3>
          </button>
          {adminOpen && (
            <>
              {adminAccounts === null ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                  {adminAccounts.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No accounts.</p>
                  ) : (
                    adminAccounts.map((account) => (
                      <div
                        key={account.userId}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {account.username}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {account.friendCount} friend{account.friendCount === 1 ? '' : 's'}
                            {account.incomingRequestCount > 0 && ` · ${account.incomingRequestCount} incoming`}
                            {account.outgoingRequestCount > 0 && ` · ${account.outgoingRequestCount} outgoing`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAdminAccount(account)}
                          disabled={adminBusyId === account.userId}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--danger)',
                            fontSize: 11,
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                        >
                          {adminBusyId === account.userId ? '…' : 'Delete'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
              {adminError && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{adminError}</p>}
            </>
          )}
        </>
      )}
    </div>
  )
}
