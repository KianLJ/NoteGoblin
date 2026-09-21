import { useEffect, useState, type ReactNode } from 'react'
import { LoginScreen } from './features/auth/LoginScreen'
import { onIdentitySwitched } from './features/auth/identityEvents'
import { AppShell } from './features/shell/AppShell'
import {
  applyThemePrefs,
  collectThemePrefs,
  hasCustomThemePrefs,
  getThemeOwnerIdentityId,
  setThemeOwnerIdentityId,
  resetThemePrefs,
  type ThemePrefs
} from './theme'
import type { Identity } from '@shared/ipc'

function App(): JSX.Element {
  const [identity, setIdentity] = useState<Identity | null>(null)

  useEffect(() => onIdentitySwitched(setIdentity), [])

  // Shortly after any login/create/switch that reached the relay, the main
  // process checks whether this account already has saved appearance
  // settings — see relaySync.ts's pullAndSendPrefs. If it does (saved from
  // another device), apply them here. If not, and THIS device actually has
  // some explicit customization of its own, push it up to seed the account.
  // Critically, a device with no customization at all (a fresh install, a
  // throwaway test profile) must never push its resolved defaults just
  // because the relay came back empty — that would silently overwrite a
  // genuinely customized account with nothing the moment such a device
  // happens to log in first (see hasCustomThemePrefs's doc comment).
  //
  // hasCustomThemePrefs alone isn't enough to gate that push, though: every
  // theme/font key is one device-wide localStorage bucket, not namespaced
  // per identity (see THEME_OWNER_KEY's own doc comment) — so on a device
  // someone else already customized, switching to a second local identity
  // with no relay prefs of its own would otherwise see "yes, customized" and
  // push THEIR leftover colors up as if they belonged to this new account,
  // silently overwriting its real saved prefs with a stranger's. Only push
  // when this identity is the one THEME_OWNER_KEY says actually owns the
  // current local state (or nothing has claimed it yet, e.g. an existing
  // install from before this tracking existed). Otherwise this identity
  // isn't customized at all yet — reset to real defaults instead of
  // silently showing whoever used this device last, then claim ownership so
  // a genuine edit from here on gets attributed correctly.
  useEffect(() => {
    if (!identity) return
    return window.goblin.identity.onPrefsChecked((prefs) => {
      if (prefs) {
        applyThemePrefs(prefs as ThemePrefs)
        setThemeOwnerIdentityId(identity.id)
        return
      }
      const owner = getThemeOwnerIdentityId()
      if (hasCustomThemePrefs() && (owner === null || owner === identity.id)) {
        void window.goblin.identity.pushPrefs(collectThemePrefs())
      } else if (owner !== identity.id) {
        resetThemePrefs()
      }
      setThemeOwnerIdentityId(identity.id)
    })
  }, [identity])

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
