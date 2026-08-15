import { FormEvent, useEffect, useState } from 'react'
import { Button } from '../../ui/Button'
import { Mark } from '../../ui/Mark'
import type { Identity } from '@shared/ipc'

interface LoginScreenProps {
  onAuthenticated: (identity: Identity) => void
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps): JSX.Element {
  const [returning, setReturning] = useState<boolean | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    window.goblin.identity.hasAny().then(setReturning)
  }, [])

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)

    if (returning) {
      setSubmitting(true)
      const result = await window.goblin.identity.login(username, password)
      setSubmitting(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onAuthenticated(result.identity)
      return
    }

    if (username.trim().length < 2) {
      setError('Pick a display name with at least 2 characters.')
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
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onAuthenticated(result.identity)
  }

  if (returning === null) {
    return <div style={{ minHeight: '100vh' }} />
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)'
      }}
    >
      <form onSubmit={handleSubmit} className="gb-card" style={{ maxWidth: 380, width: '100%' }}>
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
          style={{ marginBottom: returning ? 'var(--space-4)' : 'var(--space-3)' }}
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
              style={{ marginBottom: 'var(--space-4)' }}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </>
        )}

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? 'Please wait…' : returning ? 'Log in' : 'Create identity'}
        </Button>
      </form>
    </div>
  )
}
