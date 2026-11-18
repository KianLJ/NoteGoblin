import { useEffect, useState } from 'react'
import { pushState, turnPushOff, turnPushOn, type PushState } from '../push'
import { listCampaigns, listCharacters } from '../api'
import { useLoad } from '../data'
import { href } from '../route'
import { Status } from './Status'

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(minutes)) return ''
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days < 30 ? `${days} d ago` : new Date(iso).toLocaleDateString()
}

export function HomeView({ username, setTitle }: { username: string | null; setTitle: (title: string) => void }): JSX.Element {
  useEffect(() => setTitle('NoteGoblin'), [setTitle])
  const characters = useLoad('characters', listCharacters)
  const campaigns = useLoad('campaigns', listCampaigns)

  return (
    <div className="v-stack">
      {username && <p className="v-hello">Signed in as {username}</p>}
      <PushSwitch />

      <section>
        <h2 className="v-section-title">Characters</h2>
        <Status error={characters.error} loading={!characters.data} onRetry={characters.reload} />
        {characters.data?.length === 0 && (
          <p className="v-empty">No characters yet. Open NoteGoblin on your computer while logged in and your sheets will appear here.</p>
        )}
        <div className="v-list">
          {characters.data?.map((c) => (
            <a key={c.id} className="v-row" href={href({ view: 'character', characterId: c.id })}>
              <span className="v-row-main">
                <span className="v-row-title">{c.name || 'Unnamed character'}</span>
                {c.subtitle && <span className="v-row-sub">{c.subtitle}</span>}
              </span>
              <span className="v-row-meta">{ago(c.updatedAt)}</span>
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 className="v-section-title">Campaigns you run</h2>
        <Status error={campaigns.error} loading={!campaigns.data} onRetry={campaigns.reload} />
        {campaigns.data?.length === 0 && <p className="v-empty">No synced campaigns yet. Campaigns you DM sync here from the desktop app.</p>}
        <div className="v-list">
          {campaigns.data
            ?.slice()
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((c) => (
              <a key={c.campaignId} className="v-row" href={href({ view: 'campaign', campaignId: c.campaignId })}>
                <span className="v-row-main">
                  <span className="v-row-title">{c.name}</span>
                </span>
                <span className="v-row-meta">{ago(c.updatedAt)}</span>
              </a>
            ))}
        </div>
      </section>
    </div>
  )
}

/** Notifications on this phone: friend requests, invites, messages and the session planner, even with the app closed. */
function PushSwitch(): JSX.Element | null {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void pushState().then(setState, () => setState('unsupported'))
  }, [])
  if (!state || state === 'unsupported') return null
  async function flip(on: boolean): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setState(await (on ? turnPushOn() : turnPushOff()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="v-push">
      <div className="v-push-text">
        <span className="v-row-title">Notifications</span>
        <span className="v-row-sub">
          {state === 'on' && 'On for this phone: friend requests, invites, messages and session plans.'}
          {state === 'off' && 'Get friend requests, invites, messages and session plans here, even with NoteGoblin closed.'}
          {state === 'blocked' && 'Blocked for this site. Allow notifications in your browser’s settings, then come back.'}
          {state === 'add-to-home' && 'On iPhone, tap Share, then Add to Home Screen, and open NoteGoblin from there to turn them on.'}
        </span>
        {error && <span className="v-error">{error}</span>}
      </div>
      {(state === 'on' || state === 'off') && (
        <button type="button" className={state === 'on' ? 'gb-btn' : 'gb-btn gb-btn--primary'} disabled={busy} onClick={() => void flip(state === 'off')}>
          {state === 'on' ? 'Turn off' : 'Turn on'}
        </button>
      )}
    </section>
  )
}
