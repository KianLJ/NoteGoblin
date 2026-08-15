import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { getLocalDb } from '@server/db/localDb'
import { IdentityRepo } from '@server/repositories/identityRepo'
import type { LoginResult } from '@shared/ipc'

const isDev = !app.isPackaged

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#14110c',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#14110c',
      symbolColor: '#ede4d3',
      height: 36
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
  const localDb = getLocalDb(app.getPath('userData'))
  const identityRepo = new IdentityRepo(localDb)

  ipcMain.handle('app:get-version', () => app.getVersion())

  ipcMain.handle('identity:has-any', () => identityRepo.hasAny())

  ipcMain.handle(
    'identity:create',
    async (_event, displayName: string, password: string): Promise<LoginResult> => {
      try {
        const identity = await identityRepo.create(displayName.trim(), password)
        return { ok: true, identity }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not create identity.' }
      }
    }
  )

  ipcMain.handle(
    'identity:login',
    async (_event, displayName: string, password: string): Promise<LoginResult> => {
      const identity = await identityRepo.verify(displayName.trim(), password)
      if (!identity) return { ok: false, error: 'That display name and password don’t match.' }
      return { ok: true, identity }
    }
  )

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
