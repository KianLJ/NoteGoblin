import { createElement, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CanvasZoomContext } from '../canvas/canvasZoom'
import { addressToUrl, browserPartition } from '@shared/browser'
import { ArrowLeftIcon, ArrowRightIcon, XIcon } from '../../ui/icons'
import { activate, awakeTabs, closeTab, openTab, readTabs, updateTab, type BrowserTab, type TabSet } from './browserTabs'
import { requestBrowserWindow, takeFirstPage, useBrowserAccount } from './browserAccount'
import { GoblinLoader } from '../../ui/GoblinLoader'
import './browser.css'

/**
 * The Browser box: the web on the canvas, beside your notes — a rules page, a map, a generator. Tabs (a link that
 * opens a new window opens a new tab), an address bar that also searches, back / forward / reload, a star to keep a
 * page, and a start page of the kept ones. Pages run apart from the app (src/main/webBrowser.ts), signed in to
 * nothing of it. Each NoteGoblin account has its own: its logins (a browsing session of its own), its tabs, kept
 * pages and zoom, remembered on this computer.
 *
 * Kept light: only the few most recently looked-at tabs have a live page (browserTabs.ts's awakeTabs) — the rest
 * sleep, and wake on the page and spot they were at; while the canvas zooms, the page is a still of itself.
 */

interface Bookmark {
  title: string
  url: string
}

// Each with ':' and the account after it.
const TABS = 'gb-browser-tabs'
const LAST = 'gb-browser-last'
const BOOKMARKS = 'gb-browser-bookmarks'
const ZOOM = 'gb-browser-zoom'

/** Your zoom on the page, in a browser's own steps. */
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

function stepZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? ZOOM_STEPS[0]
}

/** To start with — a few a table reaches for. Removable like any other. */
const STARTER_BOOKMARKS: Bookmark[] = [
  { title: 'D&D Beyond', url: 'https://www.dndbeyond.com/' },
  { title: '5e SRD', url: 'https://www.5esrd.com/' },
  { title: 'Kobold Fight Club', url: 'https://koboldplus.club/' },
  { title: 'donjon generators', url: 'https://donjon.bin.sh/' },
  { title: 'Azgaar’s map maker', url: 'https://azgaar.github.io/Fantasy-Map-Generator/' }
]

function readJson<T>(key: string, fallback: T): T {
  try {
    // An account's own, or what this computer kept before browsing was per account.
    const raw = localStorage.getItem(key) ?? localStorage.getItem(key.split(':')[0])
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* not remembered */
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** The bits of Electron's <webview> element this uses. */
interface WebviewElement extends HTMLElement {
  loadURL: (url: string) => Promise<void>
  getURL: () => string
  canGoBack: () => boolean
  canGoForward: () => boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  stop: () => void
  setZoomFactor: (factor: number) => void
  getWebContentsId: () => number
  executeJavaScript: (code: string) => Promise<unknown>
  capturePage: () => Promise<{ toDataURL: () => string; isEmpty: () => boolean }>
}

/** What the bar shows of a tab's live page. */
interface LiveState {
  loading: boolean
  failed: string | null
  back: boolean
  forward: boolean
  unsupported: boolean
}

const IDLE: LiveState = { loading: false, failed: null, back: false, forward: false, unsupported: false }

/** What the bar does to a tab's page. */
interface PageHandle {
  go: (url: string) => void
  back: () => void
  forward: () => void
  reload: () => void
  stop: () => void
  pageId: () => number | null
}

/**
 * Where each tab's page was, kept while the app runs: a sleeping tab wakes there, and so does a box that moved
 * (pinning or unpinning it gives the page a new place in the window, which a web page can only take by loading again).
 */
const lastSpot = new Map<string, { url: string; x: number; y: number }>()

/**
 * A Browser box for whoever's signed in: each account its own logins, tabs and zoom. The dock's Browser has no
 * `windowId`; each further one on the canvas (Add ▸ Browser window, or "new window") has its own, and its own tabs.
 */
export function BrowserPanel({ windowId }: { windowId?: string }): JSX.Element {
  const accountId = useBrowserAccount()
  const partition = browserPartition(accountId)
  // A page's session can't change once it's open, so another account gets a box of its own.
  return <AccountBrowser key={partition} partition={partition} account={accountId ?? 'guest'} windowId={windowId} />
}

const tabsKey = (account: string, windowId?: string): string => (windowId ? `${TABS}:${account}:${windowId}` : `${TABS}:${account}`)

/** Forgets a closed Browser box's tabs (every account's). */
export function forgetBrowserWindow(windowId: string): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(`${TABS}:`) && key.endsWith(`:${windowId}`)) localStorage.removeItem(key)
  } catch {
    /* nothing kept */
  }
}

