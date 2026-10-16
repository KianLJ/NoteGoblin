import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ContentPack } from '@shared/content/schema'
import type { EntryKind } from '@shared/content/registry'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'
import { validatePack, type PackIssue, type PackValidation } from '@shared/content/validate'
import {
  WORKSHOP_SECTIONS,
  addEntry,
  bumpVersion,
  duplicateEntry,
  entriesOf,
  issueTarget,
  issuesForEntry,
  removeEntry,
  replaceEntry,
  type PackDraft
} from '@shared/content/workshop'
import { Button } from '../../ui/Button'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { PlusIcon } from '../../ui/icons'
import { JsonEditor } from './JsonEditor'
import { TestCharacterPanel } from './TestCharacterPanel'

type Tab = 'overview' | 'entries' | 'vocabulary' | 'test' | 'json'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'entries', label: 'Entries' },
  { id: 'vocabulary', label: 'Vocabulary & terms' },
  { id: 'test', label: 'Test character' },
  { id: 'json', label: 'Raw JSON' }
]

/** Waits until `value` has stopped changing for `ms` — validation and the test character re-run on a pause in typing, not every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/**
 * One pack in the Workshop: its overview (name, id, version, what it needs),
 * every entry as validated JSON, its vocabulary and terminology, a test
 * character, and the whole pack as raw JSON. Edits stay a draft until
 * Save, which validates the pack again in the main process before storing
 * it; a pack with errors can't be saved.
 */
