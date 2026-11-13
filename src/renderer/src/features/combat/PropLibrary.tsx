import { useEffect, useMemo, useRef, useState } from 'react'
import type { PropListing } from '@shared/ipc'
import { readPropFile } from '../../data/propLibrary'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { PlusIcon, XIcon } from '../../ui/icons'
import { useDragSelect } from '../../ui/useDragSelect'
import './propLibrary.css'

type Prop = PropListing['props'][number]

const thumb = (campaignId: string, path: string, v: number): string => `vault-asset://${campaignId}/.props/${path.split('/').map(encodeURIComponent).join('/')}?v=${v}`

/**
 * The campaign's props: pictures kept in folders to decorate any of its
 * battle maps. Click one to put it on the map; drag one onto a folder to
 * move it; double-click a name to rename it. Pictures added go into the
 * folder you're looking at. They're files in the campaign folder's `.props`.
 */
export function PropLibrary({ campaignId, onPlace, onClose, onHint }: { campaignId: string; onPlace: (path: string, name: string) => void; onClose: () => void; onHint: (h: string) => void }): JSX.Element {
  const [listing, setListing] = useState<PropListing>({ folders: [], props: [] })
  // null: every prop; "": the top of the library; otherwise a folder's path.
  const [folder, setFolder] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState<{ kind: 'prop' | 'folder'; path: string; name: string } | null>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  // Props picked by dragging a box round them (or Ctrl-clicking): moved or deleted together.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const gridRef = useRef<HTMLDivElement>(null)
  useDragSelect(gridRef, (ids, additive) => setPicked((prev) => new Set(additive ? [...prev, ...ids] : ids)))

  async function run(call: Promise<{ ok: true; data: PropListing } | { ok: false; error: string }>): Promise<void> {
    setBusy(true)
    const result = await call
    setBusy(false)
    if (!result.ok) return setError(result.error)
    setError(null)
    setListing(result.data)
    setVersion((v) => v + 1)
    setPicked((prev) => new Set([...prev].filter((p) => result.data.props.some((x) => x.path === p))))
  }

  useEffect(() => {
    void run(window.goblin.props.list(campaignId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  // A folder that's gone (renamed, deleted) falls back to every prop.
  useEffect(() => {
    if (folder && !listing.folders.includes(folder)) setFolder(null)
  }, [listing, folder])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return listing.props.filter((p) => (q ? p.name.toLowerCase().includes(q) || p.folder.toLowerCase().includes(q) : folder === null || p.folder === folder))
  }, [listing, folder, query])

  async function addFiles(files: File[]): Promise<void> {
    const pictures = files.filter((f) => f.type.startsWith('image/'))
    if (!pictures.length) return
    setBusy(true)
    try {
      const items = await Promise.all(pictures.map(readPropFile))
      await run(window.goblin.props.add(campaignId, folder ?? '', items))
      onHint(`Added ${items.length === 1 ? items[0].name : `${items.length} props`}. Click a prop to put it on the map.`)
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Couldn’t read those pictures.')
    }
  }

  function commitRename(): void {
    if (!renaming) return
    const r = renaming
    setRenaming(null)
    if (r.kind === 'prop') void run(window.goblin.props.rename(campaignId, r.path, r.name))
    else {
      void run(window.goblin.props.renameFolder(campaignId, r.path, r.name))
      const parent = r.path.includes('/') ? r.path.slice(0, r.path.lastIndexOf('/') + 1) : ''
      setFolder(parent + r.name.trim())
    }
  }

  const folderLabel = folder === null ? 'All props' : folder === '' ? 'Not in a folder' : folder.slice(folder.lastIndexOf('/') + 1)
  const counts = (f: string): number => listing.props.filter((p) => p.folder === f).length

  function dropProps(e: React.DragEvent, target: string): void {
    e.preventDefault()
    setDropOn(null)
    const paths = e.dataTransfer.getData('application/x-goblin-prop')
    if (paths) void run(window.goblin.props.move(campaignId, JSON.parse(paths) as string[], target))
    else if (e.dataTransfer.files.length) {
      setFolder(target)
      void addFiles([...e.dataTransfer.files])
    }
  }

  const folderRow = (path: string | null, label: string, depth = 0): JSX.Element => {
    const target = path ?? ''
    const isRenaming = renaming?.kind === 'folder' && renaming.path === path
    return (
      <div
        key={path ?? '*'}
        className={`pl-folder${folder === path ? ' pl-folder--on' : ''}${dropOn === target && path !== null ? ' pl-folder--drop' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          setFolder(path)
          setQuery('')
        }}
        onDoubleClick={() => path && setRenaming({ kind: 'folder', path, name: label })}
        onDragOver={(e) => {
          if (path === null) return
          e.preventDefault()
          setDropOn(target)
        }}
        onDragLeave={() => setDropOn(null)}
        onDrop={(e) => path !== null && dropProps(e, target)}
        title={path ? 'Double-click to rename. Drop props here to move them.' : undefined}
      >
        {isRenaming ? (
          <input
            autoFocus
            className="gb-input pl-rename"
            value={renaming.name}
            onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setRenaming(null)
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span className="pl-folder-name">{label}</span>
            <small>{path === null ? listing.props.length : counts(target)}</small>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      className="pl"
      role="dialog"
      aria-label="Prop library"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        if (e.defaultPrevented || !e.dataTransfer.files.length) return
        e.preventDefault()
        void addFiles([...e.dataTransfer.files])
      }}
    >
      <header className="pl-head">
        <strong>Props</strong>
        <input className="gb-input pl-search" placeholder="Search props" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search props" />
        <button type="button" className="pl-add" onClick={() => fileRef.current?.click()} disabled={busy} title="Add pictures to the folder you're looking at (or drop them here)">
          <PlusIcon size={12} /> Add
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void addFiles(files)
          }}
        />
        <button type="button" className="pl-close" onClick={onClose} title="Close the library" aria-label="Close the prop library">
          <XIcon size={12} />
        </button>
      </header>

      <div className="pl-body">
        <nav className="pl-folders" aria-label="Prop folders">
          {folderRow(null, 'All props')}
          {listing.props.some((p) => p.folder === '') && folderRow('', 'Not in a folder')}
          {listing.folders.map((f) => folderRow(f, f.slice(f.lastIndexOf('/') + 1), f.split('/').length - 1))}
          <button
            type="button"
            className="pl-new-folder"
            disabled={busy}
            onClick={() => {
              const parent = folder ?? ''
              const base = 'New folder'
              let name = base
              for (let n = 2; listing.folders.includes(parent ? `${parent}/${name}` : name); n++) name = `${base} ${n}`
              const path = parent ? `${parent}/${name}` : name
              void run(window.goblin.props.createFolder(campaignId, parent, name)).then(() => {
                setFolder(path)
                setRenaming({ kind: 'folder', path, name })
              })
            }}
            title={folder ? `A new folder inside ${folderLabel}` : 'A new folder'}
          >
            <PlusIcon size={11} /> New folder
          </button>
        </nav>

        <section className="pl-main">
          <div className="pl-bar">
            <span>{query.trim() ? `Matching “${query.trim()}”` : folderLabel}</span>
            {folder && !query.trim() && (
              <ConfirmButton
                label="Delete folder"
                confirmLabel="Delete it and its props?"
                variant="ghost"
                danger
                className="pl-small"
                title="Moves the folder and every prop in it to the Recycle Bin"
                onConfirm={() => void run(window.goblin.props.trash(campaignId, [folder]))}
              />
            )}
          </div>
          {picked.size > 0 && (
            <div className="pl-picked">
              <span>{picked.size} picked</span>
              <span className="pl-picked-hint">Drag them onto a folder to move them</span>
              <ConfirmButton
                label="Delete"
                confirmLabel={`Delete ${picked.size}?`}
                variant="ghost"
                danger
                className="pl-small"
                title="Move the picked props to the Recycle Bin"
                onConfirm={() => void run(window.goblin.props.trash(campaignId, [...picked]))}
              />
              <button type="button" className="pl-close" onClick={() => setPicked(new Set())} title="Unpick them" aria-label="Unpick the props">
                <XIcon size={10} />
              </button>
            </div>
          )}
          {error && <p className="pl-error">{error}</p>}
          {shown.length === 0 ? (
            <div className="pl-empty">
              {listing.props.length === 0 ? 'No props yet. Add pictures (transparent PNGs work best), or drop them here.' : query.trim() ? 'No props match that.' : 'Nothing in this folder yet. Add pictures, or drag props here from another folder.'}
            </div>
          ) : (
            <div className="pl-grid" ref={gridRef}>
              {shown.map((p: Prop) => (
                <div
                  key={p.path}
                  data-select-id={p.path}
                  className={`pl-tile${picked.has(p.path) ? ' pl-tile--picked' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    // Dragging a picked prop takes every picked one with it.
                    const paths = picked.has(p.path) ? [...picked] : [p.path]
                    e.dataTransfer.setData('application/x-goblin-prop', JSON.stringify(paths))
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  <button
                    type="button"
                    className="pl-pic"
                    onClick={(e) => {
                      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) return onPlace(p.path, p.name)
                      setPicked((prev) => {
                        const next = new Set(prev)
                        if (next.has(p.path)) next.delete(p.path)
                        else next.add(p.path)
                        return next
                      })
                    }}
                    title={`${p.name}: click to put it on the map, Ctrl-click to pick it`}
                  >
                    <img src={thumb(campaignId, p.path, version)} alt="" draggable={false} />
                  </button>
                  {renaming?.kind === 'prop' && renaming.path === p.path ? (
                    <input
                      autoFocus
                      className="gb-input pl-rename"
                      value={renaming.name}
                      onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                    />
                  ) : (
                    <span className="pl-name" onDoubleClick={() => setRenaming({ kind: 'prop', path: p.path, name: p.name })} title="Double-click to rename">
                      {p.name}
                    </span>
                  )}
                  {query.trim() && p.folder && <small className="pl-in">{p.folder}</small>}
                  <ConfirmButton
                    label={<XIcon size={9} />}
                    confirmLabel="Delete?"
                    variant="ghost"
                    danger
                    className="pl-delete"
                    title={`Move ${p.name} to the Recycle Bin (maps keep any already placed)`}
                    onConfirm={() => void run(window.goblin.props.trash(campaignId, [p.path]))}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
