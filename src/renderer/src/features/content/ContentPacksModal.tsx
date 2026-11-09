import { useState, type ReactNode } from 'react'
import type { ApiResult, CampaignPack, PackImportResult } from '@shared/ipc'
import type { ContentPack } from '@shared/content/schema'
import { describePackContents } from '@shared/content/packFiles'
import { terminologyConflicts } from '@shared/content/terms'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from '../../ui/icons'
import './packs.css'
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
  const conflicts = terminologyConflicts(enabled)

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
    <Modal onClose={onClose} width={680}>
      <div className="pk">
        <header className="pk-head">
          <h2>Content packs</h2>
          <p>
            Homebrew classes, species, feats, spells and items. {campaign ? `Character sheets in ${campaign.name} use the packs turned on for it.` : 'Outside a campaign, character sheets use every pack in your library.'}
          </p>
        </header>

        {error && (
          <div className="pk-error" role="alert">
            {error}
          </div>
        )}

        {campaign && (
          <Section title={`In ${campaign.name}`}>
            {enabled.length === 0 && (
              <Muted>{isDm ? 'No packs enabled — this campaign uses the SRD only. Enable a pack from your library below.' : 'The DM hasn’t enabled any packs — this campaign uses the SRD only.'}</Muted>
            )}
            {enabled.length > 1 && <Muted>Packs load top to bottom: a later pack wins where two rename the same thing.</Muted>}
            {conflicts.length > 0 && (
              <div className="pk-warn">
                <strong>Renamed by more than one pack</strong>
                {conflicts.map((c) => (
                  <div key={c.key}>
                    <code>{c.key}</code>: {c.packs.map((p) => `“${p.label}” (${p.name})`).join(' vs ')} — <span className="pk-win">{c.packs.find((p) => p.id === c.winner)?.label}</span> wins
                    {isDm ? ' (move a pack later to change it)' : ''}
                  </div>
                ))}
              </div>
            )}
            {enabled.map((pack, index) => {
              const inLibrary = libraryById.get(pack.id)
              const canUpdate = isDm && inLibrary && inLibrary.version !== pack.version
              return (
                <PackRow
                  key={pack.id}
                  pack={pack}
                  order={enabled.length > 1 ? index + 1 : undefined}
                  badge="On"
                  actions={
                    isDm ? (
                      <>
                        {enabled.length > 1 && (
                          <>
                            <button type="button" className="gb-btn gb-btn--ghost" disabled={busy || index === 0} onClick={() => run(() => campaignAction(window.goblin.campaignPacks.move(campaign.id, pack.id, -1)))} title="Load earlier" style={orderButton}>
                              <ArrowUpIcon size={12} />
                            </button>
                            <button type="button" className="gb-btn gb-btn--ghost" disabled={busy || index === enabled.length - 1} onClick={() => run(() => campaignAction(window.goblin.campaignPacks.move(campaign.id, pack.id, 1)))} title="Load later" style={orderButton}>
                              <ArrowDownIcon size={12} />
                            </button>
                          </>
                        )}
                        {canUpdate && (
                          <Button variant="primary" disabled={busy} onClick={() => run(() => campaignAction(window.goblin.campaignPacks.enable(campaign.id, pack.id)))} style={smallButton} title="Players get the new version, and their sheets flag what changed.">
                            Update to {inLibrary!.version}
                          </Button>
                        )}
                        <Button variant="secondary" disabled={busy} onClick={() => run(() => campaignAction(window.goblin.campaignPacks.disable(campaign.id, pack.id)))} style={smallButton} title="Sheets keep what they picked from it — enabling it again restores everything.">
                          Turn off
                        </Button>
                      </>
                    ) : undefined
                  }
                />
              )
            })}
            {isDm && notEnabled.length > 0 && (
              <>
                <div className="pk-sub">Turn on from your library</div>
                {notEnabled.map(({ pack }) => (
                  <PackRow
                    key={pack.id}
                    pack={pack}
                    actions={
                      <Button variant="primary" disabled={busy} onClick={() => run(() => campaignAction(window.goblin.campaignPacks.enable(campaign.id, pack.id)))} style={smallButton}>
                        Turn on
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
              <PlusIcon size={12} />
              Import a pack
            </Button>
          }
        >
          {importResult && <ImportSummary result={importResult} onDismiss={() => setImportResult(null)} />}
          {library.packs && libraryPacks.length === 0 && (
            <div className="pk-empty">
              <strong>No packs yet</strong>
              <span>Import a .ngpack.json file someone shared with you, or make your own in the Homebrew Workshop (the hammer next to DM and Player mode).</span>
            </div>
          )}
          {libraryPacks.map(({ pack }) => (
            <PackRow
              key={pack.id}
              pack={pack}
              badge={enabled.some((e) => e.id === pack.id) ? 'In this campaign' : undefined}
              quietBadge
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
    <section className="pk-section">
      <div className="pk-section-head">
        <h3>{title}</h3>
        {action}
      </div>
      <div className="pk-list">{children}</div>
    </section>
  )
}

function PackRow({ pack, badge, quietBadge, order, actions }: { pack: ContentPack; badge?: string; quietBadge?: boolean; order?: number; actions?: ReactNode }): JSX.Element {
  const needs = pack.dependsOn.filter((d) => d !== 'srd-5.2.1')
  return (
    <div className={`pk-card${badge && !quietBadge ? ' pk-card--on' : ''}`}>
      <span className="pk-tile" aria-hidden="true">
        {order ?? pack.name.trim().charAt(0).toUpperCase()}
      </span>
      <div className="pk-info">
        <div className="pk-title">
          <strong>{pack.name}</strong>
          <span className="pk-version">
            v{pack.version}
            {pack.author ? ` · ${pack.author}` : ''}
          </span>
          {badge && <span className={quietBadge ? 'pk-badge pk-badge--quiet' : 'pk-badge'}>{badge}</span>}
        </div>
        <div className="pk-contents">{describePackContents(pack)}</div>
        {pack.description && <div className="pk-desc">{pack.description}</div>}
        {needs.length > 0 && <div className="pk-desc">Needs: {needs.join(', ')}</div>}
      </div>
      {actions && <div className="pk-actions">{actions}</div>}
    </div>
  )
}

export function ImportSummary({ result, onDismiss }: { result: PackImportResult; onDismiss: () => void }): JSX.Element {
  return (
    <div className="pk-import">
      {result.imported.map(({ pack, replaced, warnings }) => (
        <div key={pack.id}>
          <span className="pk-win">{replaced ? 'Updated' : 'Imported'}</span> {pack.name} v{pack.version}
          {warnings.length > 0 && (
            <ul>
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
          <span className="pk-bad">Couldn’t import</span> {fileName}
          <ul>
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
        <button type="button" className="gb-btn gb-btn--ghost pk-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

function Muted({ children }: { children: ReactNode }): JSX.Element {
  return <p className="pk-muted">{children}</p>
}

const smallButton = { fontSize: 12, padding: '5px 10px' } as const
const orderButton = { padding: '4px 6px', display: 'inline-flex' } as const
