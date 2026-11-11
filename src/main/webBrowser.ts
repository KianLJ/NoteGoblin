import { app, session, type WebContents } from 'electron'
import { isBrowsableUrl, isBrowserPartition } from '@shared/browser'

/**
 * The Browser box's web pages (BrowserPanel.tsx shows them in a <webview>), kept apart from the app: a session
 * of their own for each account (cookies, logins, storage and cache — none of the app's, nor another account's), no Node, no preload, no permissions (camera,
 * location, notifications…), only http(s) pages, and a link that opens a new window opens in the same box instead.
 */
export function registerWebBrowser(): void {
  // Each account's browsing session, locked down the first time a box uses it.
  const lockedDown = new Set<string>()
  const lockDown = (partition: string): void => {
    if (lockedDown.has(partition)) return
    lockedDown.add(partition)
    const pages = session.fromPartition(partition)
    pages.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    pages.setPermissionCheckHandler(() => false)
    // Ads and trackers never load: less for the page to run, and less watching you.
    pages.webRequest.onBeforeRequest({ urls: BLOCKED_URLS }, (_details, callback) => callback({ cancel: true }))
  }

  app.on('web-contents-created', (_event, contents) => {
    // Whatever a page asks for, a <webview> is only ever this: sandboxed, isolated, in the browser's session.
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      delete webPreferences.preload
      webPreferences.nodeIntegration = false
      webPreferences.nodeIntegrationInSubFrames = false
      webPreferences.contextIsolation = true
      webPreferences.sandbox = true
      webPreferences.webSecurity = true
      // Lighter pages: videos and sounds wait for a click, and no spellcheck in their boxes.
      webPreferences.autoplayPolicy = 'document-user-activation-required'
      webPreferences.spellcheck = false
      if (!isBrowserPartition(params.partition) || (params.src && params.src !== 'about:blank' && !isBrowsableUrl(params.src))) return event.preventDefault()
      lockDown(params.partition)
    })
    if (contents.getType() === 'webview') guard(contents)
  })
}

/** Ad and tracker hosts: the big networks, which most of a page's extra weight comes from. */
const BLOCKED_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'google-analytics.com',
  'googletagservices.com',
  'amazon-adsystem.com',
  'adnxs.com',
  'adsrvr.org',
  'advertising.com',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'casalemedia.com',
  'moatads.com',
  'scorecardresearch.com',
  'quantserve.com',
  'quantcount.com',
  'hotjar.com',
  'mouseflow.com',
  'adform.net',
  'smartadserver.com',
  'yieldmo.com',
  'sharethrough.com',
  'teads.tv',
  'media.net',
  '33across.com',
  'indexww.com',
  'bidswitch.net',
  'lijit.com',
  'sovrn.com'
]
const HIDE_SCROLLBARS = '::-webkit-scrollbar { width: 0 !important; height: 0 !important; background: transparent !important; } html { scrollbar-width: none !important; }'

const BLOCKED_URLS = BLOCKED_HOSTS.flatMap((host) => [`*://${host}/*`, `*://*.${host}/*`])

function guard(page: WebContents): void {
  // A new window (target=_blank, window.open, a middle-click) opens as a new tab in the same box.
  page.setWindowOpenHandler(({ url }) => {
    if (isBrowsableUrl(url)) page.hostWebContents?.send('browser:open-tab', page.id, url)
    return { action: 'deny' }
  })
  // Only web pages: no file://, no app protocols, no javascript: tricks.
  const onlyWeb = (event: Electron.Event, url: string): void => {
    if (!isBrowsableUrl(url)) event.preventDefault()
  }
  page.on('will-navigate', onlyWeb)
  page.on('will-redirect', onlyWeb)

  // No scrollbars — the box is small, and the wheel or trackpad still scrolls — from the moment a page starts.
  const noScrollbars = (): void => void page.insertCSS(HIDE_SCROLLBARS).catch(() => {})
  page.on('did-navigate', noScrollbars)
  page.on('dom-ready', noScrollbars)

  // Ctrl+scroll and Ctrl + / - / 0 zoom the page. The box sets the zoom itself (it also follows the canvas's), so
  // the asks go to it.
  const zoom = (step: 'in' | 'out' | 'reset'): void => page.hostWebContents?.send('browser:zoom', page.id, step)
  page.on('zoom-changed', (_event, direction) => zoom(direction))
  page.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return
    const step = input.key === '=' || input.key === '+' ? 'in' : input.key === '-' ? 'out' : input.key === '0' ? 'reset' : null
    if (!step) return
    event.preventDefault()
    zoom(step)
  })
}
