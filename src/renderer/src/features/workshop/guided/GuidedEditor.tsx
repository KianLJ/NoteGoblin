import { useEffect, useMemo, useState } from 'react'
import { codexEntries } from '@shared/content/codexContent'
import { ABILITY_IDS, deriveCharacter, type CharacterBuild } from '@shared/content/engine'
import {
  GUIDED_KINDS,
  MY_HOMEBREW_ID,
  MY_HOMEBREW_NAME,
  describeAnswers,
  describeChanges,
  entryKindOf,
  placeAnswers,
  removeGuidedEntry,
  spellRolls,
  type GuidedAnswers
} from '@shared/content/guided'
import { explainIssue } from '@shared/content/issueText'
import { buildRegistry, type Registry } from '@shared/content/registry'
import type { ContentPack } from '@shared/content/schema'
import { srdPack } from '@shared/content/srd'
import { validatePack } from '@shared/content/validate'
import { entriesOf, issuesForEntry, newPackDraft, packsForTesting, rollTargetChoices, type PackDraft } from '@shared/content/workshop'
import { Button } from '../../../ui/Button'
import { ConfirmButton } from '../../../ui/ConfirmButton'
import { ArrowLeftIcon, IconLabel } from '../../../ui/icons'
import { renderStatblockHtml, type StatblockData } from '../../../statblock'
import { rollInlineDice } from '../../dice/inlineDice'
import { VehicleCard, asVehicle } from '../../vehicles/VehicleCard'
import { HomebrewDetail } from '../../bestiary/HomebrewDetail'
import { Field, Grid, NumberInput, Select } from '../form/fields'
import { GuidedForm, traitIdsFromNames, type GuidedSources } from './GuidedForms'

/** The pack a guided thing saves into: a library pack, or My Homebrew (made on its first save). */
export function packBase(library: ContentPack[], authorName: string, packId: string = MY_HOMEBREW_ID): { draft: PackDraft; storedId: string | null } {
  const stored = library.find((p) => p.id === packId) ?? library.find((p) => p.id === MY_HOMEBREW_ID)
  if (stored) return { draft: stored as unknown as PackDraft, storedId: stored.id }
  return { draft: { ...newPackDraft(MY_HOMEBREW_NAME, authorName, library.map((p) => p.id)), description: 'Things made with the Workshop’s guided forms.' }, storedId: null }
}

const LAST_PACK_KEY = 'gb-guided-pack'

/** The pack new guided things go to on this device: the last one picked, else My Homebrew. */
export function defaultGuidedPack(library: ContentPack[]): string {
  try {
    const id = localStorage.getItem(LAST_PACK_KEY)
    if (id && library.some((p) => p.id === id)) return id
  } catch {
    /* per-device convenience only */
  }
  return MY_HOMEBREW_ID
}

