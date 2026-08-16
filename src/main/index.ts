import { app, shell, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './registerIpc'

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
    backgroundColor: '#14110c',
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

app.whenReady().then(() => {
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
          ]
        }
      })
    })
  }

  const mainWindow = createWindow()
  registerIpcHandlers(mainWindow)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