export function PackEditor({
  draft,
  storedId,
  dirty,
  library,
  onChange,
  onSaved,
  onDiscard,
  onDuplicate,
  onRemoved
}: {
  draft: PackDraft
  storedId: string
  dirty: boolean
  /** Every library pack (this one's stored copy included). */
  library: ContentPack[]
  onChange: (draft: PackDraft) => void
  onSaved: (pack: ContentPack) => void
  onDiscard: () => void
  onDuplicate: () => void
  onRemoved: () => void
}): JSX.Element {
  const [tab, setTab] = useState<Tab>('overview')
  const [selected, setSelected] = useState<{ kind: EntryKind; index: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const others = useMemo(() => library.filter((p) => p.id !== storedId && p.id !== draft.id), [library, storedId, draft.id])
  const settled = useDebounced(draft, 300)
  const validation: PackValidation = useMemo(() => validatePack(settled, [srdPack(), ...others]), [settled, others])
  const issues = validation.issues
  const errors = issues.filter((i) => i.severity === 'error')

  // The last version that validated — the test character keeps using it while the draft has errors.
  const [lastValid, setLastValid] = useState<ContentPack | null>(null)
  useEffect(() => {
    if (validation.ok) setLastValid(validation.pack)
  }, [validation])

  async function save(): Promise<void> {
    setBusy(true)
    setMessage(null)
    const result = await window.goblin.packs.save(draft, storedId)
    setBusy(false)
    if (!result.ok) return setMessage({ kind: 'error', text: result.error })
    if (!result.data.saved) return setMessage({ kind: 'error', text: `Not saved — ${result.data.issues.filter((i) => i.severity === 'error').length || result.data.issues.length} problem(s) to fix first.` })
    setMessage({ kind: 'ok', text: `Saved ${result.data.pack.name} v${result.data.pack.version}.` })
    onSaved(result.data.pack)
  }

  function openIssue(issue: PackIssue): void {
    const target = issueTarget(issue.path)
    if ('kind' in target) {
      setSelected(target)
      setTab('entries')
    } else setTab(target.section === 'metadata' ? 'overview' : 'vocabulary')
  }

  const set = (fields: Partial<PackDraft>): void => onChange({ ...draft, ...fields })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: 'var(--space-3) var(--space-5) 0', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{String(draft.name || 'Untitled Pack')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {String(draft.id)} · v{String(draft.version ?? '1.0.0')}
            {dirty ? ' · unsaved changes' : ''}
          </div>
        </div>
        <StatusBadge errors={errors.length} warnings={issues.length - errors.length} pending={settled !== draft} />
        {dirty && (
          <Button variant="ghost" disabled={busy} onClick={onDiscard} style={smallButton} title="Throw away unsaved changes">
            Discard
          </Button>
        )}
        <Button variant="primary" disabled={busy || !dirty || errors.length > 0 || settled !== draft} onClick={save} style={smallButton} title={errors.length ? 'Fix the errors first' : undefined}>
          Save
        </Button>
        <Button variant="secondary" disabled={busy || dirty} onClick={() => window.goblin.packs.exportPack(storedId)} style={smallButton} title={dirty ? 'Save first — export writes the saved pack' : 'Save as a .ngpack.json file to share'}>
          Export…
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onDuplicate} style={smallButton} title="A copy under a new id">
          Duplicate
        </Button>
        <ConfirmButton
          label="Delete"
          confirmLabel="Delete from library"
          danger
          variant="ghost"
          disabled={busy}
          style={smallButton}
          title="Removes it from your library — campaigns that enabled it keep their copy."
          onConfirm={async () => {
            const result = await window.goblin.packs.remove(storedId)
            if (result.ok) onRemoved()
            else setMessage({ kind: 'error', text: result.error })
          }}
        />
      </div>
      {message && <div style={{ padding: '4px var(--space-5) 0', fontSize: 12, color: message.kind === 'error' ? 'var(--danger)' : 'var(--accent)' }}>{message.text}</div>}

      <div style={{ display: 'flex', gap: 'var(--space-2)', padding: '0 var(--space-5)', marginTop: 'var(--space-3)', borderBottom: '1px solid var(--border-subtle)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
              color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
              padding: '6px 4px',
              marginBottom: -1,
              cursor: 'pointer',
              fontSize: 13
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: tab === 'entries' ? 'hidden' : 'auto', padding: tab === 'entries' ? 0 : 'var(--space-4) var(--space-5)' }}>
        {tab === 'overview' && <Overview draft={draft} others={library.filter((p) => p.id !== storedId)} issues={issues} onSet={set} onOpenIssue={openIssue} onOpenSection={(kind) => {
          setSelected(entriesOf(draft, kind).length ? { kind, index: 0 } : null)
          setTab('entries')
        }} />}
        {tab === 'entries' && <Entries draft={draft} issues={issues} selected={selected} onSelect={setSelected} onChange={onChange} />}
        {tab === 'vocabulary' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-4)' }}>
            <Panel title="Vocabulary" hint="Skills, damage types, conditions, currencies, custom stats, action types, weapon properties, spell schools, counters, ability aliases and senses this pack adds.">
              <JsonEditor value={draft.vocabulary ?? {}} onChange={(v) => set({ vocabulary: v as PackDraft['vocabulary'] })} minHeight={420} />
              <IssueList issues={issues.filter((i) => i.path.startsWith('vocabulary'))} />
            </Panel>
            <Panel title="Terminology" hint={'Renames shown in the app, e.g. { "spellSlots": "Technique Slots", "ability.cha": "Cursed Energy Control" }.'}>
              <JsonEditor value={draft.terminology ?? {}} onChange={(v) => set({ terminology: v as PackDraft['terminology'] })} minHeight={420} />
              <IssueList issues={issues.filter((i) => i.path.startsWith('terminology'))} />
            </Panel>
          </div>
        )}
        {tab === 'test' && <TestCharacterPanel pack={lastValid} others={others} hasErrors={errors.length > 0} />}
        {tab === 'json' && (
          <Panel title="The whole pack" hint="Everything above, as one JSON document — paste a pack in here, or make sweeping edits.">
            <JsonEditor value={draft} onChange={(v) => v && typeof v === 'object' && onChange(v as PackDraft)} minHeight={560} />
            <IssueList issues={issues} onOpen={openIssue} />
          </Panel>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ errors, warnings, pending }: { errors: number; warnings: number; pending: boolean }): JSX.Element {
  const text = pending ? 'Checking…' : errors ? `${errors} error${errors === 1 ? '' : 's'}` : warnings ? `${warnings} warning${warnings === 1 ? '' : 's'}` : 'No problems'
  const color = pending ? 'var(--text-muted)' : errors ? 'var(--danger)' : warnings ? 'var(--warning, #d4a017)' : 'var(--accent)'
  return <span style={{ fontSize: 12, color, minWidth: 80, textAlign: 'right' }}>{text}</span>
}

