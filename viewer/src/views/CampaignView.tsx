import { useEffect, useMemo, useState } from 'react'
import { getCampaign, type FolderRow, type NoteRow } from '../api'
import { useLoad } from '../data'
import { href } from '../route'
import { Status } from './Status'

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

function NoteLink({ campaignId, note }: { campaignId: string; note: NoteRow }): JSX.Element {
  return (
    <a className="v-row v-row--note" href={href({ view: 'note', campaignId, noteId: note.id })}>
      <span className="v-row-title">{note.title || 'Untitled'}</span>
      <VisibilityBadge visibility={note.visibility} />
    </a>
  )
}

function FolderBranch({
  campaignId,
  folder,
  folders,
  notes
}: {
  campaignId: string
  folder: FolderRow
  folders: FolderRow[]
  notes: NoteRow[]
}): JSX.Element | null {
  const childFolders = folders.filter((f) => f.parent_folder_id === folder.id).sort(byName)
  const childNotes = notes.filter((n) => n.folder_id === folder.id).sort(byTitle)
  if (childFolders.length === 0 && childNotes.length === 0) return null
  return (
    <details className="v-folder">
      <summary>{folder.name}</summary>
      <div className="v-folder-body">
        {childFolders.map((f) => (
          <FolderBranch key={f.id} campaignId={campaignId} folder={f} folders={folders} notes={notes} />
        ))}
        {childNotes.map((n) => (
          <NoteLink key={n.id} campaignId={campaignId} note={n} />
        ))}
      </div>
    </details>
  )
}

export function CampaignView({ campaignId, setTitle }: { campaignId: string; setTitle: (title: string) => void }): JSX.Element {
  const { data, error, reload } = useCampaign(campaignId)
  const [query, setQuery] = useState('')

  useEffect(() => setTitle(data?.name ?? 'Campaign'), [data?.name, setTitle])

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

  if (!data) return <Status error={error} loading onRetry={reload} />

  // A note whose folder isn't in the snapshot (deleted folder) still shows, at the top level.
  const folderIds = new Set(data.folders.map((f) => f.id))
  const rootFolders = data.folders.filter((f) => !f.parent_folder_id || !folderIds.has(f.parent_folder_id)).sort(byName)
  const rootNotes = data.notes.filter((n) => !n.folder_id || !folderIds.has(n.folder_id)).sort(byTitle)
  const pinned = data.notes.filter((n) => n.pinned).sort(byTitle)

  return (
    <div className="v-stack">
      <input
        className="gb-input v-search"
        type="search"
        placeholder={`Search ${data.notes.length} notes`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {matches ? (
        <div className="v-list">
          {matches.length === 0 && <p className="v-empty">No notes match “{query.trim()}”.</p>}
          {matches.map((n) => (
            <NoteLink key={n.id} campaignId={campaignId} note={n} />
          ))}
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <section>
              <h2 className="v-section-title">Pinned</h2>
              <div className="v-list">
                {pinned.map((n) => (
                  <NoteLink key={n.id} campaignId={campaignId} note={n} />
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="v-section-title">Notes</h2>
            {data.notes.length === 0 && <p className="v-empty">This campaign has no notes yet.</p>}
            <div className="v-list">
              {rootFolders.map((f) => (
                <FolderBranch key={f.id} campaignId={campaignId} folder={f} folders={data.folders} notes={data.notes} />
              ))}
              {rootNotes.map((n) => (
                <NoteLink key={n.id} campaignId={campaignId} note={n} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
