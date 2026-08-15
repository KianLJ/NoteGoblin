import { useState } from 'react'
import { LoginScreen } from './features/auth/LoginScreen'
import { AppShell } from './features/shell/AppShell'
import type { Identity } from '@shared/ipc'

function App(): JSX.Element {
  const [identity, setIdentity] = useState<Identity | null>(null)

  if (!identity) {
    return <LoginScreen onAuthenticated={setIdentity} />
  }

  return <AppShell displayName={identity.displayName} />
}

export default App