function Overview({
  draft,
  others,
  issues,
  onSet,
  onOpenIssue,
  onOpenSection
}: {
  draft: PackDraft
  others: ContentPack[]
  issues: PackIssue[]
  onSet: (fields: Partial<PackDraft>) => void
  onOpenIssue: (issue: PackIssue) => void
  onOpenSection: (kind: EntryKind) => void
}): JSX.Element {
  const dependsOn = draft.dependsOn ?? []
  const toggleDep = (id: string): void => onSet({ dependsOn: dependsOn.includes(id) ? dependsOn.filter((d) => d !== id) : [...dependsOn, id] })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)', alignItems: 'start' }}>
      <Panel title="Details">
        <Field label="Name">
          <input className="gb-input" value={String(draft.name ?? '')} onChange={(e) => onSet({ name: e.target.value })} />
        </Field>
        <Field label="Id" hint="How sheets and other packs refer to this one. Changing it after players use the pack breaks their references.">
          <input className="gb-input" value={String(draft.id ?? '')} onChange={(e) => onSet({ id: e.target.value.trim() })} />
        </Field>
        <Field label="Version" hint="Bump it before the DM updates a campaign, so sheets can flag what changed.">
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="gb-input" value={String(draft.version ?? '')} onChange={(e) => onSet({ version: e.target.value })} style={{ flex: 1 }} />
            {(['patch', 'minor', 'major'] as const).map((part) => (
              <Button key={part} variant="secondary" onClick={() => onSet({ version: bumpVersion(String(draft.version ?? '1.0.0'), part) })} style={smallButton} title={`Bump the ${part} version`}>
                +{part}
              </Button>
            ))}
          </div>
        </Field>
        <Field label="Author">
          <input className="gb-input" value={String(draft.author ?? '')} onChange={(e) => onSet({ author: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea className="gb-input" value={String(draft.description ?? '')} onChange={(e) => onSet({ description: e.target.value })} style={{ minHeight: 70, resize: 'vertical' }} />
        </Field>
        <Field label="Builds on" hint="Packs this one references or overrides. Campaigns must enable them first.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={checkStyle}>
              <input type="checkbox" checked={dependsOn.includes(SRD_PACK_ID)} onChange={() => toggleDep(SRD_PACK_ID)} />
              SRD 5.2.1 (built in)
            </label>
            {others.map((p) => (
              <label key={p.id} style={checkStyle}>
                <input type="checkbox" checked={dependsOn.includes(p.id)} onChange={() => toggleDep(p.id)} />
                {p.name} <span style={{ color: 'var(--text-muted)' }}>({p.id})</span>
              </label>
            ))}
            {dependsOn
              .filter((d) => d !== SRD_PACK_ID && !others.some((p) => p.id === d))
              .map((d) => (
                <label key={d} style={{ ...checkStyle, color: 'var(--danger)' }}>
                  <input type="checkbox" checked onChange={() => toggleDep(d)} />
                  {d} (not in your library)
                </label>
              ))}
          </div>
        </Field>
      </Panel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Panel title="Contents">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
            {WORKSHOP_SECTIONS.map((s) => {
              const count = entriesOf(draft, s.kind).length
              return (
                <button key={s.kind} type="button" className="gb-card" onClick={() => onOpenSection(s.kind)} style={{ padding: '6px 10px', textAlign: 'left', cursor: 'pointer', opacity: count ? 1 : 0.6 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{count}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
                </button>
              )
            })}
          </div>
        </Panel>
        <Panel title="Problems">
          {issues.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>None — this pack validates.</p> : <IssueList issues={issues} onOpen={onOpenIssue} />}
        </Panel>
      </div>
    </div>
  )
}

function Entries({
  draft,
  issues,
  selected,
  onSelect,
  onChange
}: {
  draft: PackDraft
  issues: PackIssue[]
  selected: { kind: EntryKind; index: number } | null
  onSelect: (s: { kind: EntryKind; index: number } | null) => void
  onChange: (draft: PackDraft) => void
}): JSX.Element {
  const [filter, setFilter] = useState('')
  const entry = selected ? entriesOf(draft, selected.kind)[selected.index] : undefined
  const q = filter.trim().toLowerCase()
  const section = selected ? WORKSHOP_SECTIONS.find((s) => s.kind === selected.kind) : undefined

  function add(kind: EntryKind): void {
    const result = addEntry(draft, kind)
    onChange(result.draft)
    onSelect({ kind, index: result.index })
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <div style={{ width: 250, flexShrink: 0, borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: 'var(--space-3)' }}>
          <input className="gb-input" placeholder="Filter entries…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-2) var(--space-3)' }}>
          {WORKSHOP_SECTIONS.map((s) => {
            const list = entriesOf(draft, s.kind)
            const shown = list.map((e, index) => ({ e, index })).filter(({ e }) => !q || String(e.name ?? e.id ?? '').toLowerCase().includes(q))
            if (q && shown.length === 0) return null
            return (
              <div key={s.kind} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px' }}>
                  <span className="gb-label" style={{ margin: 0, flex: 1, fontSize: 11 }}>
                    {s.label} <span style={{ color: 'var(--text-muted)' }}>{list.length || ''}</span>
                  </span>
                  <button type="button" onClick={() => add(s.kind)} title={`Add a ${s.singular}`} style={iconButton}>
                    <PlusIcon size={12} />
                  </button>
                </div>
                {shown.map(({ e, index }) => {
                  const active = selected?.kind === s.kind && selected.index === index
                  const own = issuesForEntry(issues, s.kind, index)
                  const hasError = own.some((i) => i.severity === 'error')
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => onSelect({ kind: s.kind, index })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: 12,
                        background: active ? 'var(--bg-surface-raised)' : 'transparent',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(e.name ?? e.id ?? '(unnamed)')}</span>
                      {own.length > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: hasError ? 'var(--danger)' : 'var(--warning, #d4a017)', flexShrink: 0 }} />}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 'var(--space-4) var(--space-5)' }}>
        {selected && entry && section ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 15 }}>{String(entry.name ?? entry.id)}</strong>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {section.singular} · {String(draft.id)}:{String(entry.id ?? '')}
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  const result = duplicateEntry(draft, selected.kind, selected.index)
                  onChange(result.draft)
                  onSelect({ kind: selected.kind, index: result.index })
                }}
                style={smallButton}
              >
                Duplicate
              </Button>
              <ConfirmButton
                label="Delete"
                confirmLabel="Delete entry"
                danger
                variant="ghost"
                style={smallButton}
                onConfirm={() => {
                  onChange(removeEntry(draft, selected.kind, selected.index))
                  onSelect(null)
                }}
              />
            </div>
            <JsonEditor
              key={`${selected.kind}:${selected.index}`}
              value={entry}
              onChange={(v) => v && typeof v === 'object' && !Array.isArray(v) && onChange(replaceEntry(draft, selected.kind, selected.index, v as Record<string, unknown>))}
              style={{ flex: 1 }}
            />
            <IssueList issues={issuesForEntry(issues, selected.kind, selected.index)} />
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pick an entry on the left, or add one with the plus button next to a section. Form editors for each kind are coming next; for now entries are edited as JSON, checked as you type.</p>
        )}
      </div>
    </div>
  )
}

function IssueList({ issues, onOpen }: { issues: PackIssue[]; onOpen?: (issue: PackIssue) => void }): JSX.Element | null {
  if (issues.length === 0) return null
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {sorted.slice(0, 60).map((issue, i) => (
        <li key={i} style={{ color: issue.severity === 'error' ? 'var(--danger)' : 'var(--text-secondary)' }}>
          {onOpen ? (
            <button type="button" onClick={() => onOpen(issue)} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
              {issue.path && <code style={{ fontSize: 11 }}>{issue.path}</code>} {issue.message}
            </button>
          ) : (
            <>
              {issue.path && <code style={{ fontSize: 11 }}>{issue.path}</code>} {issue.message}
            </>
          )}
        </li>
      ))}
      {sorted.length > 60 && <li style={{ color: 'var(--text-muted)' }}>…and {sorted.length - 60} more</li>}
    </ul>
  )
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <div className="gb-card" style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <div className="gb-label" style={{ margin: 0 }}>
          {title}
        </div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</span>}
    </div>
  )
}

const smallButton = { fontSize: 12, padding: '4px 10px' } as const
const checkStyle = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 } as const
const iconButton = { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'inline-flex' } as const
