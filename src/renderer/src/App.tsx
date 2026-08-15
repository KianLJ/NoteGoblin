import { useEffect, useState } from 'react'
import { LoginScreen } from './features/auth/LoginScreen'
import { onIdentitySwitched } from './features/auth/identityEvents'
import { AppShell } from './features/shell/AppShell'
import type { Identity } from '@shared/ipc'

function App(): JSX.Element {
  const [identity, setIdentity] = useState<Identity | null>(null)

  useEffect(() => onIdentitySwitched(setIdentity), [])

  if (!identity) {
    return <LoginScreen onAuthenticated={setIdentity} />
  }

  // Keyed by identity.id so switching accounts remounts AppShell from
  // scratch — otherwise the previous identity's open campaign, connected
  // host, etc. would still be sitting in AppShell's state.
  return <AppShell key={identity.id} displayName={identity.displayName} />
}

export default App
