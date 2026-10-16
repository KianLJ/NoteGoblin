import { useState, type ReactNode } from 'react'
import type { ApiResult, CampaignPack, PackImportResult } from '@shared/ipc'
import type { ContentPack } from '@shared/content/schema'
import { describePackContents } from '@shared/content/packFiles'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { notifyPackLibraryChanged, useCampaignPacks, useLibraryPacks } from './usePacks'

interface ContentPacksModalProps {
  onClose: () => void
  /** The campaign open right now, if any. */
  campaign: { id: string; name: string } | null
  /** DM: can enable/disable/update packs for `campaign`. Player: sees the campaign's packs read-only. */
  role: 'dm' | 'player'
  /** Player only — the campaign's packs as the workspace already has them (live, or from the offline snapshot). */
  playerCampaignPacks?: ContentPack[] | null
}

/**
 * Content packs — homebrew "books" (see docs/homebrew-engine.md). Two parts:
 * the open campaign's packs (the DM enables, updates and disables them;
 * players see what's in use), and your personal library (import, export,
 * remove). Inside a campaign, sheets use exactly its enabled packs; outside
 * one, your whole library applies.
 */
export function ContentPacksModal({ onClose, campaign, role, playerCampaignPacks }: ContentPacksModalProps): JSX.Element {
  const library = useLibraryPacks()
  const isDm = role === 'dm'
  const dmCampaign = useCampaignPacks(isDm && campaign ? campaign.id : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<PackImportResult | null>(null)

  const enabled: ContentPack[] = isDm ? (dmCampaign.packs ?? []).map((p) => p.pack) : (playerCampaignPacks ?? [])
  const libraryPacks = library.packs ?? []
  const libraryById = new Map(libraryPacks.map((p) => [p.pack.id, p.pack]))
  const notEnabled = libraryPacks.filter((p) => !enabled.some((e) => e.id === p.pack.id))

  async function run(action: () => Promise<{ ok: boolean; error?: string }>): Promise<void> {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    if (!result.ok) setError(result.error ?? 'Something went wrong.')
  }

  async function importPacks(): Promise<void> {
    setBusy(true)
    setError(null)
    const result = await window.goblin.packs.import()
    setBusy(false)
    if (!result.ok) return setError(result.error)
    if (!result.data) return
    setImportResult(result.data)
    if (result.data.imported.length) notifyPackLibraryChanged()
  }

  function campaignAction(call: Promise<ApiResult<CampaignPack[]>>): Promise<{ ok: boolean; error?: string }> {
    return call.then((result) => {
      if (result.ok) dmCampaign.setPacks(result.data)
      return result.ok ? { ok: true } : { ok: false, error: result.error }
    })
  }

  return (
    <Modal onClose={onClose} width={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20 }}>Content Packs</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Homebrew classes, species, feats, spells and items. {campaign ? `Character sheets in ${campaign.name} use the packs enabled for it.` : 'Outside a campaign, character sheets use every pack in your library.'}
          </p>
        </div>

        {error && (
          <div className="gb-card" style={{ padding: 'var(--space-2) var(--space-3)', borderColor: 'var(--danger)', color: 'var(--danger)', fontSize: 12 }}>
            {error}
          </div>
        )}

        {campaign && (
          <Section title={`In ${campaign.name}`}>
            {enabled.length === 0 && (
              <Muted>{isDm ? 'No packs enabled — this campaign uses the SRD only. Enable a pack from your library below.' : 'The DM hasn’t enabled any packs — this campaign uses the SRD only.'}</Muted>
            )}
            {enabled.map((pack) => {
              const inLibrary = libraryById.get(pack.id)
              const canUpdate = isDm && inLibrary && inLibrary.version !== pack.version
              return (
                <PackRow
                  key={pack.id}
                  pack={pack}
                  badge="Enabled"
                  actions={
                    isDm ? (
                      <>
                        {canUpdate && (
                          <Button variant="primary" disabled={busy} onClick={() => run(() => campaignAction(window.goblin.campaignPacks.enable(campaign.id, pack.id)))} style={smallButton} title="Players get the new version, and their sheets flag what changed.">
                            Update to {inLibrary!.version}
                          </Button>
                        )}
                        <Button variant="secondary" disabled={busy} onClick={() => run(() => campaignAction(window.goblin.campaignPacks.disable(campaign.id, pack.id)))} style={smallButton} title="Sheets keep what they picked from it — enabling it again restores everything.">
                          Disable
                        </Button>
                      </>
                    ) : undefined
                  }
                />
              )
            })}
            {isDm && notEnabled.length > 0 && (
              <>
                <div className="gb-label" style={{ margin: '8px 0 4px' }}>
                  Available from your library
                </div>
                {notEnabled.map(({ pack }) => (
                  <PackRow
                    key={pack.id}
                    pack={pack}
                    actions={
                      <Button variant="primary" disabled={busy} onClick={() => run(() => campaignAction(window.goblin.campaignPacks.enable(campaign.id, pack.id)))} style={smallButton}>
                        Enable
                      </Button>
                    }
                  />
                ))}
              </>
            )}
          </Section>
        )}

        <Section
          title="Your library"
          action={
            <Button variant="secondary" disabled={busy} onClick={importPacks} style={smallButton}>
              Import…
            </Button>
          }
        >
          {importResult && <ImportSummary result={importResult} onDismiss={() => setImportResult(null)} />}
          {library.packs && libraryPacks.length === 0 && (
            <Muted>No packs yet. Import a .ngpack.json file someone shared with you — the Homebrew Workshop for making your own is coming next.</Muted>
          )}
          {libraryPacks.map(({ pack }) => (
            <PackRow
              key={pack.id}
              pack={pack}
              badge={enabled.some((e) => e.id === pack.id) ? 'In this campaign' : undefined}
              actions={
                <>
                  <Button variant="secondary" disabled={busy} onClick={() => run(() => window.goblin.packs.exportPack(pack.id))} style={smallButton}>
                    Export…
                  </Button>
                  <ConfirmButton
                    label="Remove"
                    confirmLabel="Remove from library"
                    danger
                    variant="ghost"
                    disabled={busy}
                    style={smallButton}
                    title="Removes it from your library only — any campaign that has it enabled keeps its copy."
                    onConfirm={() =>
                      run(async () => {
                        const result = await window.goblin.packs.remove(pack.id)
                        if (result.ok) notifyPackLibraryChanged()
                        return result.ok ? { ok: true } : { ok: false, error: result.error }
                      })
                    }
                  />
                </>
              }
            />
          ))}
        </Section>
      </div>
    </Modal>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <div className="gb-label" style={{ margin: 0, flex: 1 }}>
          {title}
        </div>
        {action}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function PackRow({ pack, badge, actions }: { pack: ContentPack; badge?: string; actions?: ReactNode }): JSX.Element {
  return (
    <div className="gb-card" style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <strong>{pack.name}</strong>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            v{pack.version}
            {pack.author ? ` · ${pack.author}` : ''}
          </span>
          {badge && (
            <span className="gb-badge gb-badge--accent" style={{ fontSize: 10 }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{describePackContents(pack)}</div>
        {pack.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{pack.description}</div>}
        {pack.dependsOn.filter((d) => d !== 'srd-5.2.1').length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Needs: {pack.dependsOn.filter((d) => d !== 'srd-5.2.1').join(', ')}</div>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{actions}</div>}
    </div>
  )
}

function ImportSummary({ result, onDismiss }: { result: PackImportResult; onDismiss: () => void }): JSX.Element {
  return (
    <div className="gb-card" style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {result.imported.map(({ pack, replaced, warnings }) => (
        <div key={pack.id}>
          <span style={{ color: 'var(--accent)' }}>{replaced ? 'Updated' : 'Imported'}</span> {pack.name} v{pack.version}
          {warnings.length > 0 && (
            <ul style={{ margin: '2px 0 0', paddingLeft: 18, color: 'var(--text-muted)' }}>
              {warnings.map((w, i) => (
                <li key={i}>
                  {w.path ? `${w.path}: ` : ''}
                  {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {result.failed.map(({ fileName, issues }) => (
        <div key={fileName}>
          <span style={{ color: 'var(--danger)' }}>Couldn’t import</span> {fileName}
          <ul style={{ margin: '2px 0 0', paddingLeft: 18, color: 'var(--text-muted)' }}>
            {issues.slice(0, 8).map((issue, i) => (
              <li key={i}>
                {issue.path ? `${issue.path}: ` : ''}
                {issue.message}
              </li>
            ))}
            {issues.length > 8 && <li>…and {issues.length - 8} more</li>}
          </ul>
        </div>
      ))}
      <div>
        <button type="button" className="gb-btn gb-btn--ghost" onClick={onDismiss} style={{ fontSize: 11, padding: '2px 6px' }}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

function Muted({ children }: { children: ReactNode }): JSX.Element {
  return <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{children}</p>
}

const smallButton = { fontSize: 12, padding: '4px 10px' } as const
