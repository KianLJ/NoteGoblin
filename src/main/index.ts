import { app, shell, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './registerIpc'

const isDev = !app.isPackaged

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    // Matches the dark-theme tokens in theme.css (--bg-canvas / --text-primary for
    // :root[data-theme="dark"], which index.html sets by default) — the overlay is
    // native-drawn, so it can't read our CSS variables and has to be kept in sync
    // by hand. If a light/dark toggle is ever added, this needs to follow it (see
    // win.setTitleBarOverlay).
    backgroundColor: '#14110c',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#14110c',
      symbolColor: '#f2ead6',
      height: 44
    },
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
}

app.whenReady().then(() => {
  registerIpcHandlers()

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

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
