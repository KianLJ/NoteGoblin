// The web app's stand-in for the `electron` module, so the desktop's own preload (src/preload/index.ts) runs in a
// browser unchanged: `ipcRenderer.invoke` calls a handler in web/host.ts instead of the main process, and what the
// main process would `webContents.send` arrives through `emit` below.

type Listener = (event: unknown, ...args: unknown[]) => void
type Handler = (...args: unknown[]) => unknown

const handlers = new Map<string, Handler>()
const listeners = new Map<string, Set<Listener>>()
const warned = new Set<string>()

/** Answers one channel, the way an `ipcMain.handle` does on the desktop. */
export function handle(channel: string, handler: Handler): void {
  handlers.set(channel, handler)
}

/** What the main process sends the window, on the desktop: every listener on that channel hears it. */
export function emit(channel: string, ...args: unknown[]): void {
  for (const l of listeners.get(channel) ?? []) l({}, ...args)
}

/** Stands in for the desktop's BrowserWindow where shared main-process code (sessionClient.ts, relaySocket.ts) sends to it. */
export const webWindow = { webContents: { send: emit }, isDestroyed: () => false }

export const ipcRenderer = {
  invoke: async (channel: string, ...args: unknown[]): Promise<unknown> => {
    const h = handlers.get(channel)
    if (h) return h(...args)
    if (!warned.has(channel)) {
      warned.add(channel)
      console.warn(`[web] ${channel} isn't available in the web app`)
    }
    // Most calls answer with an ApiResult; the ones that don't treat this as "nothing".
    return { ok: false, error: 'That needs the NoteGoblin desktop app.' }
  },
  on: (channel: string, listener: Listener): void => {
    if (!listeners.has(channel)) listeners.set(channel, new Set())
    listeners.get(channel)!.add(listener)
  },
  removeListener: (channel: string, listener: Listener): void => {
    listeners.get(channel)?.delete(listener)
  }
}

export const contextBridge = {
  exposeInMainWorld: (key: string, api: unknown): void => {
    ;(window as unknown as Record<string, unknown>)[key] = api
  }
}

/** Dropped files have no disk path in a browser. */
export const webUtils = { getPathForFile: (): string => '' }
