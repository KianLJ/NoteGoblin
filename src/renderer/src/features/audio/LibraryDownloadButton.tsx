import { useState } from 'react'
import { downloadLibrary, removeLibrary, sizeLabel, useLibraryDownloads } from './libraryDownloads'

function DownloadGlyph(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2v8.5M4.5 7.5 8 11l3.5-3.5M3 13.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckGlyph(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * A small corner button on a built-in mood or Sound Board category: download its audio to keep it for offline
 * use (it streams while online either way), see it downloading, or — once it's here — remove it to free the space.
 */
export function LibraryDownloadButton({ paths, what }: { paths: string[]; what: string }): JSX.Element | null {
  const { downloaded, busy } = useLibraryDownloads()
  const [failed, setFailed] = useState(false)
  if (paths.length === 0) return null
  const have = paths.filter((p) => downloaded.has(p)).length
  const all = have === paths.length
  const mine = busy && paths.some((p) => busy.paths.has(p))
  const state = mine ? 'busy' : all ? 'done' : 'none'
  const title =
    state === 'busy'
      ? `Downloading ${what}…`
      : state === 'done'
        ? `${what} is downloaded — plays offline. Click to remove it (${sizeLabel(paths)}).`
        : `${failed ? 'Couldn’t download everything — click to try again. ' : ''}Download ${what} to play offline (${sizeLabel(paths.filter((p) => !downloaded.has(p)))}). It streams while you’re online.`
  return (
    <button
      type="button"
      className={`ab-dl ab-dl--${state}${failed && state === 'none' ? ' ab-dl--failed' : ''}`}
      title={title}
      aria-label={title}
      disabled={!!busy && !mine}
      onClick={(e) => {
        e.stopPropagation()
        if (state === 'done') void removeLibrary(paths)
        else if (state === 'none') void downloadLibrary(paths).then((n) => setFailed(n > 0))
      }}
    >
      {state === 'done' ? <CheckGlyph /> : state === 'busy' ? <span className="ab-dl-spin" /> : <DownloadGlyph />}
    </button>
  )
}

/** "Download all" in a section's header, with progress while it runs. */
export function LibraryDownloadAll({ paths, what }: { paths: string[]; what: string }): JSX.Element | null {
  const { downloaded, busy } = useLibraryDownloads()
  const [failed, setFailed] = useState(0)
  if (paths.length === 0) return null
  const missing = paths.filter((p) => !downloaded.has(p))
  if (busy && paths.some((p) => busy.paths.has(p))) {
    return (
      <span className="ab-dl-all ab-dl-all--busy" role="status">
        Downloading {busy.done}/{busy.total}
      </span>
    )
  }
  if (missing.length === 0) return <span className="ab-dl-all ab-dl-all--done">All downloaded</span>
  return (
    <button
      type="button"
      className="ab-dl-all"
      disabled={!!busy}
      title={`Download ${what} to play offline. It streams while you’re online.`}
      onClick={() => void downloadLibrary(missing).then(setFailed)}
    >
      <DownloadGlyph /> {failed ? `Retry ${failed} that failed` : `Download all (${sizeLabel(missing)})`}
    </button>
  )
}
