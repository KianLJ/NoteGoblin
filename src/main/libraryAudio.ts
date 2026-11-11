import { app, ipcMain, net, protocol, type BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RELAY_URL } from '@server/relay/relayConfig'

/**
 * The built-in music, ambience and Sound Board audio, which the installer no longer carries (see
 * scripts/audio-manifest.mjs). `library-audio://file/<path>` plays a file from, in order: the copy downloaded
 * to this computer, the repo's own assets folder (running from source), or the relay — streamed, so anything
 * not downloaded still plays while online. Downloading keeps a mood or category here for offline use.
 */

const FOLDERS = ['music/', 'ambient/', 'soundboard/']

function libraryDir(): string {
  return join(app.getPath('userData'), 'library-audio')
}

/** A file path from the renderer, checked: one of the library's folders, an .mp3, no way out of it. */
function safePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 400) return null
  const parts = raw.split('/')
  if (!FOLDERS.some((f) => raw.startsWith(f)) || !raw.toLowerCase().endsWith('.mp3') || parts.some((p) => p === '' || p === '.' || p === '..' || p.includes('\\'))) return null
  return raw
}

function localFile(path: string): string {
  return join(libraryDir(), ...path.split('/'))
}

/** Running from source, the files are still in the repo. */
function devFile(path: string): string | null {
  if (app.isPackaged) return null
  const file = join(app.getAppPath(), 'src', 'renderer', 'src', 'assets', ...path.split('/'))
  return existsSync(file) ? file : null
}

function remoteUrl(path: string): string {
  return `${RELAY_URL}/library/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** Every built-in file downloaded to this computer, by path. */
function downloaded(): string[] {
  const root = libraryDir()
  if (!existsSync(root)) return []
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? walk(full) : name.toLowerCase().endsWith('.mp3') ? [relative(root, full).split(sep).join('/')] : []
    })
  return walk(root)
}

/** Must run before the app is ready (with the other schemes in index.ts). */
export const LIBRARY_AUDIO_SCHEME = { scheme: 'library-audio', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false, stream: true } }

export function registerLibraryAudio(window: BrowserWindow): void {
  protocol.handle('library-audio', async (request) => {
    const path = safePath(decodeURIComponent(new URL(request.url).pathname.replace(/^\//, '')))
    if (!path) return new Response('Not found', { status: 404 })
    // Range requests pass through, so long songs seek and stream rather than loading whole.
    const range = request.headers.get('range')
    const headers = range ? { range } : undefined
    const file = existsSync(localFile(path)) ? localFile(path) : devFile(path)
    try {
      if (file) return await net.fetch(pathToFileURL(file).toString(), { headers })
      return await net.fetch(remoteUrl(path), { headers })
    } catch {
      return new Response('Offline', { status: 503 })
    }
  })

  ipcMain.handle('library:downloaded', (): string[] => downloaded())

  // One at a time, reporting progress; a file that fails is skipped and named in the result.
  ipcMain.handle('library:download', async (_event, raw: unknown): Promise<{ ok: number; failed: string[] }> => {
    const paths = (Array.isArray(raw) ? raw : []).map(safePath).filter((p): p is string => !!p)
    const failed: string[] = []
    let ok = 0
    for (const [i, path] of paths.entries()) {
      const target = localFile(path)
      if (!existsSync(target)) {
        try {
          const res = await net.fetch(remoteUrl(path))
          if (!res.ok) throw new Error(String(res.status))
          mkdirSync(dirname(target), { recursive: true })
          const part = `${target}.part`
          writeFileSync(part, Buffer.from(await res.arrayBuffer()))
          renameSync(part, target)
        } catch {
          failed.push(path)
          continue
        }
      }
      ok++
      window.webContents.send('library:progress', { done: i + 1, total: paths.length, path })
    }
    return { ok, failed }
  })

  ipcMain.handle('library:remove', (_event, raw: unknown): void => {
    for (const path of (Array.isArray(raw) ? raw : []).map(safePath)) if (path) rmSync(localFile(path), { force: true })
  })
}
