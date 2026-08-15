import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { GearIcon } from './icons'
import type { Identity } from '@shared/ipc'

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
    <div ref={containerRef} style={{ position: 'relative' }}>
      {open && (
        <div
          className="gb-card"
          style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: 300 }}
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

  if (!identity) {
    return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
  }

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 var(--space-2)' }}>Account</h3>

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
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>
        This only renames your identity on this device — hosts you've already joined under the old
        name won't follow automatically.
      </p>

      <hr className="gb-divider" style={{ margin: 'var(--space-2) 0' }} />

      <h3 style={{ fontSize: 14, margin: '0 0 var(--space-2)' }}>Change password</h3>
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

      <hr className="gb-divider" style={{ margin: 'var(--space-2) 0' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13 }}>Remember this login</span>
        <Button variant="secondary" onClick={toggleRemembered}>
          {remembered ? 'Forget' : 'Remember'}
        </Button>
      </div>
    </div>
  )
}
