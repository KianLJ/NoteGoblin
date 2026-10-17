import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ContentPack } from '@shared/content/schema'
import type { EntryKind } from '@shared/content/registry'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'
import { validatePack, type PackIssue, type PackValidation } from '@shared/content/validate'
import { buildRegistry, type Registry } from '@shared/content/registry'
import { deriveCharacter } from '@shared/content/engine'
import {
  WORKSHOP_SECTIONS,
  nameLookup,
  copyEntry,
  packsForTesting,
  rollTargetChoices,
  statChoices,
  suggestionLists,
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
import { explainIssue } from '@shared/content/issueText'
import { Button } from '../../ui/Button'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { PlusIcon, XIcon } from '../../ui/icons'
import { JsonEditor } from './JsonEditor'
import { TestCharacterPanel, buildFromSetup, defaultTestSetup, setupLabel, type TestSetup } from './TestCharacterPanel'
import { TestSummary } from './TestSummary'
import { FormContext, Suggestions, type WorkshopFormContext } from './form/fields'
import { EntryForm } from './form/entries'
import { TerminologyForm, VocabularyForm } from './form/vocabulary'

type View = 'form' | 'json'
const SIDE_KEY = 'gb-workshop-test-panel-collapsed'
const SIDE_WIDTH_KEY = 'gb-workshop-test-panel-width'
const ADVANCED_KEY = 'gb-workshop-advanced'

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

  // The registry the test character and formula previews use: the SRD, what the pack builds on, and the pack.
  const registry: Registry | null = useMemo(() => (lastValid ? buildRegistry([srdPack(), ...packsForTesting(lastValid, others)]) : null), [lastValid, others])
  const baseRegistry = useMemo(() => buildRegistry([srdPack(), ...others]), [others])
  const [setup, setSetup] = useState<TestSetup | null>(null)
  const [viewChoice, setView] = useState<View>('form')
  // Simple mode (the default) hides rarely needed fields and the JSON views; remembered on this device.
  const [advanced, setAdvancedState] = useState(() => {
    try {
      return localStorage.getItem(ADVANCED_KEY) === '1'
    } catch {
      return false
    }
  })
  const setAdvanced = (on: boolean): void => {
    setAdvancedState(on)
    try {
      localStorage.setItem(ADVANCED_KEY, on ? '1' : '0')
    } catch {
      /* per-device convenience only */
    }
    if (!on && tab === 'json') setTab('overview')
  }
  const view: View = advanced ? viewChoice : 'form'

  // Formula previews evaluate against the test character — as the class being edited, when it's a class or subclass.
  const selectedEntry = selected ? entriesOf(settled, selected.kind)[selected.index] : undefined
  const formContext: WorkshopFormContext = useMemo(() => {
    const reg = registry ?? baseRegistry
    const lists = suggestionLists(reg, settled)
    const pickers = { stats: statChoices(reg, settled), rolls: rollTargetChoices(reg), names: nameLookup(reg, settled) }
    if (!registry || !lastValid) return { previewLabel: '', lists, advanced, ...pickers }
    let s = setup ?? defaultTestSetup(registry, lastValid.id)
    if (selected?.kind === 'classes' && selectedEntry) {
      const cls = registry.get('classes', `${lastValid.id}:${String(selectedEntry.id ?? '')}`)
      if (cls) s = { ...s, classId: cls.fullId, subclassId: '' }
    } else if (selected?.kind === 'subclasses' && selectedEntry) {
      const sub = registry.get('subclasses', `${lastValid.id}:${String(selectedEntry.id ?? '')}`)
      const cls = sub ? registry.get('classes', sub.def.classId, sub.packId) : undefined
      if (sub && cls) s = { ...s, classId: cls.fullId, subclassId: sub.fullId, level: Math.max(s.level, cls.def.subclassLevel) }
    }
    const derived = deriveCharacter(buildFromSetup(s, registry), registry, { keepEvaluator: true })
    return { evaluate: derived.evaluate, previewLabel: setupLabel(s, registry), lists, advanced, ...pickers }
  }, [registry, baseRegistry, lastValid, settled, setup, selected, selectedEntry, advanced])

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
        {TABS.filter((t) => advanced || t.id !== 'json').map((t) => (
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
        <label style={{ marginLeft: 'auto', alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }} title="Advanced shows every field, plus the JSON views">
          <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
          Advanced
        </label>
      </div>

      <FormContext.Provider value={formContext}>
      <Suggestions />
      <div style={{ flex: 1, minHeight: 0, overflow: tab === 'entries' ? 'hidden' : 'auto', padding: tab === 'entries' ? 0 : 'var(--space-4) var(--space-5)' }}>
        {tab === 'overview' && (
          <Overview
            draft={draft}
            others={library.filter((p) => p.id !== storedId)}
            issues={issues}
            onSet={set}
            onOpenIssue={openIssue}
            onOpenSection={(kind) => {
              setSelected(entriesOf(draft, kind).length ? { kind, index: 0 } : null)
              setTab('entries')
            }}
            onFix={onChange}
            onAdd={(kind) => {
              const result = addEntry(draft, kind)
              onChange(result.draft)
              setSelected({ kind, index: result.index })
              setTab('entries')
            }}
          />
        )}
        {tab === 'entries' && (
          <Entries
            draft={draft}
            issues={issues}
            selected={selected}
            onSelect={setSelected}
            onChange={onChange}
            view={view}
            onView={advanced ? setView : undefined}
            sources={registry ?? baseRegistry}
            advanced={advanced}
            side={<TestSummary registry={registry} packId={String(lastValid?.id ?? draft.id)} setup={setup} onSetup={setSetup} hasErrors={errors.length > 0} />}
          />
        )}
        {tab === 'vocabulary' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {advanced && <ViewToggle view={view} onView={setView} />}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--space-4)', alignItems: 'start' }}>
              <Panel title="Vocabulary" hint="Skills, custom stats, counters, ability aliases, damage types, conditions, senses, action types, weapon properties, spell schools and currencies this pack adds.">
                {view === 'form' ? (
                  <VocabularyForm value={(draft.vocabulary ?? {}) as Record<string, unknown>} onChange={(v) => set({ vocabulary: v as PackDraft['vocabulary'] })} />
                ) : (
                  <JsonEditor value={draft.vocabulary ?? {}} onChange={(v) => set({ vocabulary: v as PackDraft['vocabulary'] })} minHeight={420} />
                )}
                <IssueList issues={issues.filter((i) => i.path.startsWith('vocabulary'))} draft={draft} onFix={onChange} />
              </Panel>
              <Panel title="Terminology" hint="Renames shown in the app — the rules don't change.">
                {view === 'form' ? (
                  <TerminologyForm value={(draft.terminology ?? {}) as Record<string, unknown>} onChange={(v) => set({ terminology: v as PackDraft['terminology'] })} />
                ) : (
                  <JsonEditor value={draft.terminology ?? {}} onChange={(v) => set({ terminology: v as PackDraft['terminology'] })} minHeight={420} />
                )}
                <IssueList issues={issues.filter((i) => i.path.startsWith('terminology'))} draft={draft} onFix={onChange} />
              </Panel>
            </div>
          </div>
        )}
        {tab === 'test' && <TestCharacterPanel pack={lastValid} registry={registry} setup={setup} onSetup={setSetup} hasErrors={errors.length > 0} />}
        {tab === 'json' && (
          <Panel title="The whole pack" hint="Everything above, as one JSON document — paste a pack in here, or make sweeping edits.">
            <JsonEditor value={draft} onChange={(v) => v && typeof v === 'object' && onChange(v as PackDraft)} minHeight={560} />
            <IssueList issues={issues} draft={draft} onFix={onChange} onOpen={openIssue} />
          </Panel>
        )}
      </div>
      </FormContext.Provider>
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
  onOpenSection,
  onAdd,
  onFix
}: {
  draft: PackDraft
  others: ContentPack[]
  issues: PackIssue[]
  onSet: (fields: Partial<PackDraft>) => void
  onOpenIssue: (issue: PackIssue) => void
  onOpenSection: (kind: EntryKind) => void
  onAdd: (kind: EntryKind) => void
  onFix: (draft: PackDraft) => void
}): JSX.Element {
  const dependsOn = draft.dependsOn ?? []
  const empty = WORKSHOP_SECTIONS.every((s) => entriesOf(draft, s.kind).length === 0)
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
        {empty && (
          <Panel title="Start with…" hint="Pick what to make first. You can add anything else later from the Entries tab.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
              {STARTERS.map((st) => (
                <button key={st.kind} type="button" className="gb-card" onClick={() => onAdd(st.kind)} style={{ padding: '8px 10px', textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{st.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{st.hint}</div>
                </button>
              ))}
            </div>
          </Panel>
        )}
        <Panel title="Contents">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
            {WORKSHOP_SECTIONS.map((s) => {
              const count = entriesOf(draft, s.kind).length
              return (
                <button key={s.kind} type="button" className="gb-card" onClick={() => onOpenSection(s.kind)} title={s.description} style={{ padding: '6px 10px', textAlign: 'left', cursor: 'pointer', opacity: count ? 1 : 0.6 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{count}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
                </button>
              )
            })}
          </div>
        </Panel>
        <Panel title="Problems">
          {issues.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>None — this pack is ready to save.</p> : <IssueList issues={issues} draft={draft} onFix={onFix} onOpen={onOpenIssue} />}
        </Panel>
      </div>
    </div>
  )
}

function ViewToggle({ view, onView }: { view: View; onView: (v: View) => void }): JSX.Element {
  return (
    <div style={{ display: 'inline-flex', padding: 2, borderRadius: 'var(--radius-sm)', background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', alignSelf: 'flex-start' }}>
      {(['form', 'json'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onView(v)}
          style={{
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '3px 10px',
            fontSize: 11,
            cursor: 'pointer',
            background: view === v ? 'var(--bg-surface-raised)' : 'transparent',
            color: view === v ? 'var(--accent)' : 'var(--text-muted)'
          }}
        >
          {v === 'form' ? 'Form' : 'JSON'}
        </button>
      ))}
    </div>
  )
}

function Entries({
  draft,
  issues,
  selected,
  onSelect,
  onChange,
  view,
  onView,
  sources,
  advanced,
  side
}: {
  draft: PackDraft
  issues: PackIssue[]
  selected: { kind: EntryKind; index: number } | null
  onSelect: (s: { kind: EntryKind; index: number } | null) => void
  onChange: (draft: PackDraft) => void
  view: View
  /** Absent in Simple mode — there's only the form. */
  onView?: (v: View) => void
  /** Everything that can be copied from: the SRD, the library packs this one can see, and this pack. */
  sources: Registry
  advanced: boolean
  /** The test character summary, shown beside the editor. */
  side: ReactNode
}): JSX.Element {
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState<EntryKind | null>(null)
  const entry = selected ? entriesOf(draft, selected.kind)[selected.index] : undefined
  const q = filter.trim().toLowerCase()
  const section = selected ? WORKSHOP_SECTIONS.find((s) => s.kind === selected.kind) : undefined

  function add(kind: EntryKind): void {
    const result = addEntry(draft, kind)
    onChange(result.draft)
    onSelect({ kind, index: result.index })
    setAdding(null)
  }

  function copy(kind: EntryKind, source: { def: unknown; fullId: string; packId: string }, asOverride: boolean): void {
    const result = copyEntry(draft, kind, source, asOverride)
    onChange(result.draft)
    onSelect({ kind, index: result.index })
    setAdding(null)
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
                  <span className="gb-label" style={{ margin: 0, flex: 1, fontSize: 11 }} title={s.description}>
                    {s.label} <span style={{ color: 'var(--text-muted)' }}>{list.length || ''}</span>
                  </span>
                  <button type="button" onClick={() => setAdding(adding === s.kind ? null : s.kind)} title={`Add a ${s.singular}`} style={iconButton}>
                    <PlusIcon size={12} />
                  </button>
                </div>
                {adding === s.kind && (
                  <AddEntryPanel
                    singular={s.singular}
                    description={s.description}
                    candidates={sources.all(s.kind).filter((e) => e.packId !== String(draft.id))}
                    packName={(id) => (id === SRD_PACK_ID ? 'SRD' : (sources.packs.find((p) => p.id === id)?.name ?? id))}
                    advanced={advanced}
                    onBlank={() => add(s.kind)}
                    onCopy={(source, asOverride) => copy(s.kind, source, asOverride)}
                    onClose={() => setAdding(null)}
                  />
                )}
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
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, maxWidth: 640 }}>{section.description}</div>
              </div>
              {onView && <ViewToggle view={view} onView={onView} />}
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
            <IssueList issues={issuesOfEntry(issues, selected.kind, selected.index)} draft={draft} onFix={onChange} withinEntry />
            {view === 'form' ? (
              <EntryForm
                key={`${selected.kind}:${selected.index}`}
                kind={selected.kind}
                value={entry}
                packId={String(draft.id)}
                onChange={(v) => onChange(replaceEntry(draft, selected.kind, selected.index, v))}
              />
            ) : (
              <JsonEditor
                key={`${selected.kind}:${selected.index}`}
                value={entry}
                onChange={(v) => v && typeof v === 'object' && !Array.isArray(v) && onChange(replaceEntry(draft, selected.kind, selected.index, v as Record<string, unknown>))}
                style={{ flex: 1 }}
              />
            )}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pick an entry on the left, or add one with the plus button next to a section. Formulas show what they work out to for the test character on the right.</p>
        )}
      </div>

      {/* The test character: drag its left edge to resize, or fold it away with its tab; both remembered on this device. */}
      <ResizableSidebar handleSide="left" defaultWidth={260} minWidth={200} maxWidth={560} collapseStorageKey={SIDE_KEY} widthStorageKey={SIDE_WIDTH_KEY}>
        <aside style={{ height: '100%', borderLeft: '1px solid var(--border-subtle)', padding: 'var(--space-3)', overflowY: 'auto', boxSizing: 'border-box' }}>
          <div className="gb-label" style={{ margin: '0 0 8px' }}>
            Test character
          </div>
          {side}
        </aside>
      </ResizableSidebar>
    </div>
  )
}

/** Adding an entry: start blank, or from a copy of any SRD or library entry of that kind (or, in Advanced mode, replace one outright). */
function AddEntryPanel({
  singular,
  description,
  candidates,
  packName,
  advanced,
  onBlank,
  onCopy,
  onClose
}: {
  singular: string
  description: string
  candidates: Array<{ def: unknown; fullId: string; packId: string }>
  packName: (id: string) => string
  advanced: boolean
  onBlank: () => void
  onCopy: (source: { def: unknown; fullId: string; packId: string }, asOverride: boolean) => void
  onClose: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const nameOf = (c: { def: unknown }): string => String((c.def as { name?: unknown }).name ?? '')
  const shown = candidates
    .filter((c) => !q || nameOf(c).toLowerCase().includes(q))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    .slice(0, 40)
  return (
    <div className="gb-card" style={{ margin: '4px 4px 6px', padding: 6, display: 'flex', flexDirection: 'column', gap: 4, borderColor: 'var(--accent)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{description}</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <Button variant="primary" onClick={onBlank} style={{ fontSize: 11, padding: '3px 8px', flex: 1 }}>
          Blank {singular}
        </Button>
        <button type="button" onClick={onClose} title="Close" style={iconButton}>
          <XIcon size={11} />
        </button>
      </div>
      {candidates.length > 0 && (
        <>
          <input className="gb-input" placeholder={`…or copy one (${candidates.length})`} value={query} onChange={(e) => setQuery(e.target.value)} style={{ fontSize: 11, padding: '3px 6px' }} autoFocus />
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {shown.map((c) => (
              <div key={c.fullId} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 0' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.fullId}>
                  {nameOf(c)} <span style={{ color: 'var(--text-muted)' }}>· {packName(c.packId)}</span>
                </span>
                <button type="button" className="gb-btn gb-btn--secondary" onClick={() => onCopy(c, false)} style={{ fontSize: 10, padding: '1px 6px' }} title="A copy to change as you like">
                  Copy
                </button>
                {advanced && (
                  <button type="button" className="gb-btn gb-btn--ghost" onClick={() => onCopy(c, true)} style={{ fontSize: 10, padding: '1px 6px' }} title="Replace the original wherever it's used (an override)">
                    Replace
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Problems in plain English (explainIssue), errors first, each with its place, and a Fix button where there's an obvious fix. */
function IssueList({
  issues,
  draft,
  onFix,
  onOpen,
  withinEntry
}: {
  issues: PackIssue[]
  draft: PackDraft
  /** Applies a fix to the draft. */
  onFix?: (next: PackDraft) => void
  /** Jumps to where the problem is. */
  onOpen?: (issue: PackIssue) => void
  /** The reader is already looking at that entry — leave out its name. */
  withinEntry?: boolean
}): JSX.Element | null {
  if (issues.length === 0) return null
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.slice(0, 60).map((issue, i) => {
        const e = explainIssue(issue, draft, withinEntry)
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 12,
              padding: '4px 8px',
              borderLeft: `3px solid ${issue.severity === 'error' ? 'var(--danger)' : 'var(--warning, #d4a017)'}`,
              background: 'var(--bg-sunken)',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {e.where &&
                (onOpen ? (
                  <button type="button" onClick={() => onOpen({ ...issue, path: e.path })} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-primary)', cursor: 'pointer', font: 'inherit', fontWeight: 700, textAlign: 'left' }}>
                    {e.where}
                  </button>
                ) : (
                  <strong>{e.where}</strong>
                ))}
              <div style={{ color: 'var(--text-secondary)' }}>{e.message}</div>
            </div>
            {e.fix && onFix && (
              <button type="button" className="gb-btn gb-btn--secondary" onClick={() => onFix(e.fix!.apply(draft))} style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}>
                {e.fix.label}
              </button>
            )}
          </div>
        )
      })}
      {sorted.length > 60 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>…and {sorted.length - 60} more</div>}
    </div>
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

/** The empty pack's "Start with…" shortcuts, simplest first. */
/** The issues inside one entry, paths kept whole (so their fixes address the draft). */
const issuesOfEntry = (issues: PackIssue[], kind: EntryKind, index: number): PackIssue[] => {
  const prefix = `${kind}[${index}]`
  return issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`) || i.path.startsWith(`${prefix}[`))
}

const STARTERS: Array<{ kind: EntryKind; label: string; hint: string }> = [
  { kind: 'feats', label: 'A feat', hint: 'A bonus, a proficiency, a new ability' },
  { kind: 'spells', label: 'A spell', hint: 'Damage, healing, an ongoing buff' },
  { kind: 'items', label: 'An item', hint: 'A weapon, armor or magic item' },
  { kind: 'species', label: 'A species', hint: 'Speed, size and traits' },
  { kind: 'backgrounds', label: 'A background', hint: 'Features from a past life' },
  { kind: 'classes', label: 'A class', hint: 'Hit points, a level table, features' },
  { kind: 'archetypes', label: 'An archetype', hint: 'A bloodline or patron any class can take' },
  { kind: 'monsters', label: 'A creature', hint: 'A statblock for the DM' }
]

const smallButton = { fontSize: 12, padding: '4px 10px' } as const
const checkStyle = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 } as const
const iconButton = { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'inline-flex' } as const
