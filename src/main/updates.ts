// Auto-update (electron-updater against GitHub Releases — see
// electron-builder.yml's `publish` block), with its progress shared with the
// renderer so the version badge can say what's happening: checking, the new
// version downloading and how far along, ready to restart, or why a check
// failed. Before this the whole thing ran silently, so a 400MB download in
// the background looked exactly like "no update found".

import { BrowserWindow, dialog, ipcMain } from 'electron'
// electron-updater is CommonJS and the main bundle is ESM, whose loader
// can't see its named exports — `import { autoUpdater }` would crash every
// launch. Default-import the whole module instead.
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../../shared/ipc'
import { updateErrorMessage } from '../../shared/updateErrors'

const { autoUpdater } = electronUpdater

// Startup's check only finds a release published before launch, so an app
// left open all evening would never notice one published after — this
// re-checks every few hours for as long as the app stays running.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let status: UpdateStatus = { state: 'idle' }

function setStatus(next: UpdateStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('updates:status', status)
}

async function check(): Promise<UpdateStatus> {
  // Already found one: checking again would only restart the download.
  if (status.state === 'downloading' || status.state === 'ready' || status.state === 'dev') return status
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    setStatus({ state: 'error', message: updateErrorMessage(err), checkedAt: Date.now() })
  }
  return status
}

/**
 * Sets up the update handlers and IPC, then checks now and every
 * UPDATE_CHECK_INTERVAL_MS — call once at startup. In dev (unpackaged) the
 * handlers still answer, reporting 'dev', but nothing is checked.
 */
export function initAutoUpdater(isDev: boolean): void {
  ipcMain.handle('updates:get-status', () => status)
  ipcMain.handle('updates:check', () => check())
  ipcMain.handle('updates:install', () => {
    if (status.state === 'ready') autoUpdater.quitAndInstall()
  })
  if (isDev) {
    status = { state: 'dev' }
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => setStatus({ state: 'current', checkedAt: Date.now() }))
  autoUpdater.on('update-available', (info) => setStatus({ state: 'downloading', version: info.version, percent: 0, transferred: 0, total: 0 }))
  autoUpdater.on('download-progress', (p) => {
    const version = status.state === 'downloading' ? status.version : ''
    setStatus({ state: 'downloading', version, percent: Math.floor(p.percent), transferred: p.transferred, total: p.total })
  })
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({ state: 'ready', version: info.version })
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        message: `NoteGoblin ${info.version} is ready.`,
        detail: 'Restart to finish installing it — your campaigns and notes are untouched either way. You can also restart later from the version badge.'
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall()
      })
  })
  autoUpdater.on('error', (err) => {
    console.error('Update check failed:', err)
    setStatus({ state: 'error', message: updateErrorMessage(err), checkedAt: Date.now() })
  })

  void check()
  setInterval(() => void check(), UPDATE_CHECK_INTERVAL_MS)
}
