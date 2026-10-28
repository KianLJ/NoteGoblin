import { useState, type FormEvent } from 'react'
import { logIn } from '../api'

export function LoginView({ onSignedIn }: { onSignedIn: () => void }): JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await logIn(username.trim(), password)
      onSignedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="v-login">
      <form className="v-login-card" onSubmit={submit}>
        <img src="icon-192.png" alt="" width={64} height={64} />
        <h1>NoteGoblin</h1>
        <p>Your notes and character sheets, read-only, wherever you are. Log in with the same name and password as the desktop app.</p>
        <label className="gb-label" htmlFor="v-username">
          Display name
        </label>
        <input
          id="v-username"
          className="gb-input"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label className="gb-label" htmlFor="v-password">
          Password
        </label>
        <input
          id="v-password"
          className="gb-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="v-error">{error}</p>}
        <button type="submit" className="gb-btn gb-btn--primary" disabled={busy || !username.trim() || !password}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
