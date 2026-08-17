import { FormEvent, useEffect, useState } from 'react'
import { Button } from '../../ui/Button'
import { Mark } from '../../ui/Mark'
import { WindowControls } from '../shell/WindowControls'
import type { Identity } from '@shared/ipc'

interface LoginScreenProps {
  onAuthenticated: (identity: Identity) => void
}

type Stage = 'checking' | 'returning' | 'create'

export function LoginScreen({ onAuthenticated }: LoginScreenProps): JSX.Element {
  const [stage, setStage] = useState<Stage>('checking')
  // Whether ANY local identity exists on this device — independent of
  // `stage`, since stage can be manually toggled to 'create' even when
  // accounts already exist, but there's no "back to login" to offer if none do.
  const [hasAnyAccounts, setHasAnyAccounts] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    ;(async () => {
      if (await window.goblin.identity.hasRemembered()) {
        const result = await window.goblin.identity.autoLogin()
        if (result.ok) {
          onAuthenticated(result.identity)
          return
        }
      }
      const hasAny = await window.goblin.identity.hasAny()
      setHasAnyAccounts(hasAny)
      setStage(hasAny ? 'returning' : 'create')
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })()
  }, [])

  function switchStage(next: Stage): void {
    setStage(next)
    setError(null)
    setPassword('')
    setConfirmPassword('')
  }

  async function applyRememberPreference(): Promise<void> {
    await window.goblin.identity.remember(rememberMe)
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)

    if (stage === 'returning') {
      setSubmitting(true)
      const result = await window.goblin.identity.login(username, password)
      if (result.ok) await applyRememberPreference()
      setSubmitting(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onAuthenticated(result.identity)
      return
    }

    if (username.trim().length < 3) {
      // Matches the relay's own minimum (see relaySync.ts) — your device
      // identity doubles as your relay/friends account, so a name too short
      // for the relay would otherwise silently leave friends unavailable.
      setError('Pick a display name with at least 3 characters.')
      return
    }
    if (password.length < 8) {
      setError('Your password should be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    const result = await window.goblin.identity.create(username, password)
    if (result.ok) await applyRememberPreference()
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onAuthenticated(result.identity)
  }

  if (stage === 'checking') {
    return (
      <div className="gb-drag" style={{ minHeight: '100vh' }}>
        <div style={{ position: 'absolute', top: 0, right: 0 }}>
          <WindowControls />
        </div>
      </div>
    )
  }

  const returning = stage === 'returning'

  return (
    <div
      className="gb-drag"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)'
      }}
    >
      <div style={{ position: 'absolute', top: 0, right: 0 }}>
        <WindowControls />
      </div>

      <form
        onSubmit={handleSubmit}
        className="gb-card gb-no-drag"
        style={{ maxWidth: 380, width: '100%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
          <Mark size={40} />
        </div>
        <h1 style={{ fontSize: 24, textAlign: 'center' }}>
          {returning ? 'Welcome back' : 'Create your NoteGoblin identity'}
        </h1>
        <p style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
          {returning
            ? 'Log in to reach your campaigns, notes, and characters.'
            : 'One identity, used everywhere — for the campaigns you run and the ones you join.'}
        </p>

        <label className="gb-label" htmlFor="username">
          Display name
        </label>
        <input
          id="username"
          className="gb-input"
          style={{ marginBottom: 'var(--space-3)' }}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        <label className="gb-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="gb-input"
          style={{ marginBottom: returning ? 'var(--space-3)' : 'var(--space-3)' }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={returning ? 'current-password' : 'new-password'}
        />

        {!returning && (
          <>
            <label className="gb-label" htmlFor="confirm-password">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              className="gb-input"
              style={{ marginBottom: 'var(--space-3)' }}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </>
        )}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            marginBottom: 'var(--space-4)',
            cursor: 'pointer'
          }}
        >
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          Remember me on this device
        </label>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? 'Please wait…' : returning ? 'Log in' : 'Create identity'}
        </Button>

        <p style={{ textAlign: 'center', marginTop: 'var(--space-3)', marginBottom: 0, fontSize: 13 }}>
          {returning ? (
            <button
              type="button"
              onClick={() => switchStage('create')}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}
            >
              Create a new identity instead
            </button>
          ) : (
            hasAnyAccounts && (
              <button
                type="button"
                onClick={() => switchStage('returning')}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}
              >
                Log in instead
              </button>
            )
          )}
        </p>
      </form>
    </div>
  )
}