function AccountBrowser({ partition, account, windowId }: { partition: string; account: string; windowId?: string }): JSX.Element {
  const TABS_KEY = tabsKey(account, windowId)
  const BOOKMARKS_KEY = `${BOOKMARKS}:${account}`
  const ZOOM_KEY = `${ZOOM}:${account}`

  const [set, setSet] = useState<TabSet>(() => {
    if (!windowId) return readTabs(readJson(TABS_KEY, null), readJson<string>(`${LAST}:${account}`, ''))
    // A further window: its own tabs only — a new one starts on the page it was opened for, or the start page.
    let saved: unknown = null
    try {
      saved = JSON.parse(localStorage.getItem(TABS_KEY) ?? 'null')
    } catch {
      /* fresh */
    }
    return readTabs(saved, takeFirstPage(windowId) ?? '')
  })
  useEffect(() => writeJson(TABS_KEY, { tabs: set.tabs, active: set.active }), [set.tabs, set.active, TABS_KEY])
  const tab = set.tabs.find((t) => t.id === set.active) ?? set.tabs[0]
  const awake = awakeTabs(set)

  const handles = useRef(new Map<string, PageHandle>())
  const [live, setLive] = useState<Record<string, LiveState>>({})
  const state = live[tab.id] ?? IDLE
  const handle = (): PageHandle | undefined => handles.current.get(tab.id)

  const [typed, setTyped] = useState('')
  const [editing, setEditing] = useState(false)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => readJson(BOOKMARKS_KEY, STARTER_BOOKMARKS))
  const saveBookmarks = (next: Bookmark[]): void => {
    setBookmarks(next)
    writeJson(BOOKMARKS_KEY, next)
  }
  const kept = bookmarks.some((b) => b.url === tab.url)

  // The page is laid out at the box's own size and zoomed with the canvas, like everything else on it — so zooming
  // the canvas never changes its layout. Your own zoom (Ctrl+scroll, Ctrl + / -) goes on top, remembered here.
  const { zoom: canvasZoom, zooming } = useContext(CanvasZoomContext)
  const [pageZoom, setPageZoom] = useState(() => {
    const z = readJson<number>(ZOOM_KEY, 1)
    return typeof z === 'number' && z >= ZOOM_STEPS[0] && z <= ZOOM_STEPS[ZOOM_STEPS.length - 1] ? z : 1
  })
  const zoomTo = (z: number): void => {
    setPageZoom(z)
    writeJson(ZOOM_KEY, z)
  }

  // Which of this box's tabs a page is (from the main process, by its web contents id).
  const tabOfPage = (pageId: number): string | null => {
    for (const [id, h] of handles.current) if (h.pageId() === pageId) return id
    return null
  }
  const lastZoomStep = useRef(0)
  useEffect(
    () =>
      window.goblin.browser.onZoom((pageId, step) => {
        if (!tabOfPage(pageId)) return
        // One step per notch: a wheel notch can arrive as two asks at once. Short enough not to slow a quick scroll.
        const now = performance.now()
        if (step !== 'reset' && now - lastZoomStep.current < 40) return
        lastZoomStep.current = now
        setPageZoom((z) => {
          const next = step === 'reset' ? 1 : stepZoom(z, step === 'in' ? 1 : -1)
          writeJson(ZOOM_KEY, next)
          return next
        })
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  // A link that opens a new window, from one of this box's pages: a new tab.
  useEffect(
    () =>
      window.goblin.browser.onOpenTab((pageId, url) => {
        if (tabOfPage(pageId)) setSet((s) => openTab(s, url))
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const onLive = useCallback((id: string, next: LiveState) => setLive((all) => ({ ...all, [id]: next })), [])
  const onPage = useCallback((id: string, patch: Partial<Omit<BrowserTab, 'id'>>) => setSet((s) => updateTab(s, id, patch)), [])

  function go(target: string): void {
    const next = addressToUrl(target)
    if (!next) return
    setEditing(false)
    setTyped(next)
    setSet((s) => updateTab(s, tab.id, { url: next }))
    handle()?.go(next)
  }

  function home(): void {
    handle()?.stop()
    setSet((s) => updateTab(s, tab.id, { url: '', title: '' }))
    setTyped('')
  }

  function close(id: string): void {
    handles.current.delete(id)
    lastSpot.delete(`${partition}:${id}`)
    setSet((s) => closeTab(s, id))
  }

  const showing = !!tab.url
  return (
    <div className="gb-browser">
      <div className="gb-browser-tabs" role="tablist" aria-label="Tabs">
        {set.tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            tabIndex={0}
            aria-selected={t.id === tab.id}
            className={`gb-browser-tab${t.id === tab.id ? ' gb-browser-tab--on' : ''}${awake.has(t.id) ? '' : ' gb-browser-tab--asleep'}`}
            title={t.url ? `${t.title || hostOf(t.url)}\n${t.url}` : 'Start page'}
            onClick={() => setSet((s) => activate(s, t.id))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setSet((s) => activate(s, t.id))
              } else if (e.key === 'Delete') close(t.id)
            }}
            // Middle-click closes, as in a browser.
            onAuxClick={(e) => {
              if (e.button === 1) close(t.id)
            }}
          >
            <span className="gb-browser-tab-badge" aria-hidden="true">
              {live[t.id]?.loading ? <span className="gb-browser-tab-spin" /> : (t.title || hostOf(t.url) || '★').slice(0, 1).toUpperCase()}
            </span>
            <span className="gb-browser-tab-title">{t.url ? t.title || hostOf(t.url) : 'New tab'}</span>
            <button
              type="button"
              className="gb-browser-tab-close"
              aria-label={`Close ${t.title || 'tab'}`}
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                close(t.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="gb-browser-tab-new" onClick={() => setSet((s) => openTab(s))} title="New tab" aria-label="New tab">
          +
        </button>
        <button
          type="button"
          className="gb-browser-tab-new gb-browser-window-new"
          onClick={(e) => requestBrowserWindow(e.currentTarget)}
          title="New browser window — another box on the canvas"
          aria-label="New browser window"
        >
          <NewWindowGlyph />
        </button>
      </div>

      <form
        className="gb-browser-bar"
        onSubmit={(e) => {
          e.preventDefault()
          go(typed)
        }}
      >
        <button type="button" className="gb-browser-btn" disabled={!showing || !state.back} onClick={() => handle()?.back()} title="Back" aria-label="Back">
          <ArrowLeftIcon size={13} />
        </button>
        <button type="button" className="gb-browser-btn" disabled={!showing || !state.forward} onClick={() => handle()?.forward()} title="Forward" aria-label="Forward">
          <ArrowRightIcon size={13} />
        </button>
        <button
          type="button"
          className="gb-browser-btn"
          disabled={!showing}
          onClick={() => (state.loading ? handle()?.stop() : handle()?.reload())}
          title={state.loading ? 'Stop' : 'Reload'}
          aria-label={state.loading ? 'Stop' : 'Reload'}
        >
          {state.loading ? <XIcon size={12} /> : <ReloadGlyph />}
        </button>
        <button type="button" className="gb-browser-btn" onClick={home} title="Start page" aria-label="Start page">
          <HomeGlyph />
        </button>
        <input
          className="gb-browser-address"
          value={editing ? typed : showing ? hostOf(tab.url) + (tab.title ? ` — ${tab.title}` : '') : ''}
          placeholder="Search, or type a web address"
          aria-label="Search, or type a web address"
          spellCheck={false}
          onFocus={(e) => {
            setEditing(true)
            setTyped(tab.url)
            requestAnimationFrame(() => e.target.select())
          }}
          onBlur={() => setEditing(false)}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
          }}
        />
        {pageZoom !== 1 && (
          <button type="button" className="gb-browser-zoom" onClick={() => zoomTo(1)} title="Back to 100% (Ctrl+0)">
            {Math.round(pageZoom * 100)}%
          </button>
        )}
        <button
          type="button"
          className={`gb-browser-btn gb-browser-star${kept ? ' gb-browser-star--on' : ''}`}
          disabled={!showing}
          aria-pressed={kept}
          onClick={() => saveBookmarks(kept ? bookmarks.filter((b) => b.url !== tab.url) : [...bookmarks, { title: tab.title || hostOf(tab.url), url: tab.url }])}
          title={kept ? 'Kept — click to forget it' : 'Keep this page on the start page'}
          aria-label="Keep this page"
        >
          <StarGlyph filled={kept} />
        </button>
        {state.loading && <span className="gb-browser-progress" aria-hidden="true" />}
      </form>

      <div className="gb-browser-page">
        {set.tabs
          .filter((t) => awake.has(t.id))
          .map((t) => (
            <PageView
              key={t.id}
              tab={t}
              partition={partition}
              active={t.id === tab.id}
              factor={canvasZoom * pageZoom}
              zooming={zooming}
              onLive={onLive}
              onPage={onPage}
              register={(h) => (h ? handles.current.set(t.id, h) : handles.current.delete(t.id))}
            />
          ))}
        {!showing && (
          <div className="gb-browser-start">
            <span className="gb-browser-start-head">Kept pages</span>
            {bookmarks.length === 0 ? (
              <p className="gb-browser-start-empty">Pages you keep with the star show up here.</p>
            ) : (
              <ul className="gb-browser-kept">
                {bookmarks.map((b) => (
                  <li key={b.url}>
                    <button type="button" className="gb-browser-kept-open" onClick={() => go(b.url)} title={b.url}>
                      <span className="gb-browser-kept-badge" aria-hidden="true">
                        {(b.title || hostOf(b.url)).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="gb-browser-kept-text">
                        <span className="gb-browser-kept-title">{b.title || hostOf(b.url)}</span>
                        <span className="gb-browser-kept-host">{hostOf(b.url)}</span>
                      </span>
                    </button>
                    <button type="button" className="gb-browser-kept-remove" onClick={() => saveBookmarks(bookmarks.filter((x) => x.url !== b.url))} aria-label={`Forget ${b.title}`} title="Forget it">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * One tab's live page. Shown only while its tab is; kept loaded behind the others while it's one of the few most
 * recently looked at (and unmounted to sleep after that — it wakes on the page and spot it was at).
 */
function PageView({
  tab,
  partition,
  active,
  factor,
  zooming,
  onLive,
  onPage,
  register
}: {
  tab: BrowserTab
  partition: string
  active: boolean
  factor: number
  zooming: boolean
  onLive: (id: string, state: LiveState) => void
  onPage: (id: string, patch: Partial<Omit<BrowserTab, 'id'>>) => void
  register: (handle: PageHandle | null) => void
}): JSX.Element {
  const spotKey = `${partition}:${tab.id}`
  // Where it was (after sleeping, or the box moving), else the tab's page. Read once: later pages go by loadURL.
  const [startUrl] = useState(() => lastSpot.get(spotKey)?.url ?? tab.url)
  const restoreSpot = useRef(lastSpot.get(spotKey) ?? null)
  const view = useRef<WebviewElement | null>(null)
  const ready = useRef(false)
  const queued = useRef<string | null>(null)
  const [state, setState] = useState<LiveState>(IDLE)
  // A new page has arrived but isn't drawn yet (it's blank until then): the goblin shows instead.
  const [drawn, setDrawn] = useState(false)
  const patchState = (patch: Partial<LiveState>): void => setState((s) => ({ ...s, ...patch }))
  useEffect(() => onLive(tab.id, state), [state, tab.id, onLive])
  // Asleep (or closed), it isn't loading anything.
  useEffect(() => () => onLive(tab.id, IDLE), [tab.id, onLive])

  const factorRef = useRef(factor)
  factorRef.current = factor
  const applyZoom = (): void => {
    const el = view.current
    if (el && ready.current && typeof el.setZoomFactor === 'function') el.setZoomFactor(factorRef.current)
  }
  // Before the canvas's new zoom is painted, so the page doesn't show a frame at the old one.
  useLayoutEffect(applyZoom, [factor])

  // While the canvas zooms, the page is swapped for a still of it: a live page redrawn at every step of a zoom
  // slows the whole canvas down. The still is taken whenever the page settles (it's loaded, or the mouse leaves it).
  const [still, setStill] = useState<string | null>(null)
  const stillTimer = useRef<ReturnType<typeof setTimeout>>()
  const takeStillSoon = (): void => {
    clearTimeout(stillTimer.current)
    stillTimer.current = setTimeout(() => {
      const el = view.current
      if (!el || !ready.current || typeof el.capturePage !== 'function') return
      void el
        .capturePage()
        .then((img) => {
          if (!img.isEmpty()) setStill(img.toDataURL())
        })
        .catch(() => {})
    }, 400)
  }
  useEffect(() => () => clearTimeout(stillTimer.current), [])

  useEffect(() => {
    const el = view.current
    if (el && typeof el.loadURL !== 'function') patchState({ unsupported: true })
    register({
      go: (url) => {
        if (el && ready.current) void el.loadURL(url).catch(() => {})
        else queued.current = url
      },
      back: () => el?.goBack(),
      forward: () => el?.goForward(),
      reload: () => el?.reload(),
      stop: () => el?.stop(),
      pageId: () => (el && ready.current ? el.getWebContentsId() : null)
    })
    return () => register(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Where on the page you are, every moment or two while it's showing — for waking it there later.
  useEffect(() => {
    if (!active || !tab.url) return
    const t = setInterval(() => {
      const el = view.current
      if (!el || !ready.current || zooming) return
      void el
        .executeJavaScript('[location.href, scrollX, scrollY]')
        .then((r) => {
          const [href, x, y] = Array.isArray(r) ? r : []
          if (typeof href === 'string' && typeof x === 'number' && typeof y === 'number') lastSpot.set(spotKey, { url: href, x, y })
        })
        .catch(() => {})
    }, 1500)
    return () => clearInterval(t)
  }, [active, tab.url, zooming, spotKey])

  // The page's own events: where it went, its title, loading, and back / forward.
  useEffect(() => {
    const el = view.current
    if (!el) return
    const sync = (): void => {
      if (!ready.current) return
      applyZoom()
      const now = el.getURL()
      if (now && now !== 'about:blank') onPage(tab.id, { url: now })
      patchState({ back: el.canGoBack(), forward: el.canGoForward() })
    }
    const onReady = (): void => {
      ready.current = true
      applyZoom()
      if (queued.current) {
        void el.loadURL(queued.current).catch(() => {})
        queued.current = null
      }
    }
    const onTitle = (e: Event): void => onPage(tab.id, { title: (e as Event & { title: string }).title })
    const onStart = (): void => patchState({ loading: true, failed: null })
    const onStop = (): void => {
      patchState({ loading: false })
      sync()
      takeStillSoon()
      // Back where it was before it slept or the box moved — once, and only on that same page; again a moment
      // later, as a page still filling in may not reach that far yet.
      const spot = restoreSpot.current
      if (spot && el.getURL() === spot.url) {
        restoreSpot.current = null
        const back = (): void => void el.executeJavaScript(`scrollTo(${Math.round(spot.x)}, ${Math.round(spot.y)})`).catch(() => {})
        back()
        setTimeout(back, 900)
      }
    }
    const onFail = (e: Event): void => {
      const f = e as Event & { errorCode: number; errorDescription: string; isMainFrame: boolean }
      // -3 is a navigation that was replaced by another one: not a failure.
      if (f.isMainFrame && f.errorCode !== -3) patchState({ failed: f.errorDescription || 'The page didn’t load.' })
    }
    const onNewPage = (): void => setDrawn(false)
    const onDrawn = (): void => setDrawn(true)
    el.addEventListener('dom-ready', onReady)
    el.addEventListener('dom-ready', onDrawn)
    el.addEventListener('did-navigate', onNewPage)
    el.addEventListener('did-navigate', sync)
    el.addEventListener('did-navigate-in-page', sync)
    el.addEventListener('page-title-updated', onTitle)
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-fail-load', onFail)
    return () => {
      el.removeEventListener('dom-ready', onReady)
      el.removeEventListener('dom-ready', onDrawn)
      el.removeEventListener('did-navigate', onNewPage)
      el.removeEventListener('did-navigate', sync)
      el.removeEventListener('did-navigate-in-page', sync)
      el.removeEventListener('page-title-updated', onTitle)
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('did-fail-load', onFail)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  const frozen = active && zooming && !!still
  const visible = active && !!tab.url && !state.failed && !state.unsupported && !frozen
  return (
    <div className="gb-browser-pageview" style={active ? undefined : { visibility: 'hidden' }} onPointerLeave={takeStillSoon}>
      {createElement('webview', {
        ref: view,
        partition,
        // Lets a page ask for a new window — which main always refuses, opening it as a tab here instead.
        allowpopups: 'true',
        src: startUrl || 'about:blank',
        className: 'gb-browser-view',
        style: { visibility: visible ? 'visible' : 'hidden' }
      })}
      {frozen && tab.url && <img className="gb-browser-still" src={still!} alt="" draggable={false} />}
      {active && tab.url && !drawn && !state.failed && !state.unsupported && (
        <div className="gb-browser-loading">
          <GoblinLoader label={`Opening ${hostOf(tab.url)}`} />
        </div>
      )}
      {active && tab.url && state.unsupported && (
        <div className="gb-browser-failed" role="alert">
          <strong>Restart NoteGoblin to browse</strong>
          <span>The Browser box needs the app to be closed and opened again once after updating.</span>
        </div>
      )}
      {active && tab.url && !state.unsupported && state.failed && (
        <div className="gb-browser-failed" role="alert">
          <strong>That page didn’t load</strong>
          <span>{state.failed}</span>
          <button type="button" onClick={() => view.current?.reload()}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

function NewWindowGlyph(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="4.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 2.5h7a1 1 0 0 1 1 1v7M7 9h0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function ReloadGlyph(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HomeGlyph(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 7.5 8 3l5.5 4.5M4 6.5V13h3v-3.5h2V13h3V6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StarGlyph({ filled }: { filled: boolean }): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} aria-hidden="true">
      <path d="M8 1.8l1.8 4 4.3.4-3.3 2.9 1 4.2L8 11.1l-3.8 2.2 1-4.2-3.3-2.9 4.3-.4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

/** The dock's icon: a globe. */
export function BrowserIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 8h12M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14M8 2C6.2 3.7 5.4 5.7 5.4 8s.8 4.3 2.6 6" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}
