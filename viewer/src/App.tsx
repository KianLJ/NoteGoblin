import { useEffect, useState } from 'react'
import { applyThemePrefs, type ThemePrefs } from '@renderer/theme'
import { getPrefs, getUsername, isSignedIn, signOut } from './api'
import { SIGNED_OUT_EVENT, clearCache } from './data'
import { href, parentOf, useRoute } from './route'
import { LoginView } from './views/LoginView'
import { HomeView } from './views/HomeView'
import { CampaignView } from './views/CampaignView'
import { NoteView } from './views/NoteView'
import { CharacterView } from './views/CharacterView'
import { RollAnimationOverlay } from '@renderer/features/dice/RollAnimationOverlay'

export function App(): JSX.Element {
  const [signedIn, setSignedIn] = useState(isSignedIn)
  const [title, setTitle] = useState('NoteGoblin')
  const route = useRoute()
  const parent = parentOf(route)

  useEffect(() => {
    const onSignedOut = (): void => {
      clearCache()
      setSignedIn(false)
    }
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
  }, [])

  // Wear the same colours the account uses on the desktop — best effort, the defaults are fine without it.
  useEffect(() => {
    if (!signedIn) return
    getPrefs().then(
      ({ prefs }) => prefs && applyThemePrefs(prefs as ThemePrefs),
      () => undefined
    )
  }, [signedIn])

  useEffect(() => {
    document.title = title === 'NoteGoblin' ? title : `${title} · NoteGoblin`
  }, [title])

  if (!signedIn) return <LoginView onSignedIn={() => setSignedIn(true)} />

  return (
    <div className="v-app">
      <header className="v-topbar">
        {parent ? (
          <a className="v-back" href={href(parent)} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        ) : (
          <span className="v-back-spacer" />
        )}
        <h1 className="v-topbar-title">{title}</h1>
        {route.view === 'home' ? (
          <button
            type="button"
            className="v-signout"
            onClick={() => {
              signOut()
              clearCache()
              setSignedIn(false)
            }}
          >
            Log out
          </button>
        ) : (
          <span className="v-back-spacer" />
        )}
      </header>
      <main className="v-main">
        {route.view === 'home' && <HomeView username={getUsername()} setTitle={setTitle} />}
        {route.view === 'campaign' && <CampaignView campaignId={route.campaignId} setTitle={setTitle} />}
        {route.view === 'note' && <NoteView campaignId={route.campaignId} noteId={route.noteId} setTitle={setTitle} />}
        {route.view === 'character' && <CharacterView characterId={route.characterId} setTitle={setTitle} />}
      </main>
      <RollAnimationOverlay />
    </div>
  )
}
