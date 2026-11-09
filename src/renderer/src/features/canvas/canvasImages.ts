/**
 * Images put on the canvas, kept in IndexedDB by id — they can be several MB
 * each, far past what localStorage (where the rest of the canvas lives) holds.
 * The canvas entry (see canvasEntries.ts) only carries the id and file name.
 */
const DB_NAME = 'gb-canvas-images'
const STORE = 'images'

let db: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return db
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = work(d.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export function putCanvasImage(id: string, dataUrl: string): Promise<IDBValidKey> {
  return run('readwrite', (s) => s.put(dataUrl, id))
}

export function getCanvasImage(id: string): Promise<string | undefined> {
  return run<string | undefined>('readonly', (s) => s.get(id))
}

export function deleteCanvasImage(id: string): Promise<undefined> {
  return run('readwrite', (s) => s.delete(id))
}
