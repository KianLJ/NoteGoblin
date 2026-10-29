import { useEffect, useMemo, useState } from 'react'
import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon } from '@renderer/features/campaigns/icons'
import { getCampaign, type FolderRow, type NoteRow } from '../api'
import { useLoad } from '../data'
import { href } from '../route'
import { Status } from './Status'
import { NoteView } from './NoteView'

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, undefined, { numeric: true })
const byTitle = (a: NoteRow, b: NoteRow): number => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true })

export function useCampaign(campaignId: string): ReturnType<typeof useLoad<Awaited<ReturnType<typeof getCampaign>>>> {
  return useLoad(`campaign:${campaignId}`, () => getCampaign(campaignId))
}

export function VisibilityBadge({ visibility }: { visibility: string }): JSX.Element | null {
  if (visibility === 'dm') return <span className="gb-badge v-badge-dm">DM</span>
  if (visibility === 'private') return <span className="gb-badge">Private</span>
  return null
}

/** A note in the tree, as the desktop sidebar draws it: a file icon and its title, the open one marked. */
function NoteLink({ campaignId, note, depth, active }: { campaignId: string; note: NoteRow; depth: number; active: boolean }): JSX.Element {
  return (
    <a className={`v-tree-note${active ? ' v-tree-note--on' : ''}`} style={{ paddingLeft: 8 + depth * 14 + 14 }} href={href({ view: 'note', campaignId, noteId: note.id })} aria-current={active ? 'page' : undefined}>
      <FileIcon />
      <span className="v-tree-label">{note.title || 'Untitled'}</span>
      <VisibilityBadge visibility={note.visibility} />
    </a>
  )
}

/** Folders holding the open note, so it's showing when the tree first draws. */
function foldersAbove(folders: FolderRow[], folderId: string | null): Set<string> {
  const open = new Set<string>()
  let current = folderId
  while (current && !open.has(current)) {
    open.add(current)
    current = folders.find((f) => f.id === current)?.parent_folder_id ?? null
  }
  return open
}

function FolderBranch({
  campaignId,
  folder,
  folders,
  notes,
  depth,
  activeId,
  open,
  onToggle
}: {
  campaignId: string
  folder: FolderRow
  folders: FolderRow[]
  notes: NoteRow[]
  depth: number
  activeId: string | null
  open: Set<string>
  onToggle: (id: string) => void
}): JSX.Element | null {
  const childFolders = folders.filter((f) => f.parent_folder_id === folder.id).sort(byName)
  const childNotes = notes.filter((n) => n.folder_id === folder.id).sort(byTitle)
  if (childFolders.length === 0 && childNotes.length === 0) return null
  const isOpen = open.has(folder.id)
  return (
    <>
      <button type="button" className="v-tree-folder" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => onToggle(folder.id)} aria-expanded={isOpen}>
        <span className="v-tree-chevron" style={{ transform: isOpen ? 'rotate(90deg)' : undefined }}>
          <ChevronRightIcon />
        </span>
        {isOpen ? <FolderOpenIcon /> : <FolderIcon />}
        <span className="v-tree-label">{folder.name}</span>
      </button>
      {isOpen && (
        <>
          {childFolders.map((f) => (
            <FolderBranch key={f.id} campaignId={campaignId} folder={f} folders={folders} notes={notes} depth={depth + 1} activeId={activeId} open={open} onToggle={onToggle} />
          ))}
          {childNotes.map((n) => (
            <NoteLink key={n.id} campaignId={campaignId} note={n} depth={depth + 1} active={n.id === activeId} />
          ))}
        </>
      )}
    </>
  )
}

/**
 * A campaign's notes as the desktop app shows them: the folder tree in a
 * sidebar (search, pinned notes, folders) beside the open note. On a phone
 * it's one at a time — the tree, then the note you tap.
 */
export function CampaignView({ campaignId, noteId = null, setTitle }: { campaignId: string; noteId?: string | null; setTitle: (title: string) => void }): JSX.Element {
  const { data, error, reload } = useCampaign(campaignId)
  const [query, setQuery] = useState('')
  const activeFolder = data?.notes.find((n) => n.id === noteId)?.folder_id ?? null
  const [open, setOpen] = useState<Set<string>>(new Set())
  // Open the folders the note you're reading is in (as you follow links, too).
  useEffect(() => {
    if (data) setOpen((prev) => new Set([...prev, ...foldersAbove(data.folders, activeFolder)]))
  }, [data, activeFolder])
  const toggle = (id: string): void =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // The note's own title wins while one is open.
  useEffect(() => {
    if (!noteId) setTitle(data?.name ?? 'Campaign')
  }, [data?.name, noteId, setTitle])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !data) return null
    return data.notes
      .filter((n) => (n.title || '').toLowerCase().includes(q) || n.body_markdown.toLowerCase().includes(q))
      .sort((a, b) => {
        // Title hits first, then body-only hits.
        const at = (a.title || '').toLowerCase().includes(q) ? 0 : 1
        const bt = (b.title || '').toLowerCase().includes(q) ? 0 : 1
        return at - bt || byTitle(a, b)
      })
  }, [query, data])

  if (!data) return <div className="v-pad"><Status error={error} loading onRetry={reload} /></div>

  // A note whose folder isn't in the snapshot (deleted folder) still shows, at the top level.
  const folderIds = new Set(data.folders.map((f) => f.id))
  const rootFolders = data.folders.filter((f) => !f.parent_folder_id || !folderIds.has(f.parent_folder_id)).sort(byName)
  const rootNotes = data.notes.filter((n) => !n.folder_id || !folderIds.has(n.folder_id)).sort(byTitle)
  const pinned = data.notes.filter((n) => n.pinned).sort(byTitle)

  return (
    <div className={`v-notes${noteId ? ' v-notes--reading' : ''}`}>
      <aside className="v-notes-side">
        <div className="v-notes-head">
          <span className="v-notes-campaign">{data.name}</span>
          <input className="gb-input v-search" type="search" placeholder={`Search ${data.notes.length} notes`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {matches ? (
          <div className="v-tree">
            {matches.length === 0 && <p className="v-empty v-pad-x">No notes match “{query.trim()}”.</p>}
            {matches.map((n) => (
              <NoteLink key={n.id} campaignId={campaignId} note={n} depth={0} active={n.id === noteId} />
            ))}
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="v-tree">
                <div className="v-tree-heading">Pinned</div>
                {pinned.map((n) => (
                  <NoteLink key={n.id} campaignId={campaignId} note={n} depth={0} active={n.id === noteId} />
                ))}
              </div>
            )}
            <div className="v-tree">
              <div className="v-tree-heading">Notes</div>
              {data.notes.length === 0 && <p className="v-empty v-pad-x">This campaign has no notes yet.</p>}
              {rootFolders.map((f) => (
                <FolderBranch key={f.id} campaignId={campaignId} folder={f} folders={data.folders} notes={data.notes} depth={0} activeId={noteId} open={open} onToggle={toggle} />
              ))}
              {rootNotes.map((n) => (
                <NoteLink key={n.id} campaignId={campaignId} note={n} depth={0} active={n.id === noteId} />
              ))}
            </div>
          </>
        )}
      </aside>
      <section className="v-notes-main">
        {noteId ? (
          <NoteView campaignId={campaignId} noteId={noteId} setTitle={setTitle} />
        ) : (
          <div className="v-notes-pick">
            <span>Pick a note from the sidebar to read it.</span>
          </div>
        )}
      </section>
    </div>
  )
}
