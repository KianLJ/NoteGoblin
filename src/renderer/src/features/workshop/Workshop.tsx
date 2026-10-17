import { useEffect, useState } from 'react'
import type { PackImportResult } from '@shared/ipc'
import type { ContentPack } from '@shared/content/schema'
import { describePackContents } from '@shared/content/packFiles'
import { duplicatePackDraft, newPackDraft, type PackDraft } from '@shared/content/workshop'
import { Button } from '../../ui/Button'
import { ImportSummary } from '../content/ContentPacksModal'
import { notifyPackLibraryChanged, useLibraryPacks } from '../content/usePacks'
import { PackEditor } from './PackEditor'
import { WorkshopTour, tourPending } from './WorkshopTour'

/** An open pack's edits — kept per pack while the Workshop is open, so switching packs never loses anything. */
interface OpenDraft {
  draft: PackDraft
  /** The id it's stored under in the library (changes only once a renamed id is saved). */
  storedId: string
  dirty: boolean
}

/**
 * The Homebrew Workshop: your pack library on the left, the selected pack's
 * editor on the right. Everything here edits your library only — a
 * campaign keeps the copy it enabled until the DM updates it from the
 * Content Packs window.
 */
export function Workshop({ authorName }: { authorName: string }): JSX.Element {
  const library = useLibraryPacks()
  const packs = library.packs ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, OpenDraft>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<PackImportResult | null>(null)
  const [touring, setTouring] = useState(tourPending)

  useEffect(() => {
    if (!selectedId && packs.length) setSelectedId(packs[0].pack.id)
  }, [packs, selectedId])

  const selectedPack = packs.find((p) => p.pack.id === selectedId)?.pack
  const current: OpenDraft | undefined = selectedId ? (open[selectedId] ?? (selectedPack ? { draft: selectedPack as unknown as PackDraft, storedId: selectedPack.id, dirty: false } : undefined)) : undefined

  function setDraft(storedId: string, draft: PackDraft): void {
    setOpen((prev) => ({ ...prev, [storedId]: { draft, storedId, dirty: true } }))
  }

  async function saveNew(draft: PackDraft): Promise<void> {
    setBusy(true)
    setError(null)
    const result = await window.goblin.packs.save(draft)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    if (!result.data.saved) return setError(result.data.issues.map((i) => i.message).join(' '))
    notifyPackLibraryChanged()
    setSelectedId(result.data.pack.id)
  }

  async function importPacks(): Promise<void> {
    setBusy(true)
    setError(null)
    const result = await window.goblin.packs.import()
    setBusy(false)
    if (!result.ok) return setError(result.error)
    if (!result.data) return
    setImportResult(result.data)
    if (result.data.imported.length) {
      notifyPackLibraryChanged()
      setSelectedId(result.data.imported[0].pack.id)
    }
  }

  const takenIds = packs.map((p) => p.pack.id)

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
      {touring && <WorkshopTour onClose={() => setTouring(false)} />}
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
        }}
      >
        <div style={{ padding: 'var(--space-4) var(--space-4) var(--space-2)' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18 }}>Homebrew Workshop</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Make and edit content packs. Campaigns pick up changes when the DM updates the pack.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '0 var(--space-4) var(--space-3)' }}>
          <Button variant="primary" disabled={busy} onClick={() => saveNew(newPackDraft('New Pack', authorName, takenIds))} style={smallButton}>
            New pack
          </Button>
          <Button variant="secondary" disabled={busy} onClick={importPacks} style={smallButton}>
            Import…
          </Button>
          <Button variant="ghost" onClick={() => setTouring(true)} style={smallButton} title="A short tour of the Workshop">
            Tour
          </Button>
        </div>
        {error && <div style={{ margin: '0 var(--space-4) var(--space-2)', fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
        {importResult && (
          <div style={{ margin: '0 var(--space-4) var(--space-2)' }}>
            <ImportSummary result={importResult} onDismiss={() => setImportResult(null)} />
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-2) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {library.packs && packs.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 var(--space-2)' }}>No packs yet — start a new one or import a file.</p>}
          {packs.map(({ pack }) => {
            const draft = open[pack.id]
            const active = pack.id === selectedId
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setSelectedId(pack.id)}
                style={{
                  textAlign: 'left',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  background: active ? 'var(--bg-surface-raised)' : 'transparent',
                  color: 'var(--text-primary)',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(draft?.draft.name ?? pack.name)}</strong>
                  {draft?.dirty && <span title="Unsaved changes" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  v{pack.version} · {describePackContents(pack)}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {current ? (
          <PackEditor
            key={current.storedId}
            draft={current.draft}
            storedId={current.storedId}
            dirty={current.dirty}
            library={packs.map((p) => p.pack)}
            onChange={(draft) => setDraft(current.storedId, draft)}
            onSaved={(pack: ContentPack) => {
              setOpen((prev) => {
                const next = { ...prev }
                delete next[current.storedId]
                return next
              })
              notifyPackLibraryChanged()
              setSelectedId(pack.id)
            }}
            onDiscard={() =>
              setOpen((prev) => {
                const next = { ...prev }
                delete next[current.storedId]
                return next
              })
            }
            onDuplicate={() => selectedPack && saveNew(duplicatePackDraft(selectedPack, takenIds))}
            onRemoved={() => {
              setOpen((prev) => {
                const next = { ...prev }
                delete next[current.storedId]
                return next
              })
              notifyPackLibraryChanged()
              setSelectedId(null)
            }}
          />
        ) : library.packs && packs.length === 0 ? (
          <div style={{ margin: 'auto', maxWidth: 560, padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22 }}>Make your first pack</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
              A pack holds homebrew — classes, feats, spells, items, creatures — that character sheets calculate with. Make one here, test it, then enable it for a campaign from Content Packs.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              <StartCard title="Start from scratch" hint="An empty pack built on the SRD" disabled={busy} onClick={() => saveNew(newPackDraft('My Homebrew', authorName, takenIds))} />
              <StartCard title="Import a file" hint="A .ngpack.json someone shared" disabled={busy} onClick={importPacks} />
            </div>
          </div>
        ) : (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{library.packs ? 'Pick a pack on the left, or start a new one.' : 'Loading your library…'}</div>
        )}
      </section>
    </div>
  )
}

function StartCard({ title, hint, disabled, onClick }: { title: string; hint: string; disabled?: boolean; onClick: () => void }): JSX.Element {
  return (
    <button type="button" className="gb-card" disabled={disabled} onClick={onClick} style={{ padding: 'var(--space-3)', textAlign: 'left', cursor: disabled ? 'default' : 'pointer' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>
    </button>
  )
}

const smallButton = { fontSize: 12, padding: '4px 10px' } as const
