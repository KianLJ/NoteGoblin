import { app, shell, BrowserWindow, dialog, protocol, session } from 'electron'
import { join, extname } from 'path'
import { readFile } from 'node:fs/promises'
// electron-updater is CommonJS — our main bundle is ESM (package.json has
// "type": "module"), and Node's ESM loader doesn't do the static named-export
// analysis a bundler would, so `import { autoUpdater } from 'electron-updater'`
// throws a SyntaxError at module load (crashing every launch, not just when
// actually checking for updates). Default-import the whole module instead.
import electronUpdater from 'electron-updater'
import { registerIpcHandlers } from './registerIpc'
import { resolveVaultAssetPath } from '@server/files/vaultStore'

const { autoUpdater } = electronUpdater

const isDev = !app.isPackaged

// Electron derives the userData folder from the app name alone, so an
// unpacked/dev run and a real packaged install would otherwise land in the
// exact same OS folder — meaning test accounts/notes/campaigns created while
// developing show up the moment someone installs the shipped app. Give dev
// runs their own sibling folder instead, set before anything (identity db,
// host db, etc.) ever touches app.getPath('userData'). Skipped when
// --user-data-dir was passed explicitly (e.g. the two-profile DM/player test
// setup) — that's already an intentional, isolated override.
const hasExplicitUserDataDir = process.argv.some((arg) => arg.startsWith('--user-data-dir'))
if (isDev && !hasExplicitUserDataDir) {
  app.setPath('userData', `${app.getPath('userData')}-dev`)
}

// A note referencing `![art](images/dragon.png)` — a real file someone
// dropped into the vault folder, not a pasted data: URI — resolves through
// this custom scheme instead of a raw file:// path (which the renderer's own
// CSP wouldn't allow and which offers no chance to check the path stays
// inside the right campaign's folder). Must be registered before the app is
// ready; the actual protocol.handle() call happens once it is, below.
protocol.registerSchemesAsPrivileged([
  { scheme: 'vault-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } }
])

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp'
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    // Matches the dark-theme --bg-canvas token (index.html sets dark by
    // default) — just the color Electron paints before the page's own CSS
    // loads, so a mismatch here is only a flash-of-wrong-color, not a
    // functional issue.
    backgroundColor: '#1a160f',
    // Fully custom chrome (frame: false) rather than titleBarStyle:'hidden'
    // + titleBarOverlay — the native overlay's Windows-side hit-testing for
    // the drag region turned out to be unreliable (window dragging would
    // silently stop working, unrelated to anything on our side). Plain
    // -webkit-app-region CSS + our own minimize/maximize/close buttons
    // (see AppShell.tsx + window: IPC handlers below) is a much simpler,
    // better-tested mechanism.
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

/**
 * Checks GitHub Releases (see electron-builder.yml's `publish` block) for a
 * newer version, downloads it silently in the background if found, and asks
 * before restarting to apply it — never interrupts an active session
 * unprompted. No-op in dev (unpackaged runs have nothing to update, and
 * electron-updater errors immediately without a real app.getAppPath()
 * update metadata file anyway).
 */
function checkForUpdates(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-downloaded', () => {
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        message: 'A new version of NoteGoblin is ready.',
        detail: 'Restart to finish installing it — your campaigns and notes are untouched either way.'
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall()
      })
  })

  // Silent by design — a missed check (offline, no release yet, etc.) isn't
  // worth interrupting anyone over; it just quietly tries again next launch.
  autoUpdater.on('error', (err) => {
    console.error('Update check failed:', err)
  })

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Update check failed:', err)
  })
}

app.whenReady().then(() => {
  // Auto-grants the Local Font Access API so the Appearance settings' font
  // picker can list actually-installed system fonts — this is our own
  // trusted renderer, not arbitrary web content, so there's no one else's
  // permission to protect here.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback((permission as string) === 'local-fonts')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => (permission as string) === 'local-fonts')

  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: vault-asset:;"
          ]
        }
      })
    })
  }

  protocol.handle('vault-asset', async (request) => {
    try {
      const url = new URL(request.url)
      const campaignId = url.hostname
      const relativePath = decodeURIComponent(url.pathname.replace(/^\//, ''))
      const absPath = resolveVaultAssetPath(campaignId, relativePath)
      if (!absPath) return new Response('Not found', { status: 404 })
      const data = await readFile(absPath)
      const mime = IMAGE_MIME_BY_EXT[extname(absPath).toLowerCase()] ?? 'application/octet-stream'
      return new Response(new Uint8Array(data), { headers: { 'content-type': mime } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  const mainWindow = createWindow()
  registerIpcHandlers(mainWindow)

  if (!isDev) checkForUpdates()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