function rememberGuidedPack(id: string): void {
  try {
    localStorage.setItem(LAST_PACK_KEY, id)
  } catch {
    /* per-device convenience only */
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/**
 * A guided form for one thing (a magic item, weapon, armour, spell, feat or
 * species), worded the way a D&D book is, with a live Codex-style preview
 * and a test character showing what it does to a sheet. Saving puts it in
 * the My Homebrew pack; "Open in full editor" shows it in that pack's full
 * editor for anything the guided form doesn't cover.
 */
export function GuidedEditor({
  initial,
  originalId,
  packId: initialPackId,
  library,
  authorName,
  dirtyPacks,
  onSaved,
  onOpenFull,
  onDeleted,
  onBack
}: {
  initial: GuidedAnswers
  /** The id of the entry it was opened from (null for something new). */
  originalId: string | null
  /** The pack it's in (or, for something new, the one it'll be saved to — changeable until the first save). */
  packId: string
  library: ContentPack[]
  authorName: string
  /** Packs with unsaved full-editor changes — saving into one of them waits until those are saved or discarded. */
  dirtyPacks: string[]
  onSaved: (pack: ContentPack, answers: GuidedAnswers) => void
  onOpenFull: (packId: string, entryId: string | null) => void
  /** After it's been deleted from its pack. */
  onDeleted: (pack: ContentPack) => void
  onBack: () => void
}): JSX.Element {
  const [answers, setAnswers] = useState<GuidedAnswers>(initial)
  const [savedId, setSavedId] = useState<string | null>(originalId)
  const [dirty, setDirty] = useState(originalId === null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const meta = GUIDED_KINDS.find((k) => k.kind === answers.kind)!
  const entryKind = entryKindOf(answers.kind)

  const [packId, setPackId] = useState(initialPackId)
  const others = useMemo(() => library.filter((p) => p.id !== packId), [library, packId])
  const base = useMemo(() => packBase(library, authorName, packId), [library, authorName, packId])
  const packName = base.storedId ? String(base.draft.name) : MY_HOMEBREW_NAME
  const blocked = dirtyPacks.includes(packId) ? `${packName} has unsaved changes in the full editor — save or discard them there first.` : undefined
  // Where it can go: My Homebrew (even before it exists) and every pack in the library.
  const packChoices = [
    ...(library.some((p) => p.id === MY_HOMEBREW_ID) ? [] : [{ value: MY_HOMEBREW_ID, label: MY_HOMEBREW_NAME }]),
    ...library.map((p) => ({ value: p.id, label: p.name }))
  ]
  const sourcesRegistry = useMemo(() => buildRegistry([srdPack(), ...others, ...(base.storedId ? [base.draft as unknown as ContentPack] : [])]), [others, base])
  const sources: GuidedSources = useMemo(() => {
    const v = sourcesRegistry.vocabulary
    const spells = sourcesRegistry
      .all('spells')
      .map((s) => ({ id: s.fullId, name: s.def.name, description: s.def.description, meta: s.def.level === 0 ? 'Cantrip' : `Level ${s.def.level}` }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return {
      skills: v.skills.map((s) => ({ id: s.id, name: s.name })),
      spells,
      spellName: (id) => spells.find((s) => s.id === id)?.name ?? id,
      classLists: sourcesRegistry
        .all('classes')
        .filter((c) => c.def.spellcasting || c.packId !== srdPack().id)
        .map((c) => ({ id: c.def.id, name: c.def.name })),
      rolls: rollTargetChoices(sourcesRegistry)
    }
  }, [sourcesRegistry])

  // What saving would store: the answers placed into My Homebrew, checked like any pack.
  const settled = useDebounced(answers, 250)
  const preview = useMemo(() => {
    const placed = placeAnswers(base.draft, traitIdsFromNames(settled), savedId)
    const validation = validatePack(placed.draft, [srdPack(), ...others])
    const index = entriesOf(placed.draft, entryKind).findIndex((e) => e.id === placed.answers.id)
    const problems = issuesForEntry(validation.issues, entryKind, index)
      .filter((i) => i.severity === 'error')
      .map((i) => explainIssue({ ...i, path: `${entryKind}[${index}]${i.path ? `.${i.path}` : ''}` }, placed.draft, true).message)
    const packProblems = validation.issues.filter((i) => i.severity === 'error' && !i.path.startsWith(`${entryKind}[${index}]`))
    let registry: Registry | null = null
    let fullId = ''
    if (validation.ok) {
      registry = buildRegistry([srdPack(), ...packsForTesting(validation.pack, others)])
      fullId = `${validation.pack.id}:${placed.answers.id}`
    }
    const entry = index >= 0 ? entriesOf(placed.draft, entryKind)[index] : undefined
    const card = registry ? codexEntries(registry, [validation.ok ? validation.pack : (placed.draft as unknown as ContentPack)]).find((e) => e.kind === entryKind && e.fullId === fullId) : undefined
    return { placed, problems: [...problems, ...packProblems.map((i) => i.message)], registry, fullId, card, entry }
  }, [base, settled, savedId, others, entryKind])

  const set = (a: GuidedAnswers): void => {
    setAnswers(a)
    setDirty(true)
    setMessage(null)
  }

  async function remove(): Promise<void> {
    if (!savedId) return
    setBusy(true)
    setMessage(null)
    const result = await window.goblin.packs.save(removeGuidedEntry(base.draft, answers.kind, savedId), base.storedId ?? undefined)
    setBusy(false)
    if (!result.ok) return setMessage({ kind: 'error', text: result.error })
    if (!result.data.saved) return setMessage({ kind: 'error', text: 'Not deleted — the pack has a problem without it (something else may use it). Remove it in the full editor to see what.' })
    onDeleted(result.data.pack)
  }

  async function save(): Promise<void> {
    setBusy(true)
    setMessage(null)
    const placed = placeAnswers(base.draft, traitIdsFromNames(answers), savedId)
    const result = await window.goblin.packs.save(placed.draft, base.storedId ?? undefined)
    setBusy(false)
    if (!result.ok) return setMessage({ kind: 'error', text: result.error })
    if (!result.data.saved) return setMessage({ kind: 'error', text: 'Not saved — fix the problems listed on the right first.' })
    setAnswers(placed.answers)
    setSavedId(placed.answers.id)
    setDirty(false)
    setMessage({
      kind: 'ok',
      text:
        answers.kind === 'monster'
          ? `Saved to ${result.data.pack.name} — it's in your Codex, encounter builder and initiative tracker now.`
          : answers.kind === 'vehicle'
            ? `Saved to ${result.data.pack.name}. Turn the pack on for a campaign, then add the vehicle from the campaign’s Vehicles panel.`
          : `Saved to ${result.data.pack.name}. A DM can turn it on for a campaign from Content Packs.`
    })
    setPackId(result.data.pack.id)
    rememberGuidedPack(result.data.pack.id)
    onSaved(result.data.pack, placed.answers)
  }

  const names = { skill: (id: string) => sources.skills.find((s) => s.id === id)?.name ?? id, spell: sources.spellName }
  const vehiclePreview = answers.kind === 'vehicle' && preview.entry ? asVehicle(preview.entry) : null
  const lines = describeAnswers(answers, names)
  const canSave = !busy && dirty && !blocked && preview.problems.length === 0 && settled === answers && answers.name.trim() !== ''

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: 'var(--space-3) var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)' }}>
        <Button variant="ghost" onClick={onBack} style={smallButton} title="Back to What do you want to make?">
          <IconLabel icon={<ArrowLeftIcon size={12} />}>Back</IconLabel>
        </Button>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{answers.name.trim() || `New ${meta.title.toLowerCase()}`}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {meta.title} · {packName}
            {dirty && savedId ? ' · unsaved changes' : ''}
          </div>
        </div>
        {!savedId && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }} title="Which of your packs it's saved into">
            Save to
            <Select value={packId} onChange={(v) => v && setPackId(v)} options={packChoices} />
          </label>
        )}
        <Button
          variant="secondary"
          disabled={!savedId || dirty}
          onClick={() => onOpenFull(packId, savedId)}
          style={smallButton}
          title={!savedId ? 'Save it first' : dirty ? 'Save your changes first' : 'Every option, for things the guided form doesn’t cover'}
        >
          Open in full editor
        </Button>
        {savedId && (
          <ConfirmButton
            label="Delete"
            confirmLabel={`Delete from ${packName}`}
            danger
            variant="ghost"
            disabled={busy || !!blocked}
            style={smallButton}
            title={blocked ?? `Removes it from ${packName}. Campaigns that already enabled the pack keep their copy until the DM updates it.`}
            onConfirm={remove}
          />
        )}
        <Button variant="primary" disabled={!canSave} onClick={save} style={smallButton} title={blocked ?? (answers.name.trim() ? undefined : 'Give it a name first')}>
          {savedId ? 'Save changes' : 'Save'}
        </Button>
      </div>
      {(message || blocked) && <div style={{ padding: '6px var(--space-5) 0', fontSize: 12, color: message?.kind === 'ok' ? 'var(--accent)' : 'var(--danger)' }}>{message?.text ?? blocked}</div>}

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <GuidedForm answers={answers} onChange={set} sources={sources} />
          {extrasCount(answers) > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              It also has {extrasCount(answers)} thing{extrasCount(answers) === 1 ? '' : 's'} made in the full editor, which this form leaves as they are.
            </p>
          )}
        </div>
        <aside style={{ width: 360, flexShrink: 0, borderLeft: '1px solid var(--border-subtle)', overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', background: 'var(--bg-surface)' }}>
          <div>
            <div className="gb-label" style={{ marginBottom: 6 }}>
              Preview
            </div>
            <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
              {answers.kind === 'vehicle' && vehiclePreview && answers.name.trim() ? (
                <div onClick={(e) => rollInlineDice(e, null)}>
                  <VehicleCard vehicle={vehiclePreview} />
                </div>
              ) : answers.kind === 'monster' && preview.entry && answers.name.trim() ? (
                <div onClick={(e) => rollInlineDice(e, null)} dangerouslySetInnerHTML={{ __html: renderStatblockHtml(preview.entry as unknown as StatblockData, false) }} />
              ) : preview.card ? (
                <HomebrewDetail entry={preview.card} />
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{answers.name.trim() ? 'Fix the problems below to see it.' : 'Give it a name to see it.'}</p>
              )}
              {lines.length > 0 && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <div className="gb-label">{answers.kind === 'monster' ? 'Worked out for you' : answers.kind === 'vehicle' ? 'In play' : 'On the character sheet'}</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
                    {lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
          {preview.problems.length > 0 && (
            <div>
              <div className="gb-label" style={{ color: 'var(--danger)' }}>
                To fix before saving
              </div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--danger)' }}>
                {preview.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {answers.kind !== 'monster' && answers.kind !== 'vehicle' && preview.registry && preview.card && <TryIt registry={preview.registry} answers={answers} fullId={preview.fullId} />}
        </aside>
      </div>
    </div>
  )
}

function extrasCount(a: GuidedAnswers): number {
  return a.extras.length + (a.kind === 'species' ? a.traits.reduce((n, t) => n + t.extras.length, 0) : 0)
}

const SCORES: CharacterBuild['abilityScores'] = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }

/** "Try it on a character": a scratch character of any class and level, without and with the new thing, and what changed. */
function TryIt({ registry, answers, fullId }: { registry: Registry; answers: GuidedAnswers; fullId: string }): JSX.Element {
  const classes = registry.all('classes')
  const spellClass = answers.kind === 'spell' ? (classes.find((c) => answers.lists.includes(c.def.id) && c.def.spellcasting) ?? classes.find((c) => c.def.id === 'wizard') ?? classes.find((c) => c.def.spellcasting)) : undefined
  const [classId, setClassId] = useState(() => spellClass?.fullId ?? classes.find((c) => c.def.id === 'fighter')?.fullId ?? classes[0]?.fullId ?? '')
  const [level, setLevel] = useState(answers.kind === 'feat' ? 4 : 5)
  const cls = registry.get('classes', classId)
  // Give the class's main abilities the best scores, so the numbers look like a real character's.
  const primary = cls?.def.spellcasting?.ability ?? cls?.def.primaryAbilities[0]
  const scores = primary ? { ...SCORES, [primary]: 16 } : SCORES
  const base: CharacterBuild = { abilityScores: scores, classes: cls ? [{ classId: cls.fullId, level }] : [] }

  const result = useMemo(() => {
    const before = deriveCharacter(base, registry)
    let withIt: CharacterBuild = base
    if (answers.kind === 'magicItem' || answers.kind === 'weapon' || answers.kind === 'armor') withIt = { ...base, equipment: [{ itemId: fullId, equipped: true, attuned: true }] }
    else if (answers.kind === 'species') withIt = { ...base, speciesId: fullId }
    else if (answers.kind === 'feat') {
      const feat = registry.get('feats', fullId)
      withIt = { ...base, customEffects: feat ? [{ name: feat.def.name, effects: feat.def.effects }] : [] }
    }
    if (answers.kind === 'spell') {
      const derived = deriveCharacter(base, registry, { keepEvaluator: true })
      const spell = registry.get('spells', fullId)?.def
      return { kind: 'spell' as const, derived, spell }
    }
    const after = deriveCharacter(withIt, registry)
    return { kind: 'thing' as const, changes: describeChanges(before, after), errors: after.diagnostics.filter((d) => d.severity === 'error' && !before.diagnostics.some((b) => b.message === d.message)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, fullId, classId, level, answers.kind])

  return (
    <div>
      <div className="gb-label" style={{ marginBottom: 6 }}>
        Try it on a character
      </div>
      <Grid min={140}>
        <Field label="Class">
          <Select value={classId} onChange={(v) => setClassId(v)} options={classes.map((c) => ({ value: c.fullId, label: c.def.name }))} />
        </Field>
        <Field label="Level">
          <NumberInput value={level} min={1} max={20} onChange={(v) => setLevel(Math.min(20, Math.max(1, v ?? 1)))} />
        </Field>
      </Grid>
      <div style={{ marginTop: 8, fontSize: 13 }}>
        {result.kind === 'thing' ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              {answers.kind === 'species' ? `A level ${level} ${cls?.def.name ?? ''} of this species, compared with no species:` : `A level ${level} ${cls?.def.name ?? ''} ${answers.kind === 'feat' ? 'taking it' : answers.kind === 'magicItem' ? 'using it' : 'with it equipped'}:`}
            </div>
            {result.changes.length ? (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                {result.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>Nothing on the sheet changes — it's described in words only.</p>
            )}
            {result.errors.map((d, i) => (
              <p key={i} style={{ margin: '4px 0 0', color: 'var(--danger)', fontSize: 12 }}>
                {d.message}
              </p>
            ))}
          </>
        ) : (
          <SpellTry derived={result.derived} spell={result.spell} className={cls?.def.name ?? ''} level={level} />
        )}
      </div>
    </div>
  )
}

function SpellTry({ derived, spell, className, level }: { derived: ReturnType<typeof deriveCharacter>; spell: ContentPack['spells'][number] | undefined; className: string; level: number }): JSX.Element {
  if (!spell) return <></>
  const caster = derived.spellcasting.dc !== null
  const evaluate = derived.evaluate!
  const roll = spell.attackType ? `Spell attack ${derived.spellcasting.attackBonus !== null ? (derived.spellcasting.attackBonus >= 0 ? `+${derived.spellcasting.attackBonus}` : derived.spellcasting.attackBonus) : '—'}` : spell.saveAbility ? `${ABILITY_LABEL[spell.saveAbility]} save, DC ${derived.spellcasting.dc ?? '—'}` : ''
  const formula = spell.damage ?? spell.healing
  // One row unless casting it higher changes the dice.
  const rows = !formula ? [] : /@slotLevel/.test(formula) ? spellRolls(evaluate, formula, spell.level) : [{ label: spell.level === 0 ? 'This character' : 'Any slot', value: spellRolls(evaluate, formula, spell.level)[0].value }]
  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
        Cast by a level {level} {className}
        {caster ? '' : ' (not a spellcaster — pick a class that casts spells for its DC)'}:
      </div>
      {roll && <div>{roll}</div>}
      {rows.length > 0 && (
        <table style={{ fontSize: 12, borderCollapse: 'collapse', marginTop: 4 }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td style={{ padding: '1px 10px 1px 0', color: 'var(--text-muted)' }}>{r.label}</td>
                <td>
                  {r.value} {spell.damage ? (spell.damageType ?? '').toLowerCase() : 'healing'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!roll && rows.length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)' }}>No roll — the description says what it does.</p>}
    </>
  )
}

const ABILITY_LABEL: Record<string, string> = Object.fromEntries(ABILITY_IDS.map((a) => [a, { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }[a]]))

const smallButton = { fontSize: 12, padding: '4px 10px' } as const
