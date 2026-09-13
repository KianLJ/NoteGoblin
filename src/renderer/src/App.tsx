import { useEffect, useState, type ReactNode } from 'react'
import { LoginScreen } from './features/auth/LoginScreen'
import { onIdentitySwitched } from './features/auth/identityEvents'
import { AppShell } from './features/shell/AppShell'
import { applyThemePrefs, collectThemePrefs, type ThemePrefs } from './theme'
import type { Identity } from '@shared/ipc'

function App(): JSX.Element {
  const [identity, setIdentity] = useState<Identity | null>(null)

  useEffect(() => onIdentitySwitched(setIdentity), [])

  // Shortly after any login/create/switch that reached the relay, the main
  // process checks whether this account already has saved appearance
  // settings — see relaySync.ts's pullAndSendPrefs. If it does (saved from
  // another device), apply them here. If not — a brand new account, or an
  // existing one no device has pushed to yet — push this device's current
  // settings up instead, so the account gets seeded by whichever device
  // happens to log in first rather than staying empty forever.
  useEffect(
    () =>
      window.goblin.identity.onPrefsChecked((prefs) => {
        if (prefs) applyThemePrefs(prefs as ThemePrefs)
        else void window.goblin.identity.pushPrefs(collectThemePrefs())
      }),
    []
  )

  return (
    <ScaledApp>
      {!identity ? (
        <LoginScreen onAuthenticated={setIdentity} />
      ) : (
        // Keyed by identity.id so switching accounts remounts AppShell from
        // scratch — otherwise the previous identity's open campaign,
        // connected host, etc. would still be sitting in AppShell's state.
        <AppShell key={identity.id} displayName={identity.displayName} />
      )}
    </ScaledApp>
  )
}

/**
 * Applies the font-size setting (theme.ts's applyFontScale/--font-scale) to
 * the whole app via a single `transform: scale()` — see applyFontScale's own
 * doc comment for why this, and not either flavor of browser zoom. The
 * width/height compensate for the transform (dividing by the same factor it
 * multiplies by) so this box's *rendered* size still lands on exactly
 * #root's real size — everything inside it can then use ordinary
 * percentage/vh sizing without knowing scaling is happening at all, except
 * for the small set of places that read raw MouseEvent client coordinates
 * (context menus, the hover tooltip, drag-resize handles), which divide by
 * getStoredFontScale() themselves since real screen pixels and this box's
 * local coordinate system no longer match once scale isn't 1.
 */
function ScaledApp({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        width: 'calc(100% / var(--font-scale, 1))',
        height: 'calc(100% / var(--font-scale, 1))',
        transform: 'scale(var(--font-scale, 1))',
        transformOrigin: 'top left'
      }}
    >
      {children}
    </div>
  )
}

export default App
