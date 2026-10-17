import type { ReactNode } from 'react'
import type { ContentPack } from '@shared/content/schema'
import { ABILITY_IDS, deriveCharacter, type CharacterBuild, type DerivedCharacter } from '@shared/content/engine'
import type { Registry } from '@shared/content/registry'
import { formatModifier } from '@shared/dnd5e'
import { ChoiceList } from '../player/ChoiceCards'

type Scores = CharacterBuild['abilityScores']
const DEFAULT_SCORES: Scores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }

export interface TestSetup {
  classId: string
  subclassId: string
  level: number
  speciesId: string
  backgroundId: string
  scores: Scores
  choices: Record<string, string[]>
  toggles: string[]
}
type Setup = TestSetup

const ownFirstOf =
  (packId: string) =>
  <T extends { fullId: string }>(list: T[]): T[] => [...list.filter((e) => e.fullId.startsWith(`${packId}:`)), ...list.filter((e) => !e.fullId.startsWith(`${packId}:`))]

/** A fresh test character: the pack's own first class, species and background (else the SRD's), standard-array scores, level 1. */
export function defaultTestSetup(registry: Registry, packId: string): TestSetup {
  const ownFirst = ownFirstOf(packId)
  return {
    classId: ownFirst(registry.all('classes'))[0]?.fullId ?? '',
    subclassId: '',
    level: 1,
    speciesId: ownFirst(registry.all('species'))[0]?.fullId ?? '',
    backgroundId: ownFirst(registry.all('backgrounds'))[0]?.fullId ?? '',
    scores: DEFAULT_SCORES,
    choices: {},
    toggles: []
  }
}

/** The build a test setup stands for. */
export function buildFromSetup(s: TestSetup, registry: Registry): CharacterBuild {
  const cls = registry.get('classes', s.classId)
  return {
    abilityScores: s.scores,
    ...(s.speciesId ? { speciesId: s.speciesId } : {}),
    ...(s.backgroundId ? { backgroundId: s.backgroundId } : {}),
    classes: cls ? [{ classId: cls.fullId, level: s.level, ...(s.subclassId ? { subclassId: s.subclassId } : {}) }] : [],
    choices: s.choices,
    activeToggles: s.toggles
  }
}

/** "Channeler 5" — who a setup is. */
export function setupLabel(s: TestSetup, registry: Registry): string {
  const cls = registry.get('classes', s.classId)
  return cls ? `${cls.def.name} ${s.level}` : `level ${s.level}`
}

/**
 * A scratch character built from this pack (plus the SRD and whatever it
 * builds on) at any level — the derived sheet's numbers, resources,
 * actions, choices and every diagnostic, so a class can be checked before
 * a player ever uses it. Nothing here is saved.
 */
export function TestCharacterPanel({
  pack,
  registry,
  setup,
  onSetup,
  hasErrors
}: {
  pack: ContentPack | null
  /** The SRD, the pack's dependencies and the pack (null while there's no valid version). */
  registry: Registry | null
  setup: TestSetup | null
  onSetup: (setup: TestSetup | null) => void
  hasErrors: boolean
}): JSX.Element {
  const setSetup = onSetup
  if (!pack || !registry) {
    return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>The pack has errors — fix them (see Overview → Problems) and the test character will appear.</p>
  }

  const classes = registry.all('classes')
  const ownFirst = ownFirstOf(pack.id)
  const s: Setup = setup ?? defaultTestSetup(registry, pack.id)
  const update = (fields: Partial<Setup>): void => setSetup({ ...s, ...fields })
  const cls = registry.get('classes', s.classId)
  const subclasses = cls ? registry.all('subclasses').filter((x) => x.def.classId === cls.def.id || x.def.classId === cls.fullId) : []

  const derived = deriveCharacter(buildFromSetup(s, registry), registry)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {hasErrors && <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>The draft has errors right now — this uses the last version that validated.</p>}
      <div className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
        <Pick label="Class" value={s.classId} onChange={(classId) => update({ classId, subclassId: '', choices: {} })} options={ownFirst(classes).map((c) => ({ id: c.fullId, name: c.def.name, own: c.fullId.startsWith(`${pack.id}:`) }))} />
        <label style={fieldStyle}>
          <span style={labelStyle}>Level {s.level}</span>
          <input type="range" min={1} max={20} value={s.level} onChange={(e) => update({ level: Number(e.target.value) })} style={{ width: 140 }} />
        </label>
        <Pick
          label={cls?.def.subclassLabel ?? 'Subclass'}
          value={s.subclassId}
          onChange={(subclassId) => update({ subclassId })}
          options={subclasses.map((c) => ({ id: c.fullId, name: c.def.name, own: c.fullId.startsWith(`${pack.id}:`) }))}
          none="None"
        />
        <Pick label="Species" value={s.speciesId} onChange={(speciesId) => update({ speciesId })} options={ownFirst(registry.all('species')).map((c) => ({ id: c.fullId, name: c.def.name, own: c.fullId.startsWith(`${pack.id}:`) }))} none="None" />
        <Pick
          label="Background"
          value={s.backgroundId}
          onChange={(backgroundId) => update({ backgroundId })}
          options={ownFirst(registry.all('backgrounds')).map((c) => ({ id: c.fullId, name: c.def.name, own: c.fullId.startsWith(`${pack.id}:`) }))}
          none="None"
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {ABILITY_IDS.map((a) => (
            <label key={a} style={{ ...fieldStyle, width: 46 }}>
              <span style={labelStyle}>{(registry.terminology[`ability.${a}`] ?? a).slice(0, 3).toUpperCase()}</span>
              <input
                className="gb-input"
                type="number"
                min={1}
                max={30}
                value={s.scores[a]}
                onChange={(e) => update({ scores: { ...s.scores, [a]: Math.max(1, Math.min(30, Number(e.target.value) || 10)) } })}
                style={{ fontSize: 12, padding: '2px 4px' }}
              />
            </label>
          ))}
        </div>
        <button type="button" className="gb-btn gb-btn--ghost" onClick={() => setSetup(null)} style={{ fontSize: 12, padding: '4px 10px' }}>
          Reset
        </button>
      </div>

      <Diagnostics derived={derived} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
        <Tile label="Proficiency" value={formatModifier(derived.proficiencyBonus)} />
        <Tile label="Armor Class" value={String(derived.armorClass)} />
        <Tile label="Hit Points" value={String(derived.maxHp)} />
        <Tile label="Initiative" value={formatModifier(derived.initiative)} />
        {Object.entries(derived.speeds).map(([k, v]) => (
          <Tile key={k} label={`Speed (${k})`} value={`${v} ft`} />
        ))}
        {ABILITY_IDS.map((a) => (
          <Tile key={a} label={registry.terminology[`ability.${a}`] ?? a.toUpperCase()} value={`${derived.abilities[a].score} (${formatModifier(derived.abilities[a].mod)})`} />
        ))}
        {Object.entries(derived.stats).map(([id, st]) => (
          <Tile key={id} label={st.name} value={String(st.value)} />
        ))}
        {derived.spellcasting.dc !== null && <Tile label="Spell DC" value={String(derived.spellcasting.dc)} />}
        {derived.critThreshold !== 20 && <Tile label="Crit on" value={`${derived.critThreshold}+`} />}
        {derived.reactions !== 1 && <Tile label="Reactions" value={String(derived.reactions)} />}
        {derived.attacksPerAction !== 1 && <Tile label="Attacks/action" value={String(derived.attacksPerAction)} />}
        {Object.values(derived.senses).map((sn) => (
          <Tile key={sn.name} label={sn.name} value={`${sn.range} ft`} />
        ))}
      </div>

      {derived.choices.length > 0 && (
        <Section title="Choices">
          <ChoiceList choices={derived.choices} all={derived.choices} onSetPicks={(choice, picks) => update({ choices: { ...s.choices, [choice.key]: picks } })} />
        </Section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-4)', alignItems: 'start' }}>
        <Section title="Features">
          {derived.features.length === 0 && <Muted>None at this level.</Muted>}
          {derived.features.map((f) => (
            <Row key={f.key} title={f.name} meta={[f.archetypeName, f.level !== undefined ? `level ${f.level}` : undefined].filter(Boolean).join(' · ')}>
              {f.description}
            </Row>
          ))}
        </Section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {derived.resources.length > 0 && (
            <Section title="Resources">
              {derived.resources.map((r) => (
                <Row key={r.id} title={r.name} meta={`${r.max} · recharges on ${r.recharge}${r.shortRestRegain ? ` · short rest +${r.shortRestRegain}` : ''}`} />
              ))}
            </Section>
          )}
          {derived.toggles.length > 0 && (
            <Section title="Toggles">
              {derived.toggles.map((t) => (
                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={s.toggles.includes(t.id)}
                    onChange={() => update({ toggles: s.toggles.includes(t.id) ? s.toggles.filter((x) => x !== t.id) : [...s.toggles, t.id] })}
                  />
                  {t.name}
                  {t.cost && <span style={{ color: 'var(--text-muted)' }}>(costs {t.cost.amount})</span>}
                </label>
              ))}
            </Section>
          )}
          {(derived.actions.length > 0 || derived.attacks.length > 0) && (
            <Section title="Actions & attacks">
              {derived.attacks.map((a) => (
                <Row key={a.id} title={a.name} meta={`${formatModifier(a.attackBonus)} to hit · ${a.damage} ${a.damageType}`} />
              ))}
              {derived.actions.map((a) => (
                <Row
                  key={a.id}
                  title={a.name}
                  meta={[
                    a.cost ? `costs ${a.cost.amount}` : undefined,
                    a.spend ? `spend ${a.spend.min}–${a.spend.max}` : undefined,
                    a.attackBonus !== undefined ? `${formatModifier(a.attackBonus)} to hit` : undefined,
                    a.saveDc !== undefined ? `DC ${a.saveDc}` : undefined,
                    a.damage,
                    a.healing ? `heals ${a.healing}` : undefined,
                    a.range !== undefined ? `${a.range} ft` : undefined
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  {a.scaling && a.scaling.length > 1 ? `At max spend (${a.scaling[a.scaling.length - 1].spent}): ${[a.scaling[a.scaling.length - 1].damage, a.scaling[a.scaling.length - 1].range !== undefined ? `${a.scaling[a.scaling.length - 1].range} ft` : ''].filter(Boolean).join(' · ')}` : undefined}
                </Row>
              ))}
            </Section>
          )}
          {derived.companions.length > 0 && (
            <Section title="Companions">
              {derived.companions.map((c) => (
                <Row key={c.id} title={c.name} meta={`AC ${c.ac} · HP ${c.maxHp}`}>
                  {c.attacks.map((a) => `${a.name} ${formatModifier(a.bonus)}, ${a.damage}`).join('; ')}
                </Row>
              ))}
            </Section>
          )}
          {derived.damageReductions.length > 0 && (
            <Section title="Damage reduction">
              {derived.damageReductions.map((r, i) => (
                <Row key={i} title={`−${r.amount} ${r.damageTypes?.join(', ') ?? 'all'}`} meta={r.label ?? r.source} />
              ))}
            </Section>
          )}
          {(derived.proficiencies.armor.length > 0 || derived.proficiencies.weapon.length > 0) && (
            <Section title="Proficiencies">
              <Muted>
                {[...derived.proficiencies.armor.map((x) => `${x} armor`), ...derived.proficiencies.weapon.map((x) => `${x} weapons`), ...derived.proficiencies.tool].join(', ')}
              </Muted>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Diagnostics({ derived }: { derived: DerivedCharacter }): JSX.Element {
  const list = derived.diagnostics.filter((d) => d.source !== 'srd-5.2.1')
  if (list.length === 0) return <p style={{ fontSize: 12, color: 'var(--accent)', margin: 0 }}>No problems deriving this character.</p>
  return (
    <ul className="gb-card" style={{ margin: 0, padding: 'var(--space-2) var(--space-3) var(--space-2) 28px', fontSize: 12, borderColor: list.some((d) => d.severity === 'error') ? 'var(--danger)' : undefined }}>
      {list.map((d, i) => (
        <li key={i} style={{ color: d.severity === 'error' ? 'var(--danger)' : 'var(--text-secondary)' }}>
          {d.message}
        </li>
      ))}
    </ul>
  )
}

function Pick({ label, value, onChange, options, none }: { label: string; value: string; onChange: (id: string) => void; options: Array<{ id: string; name: string; own: boolean }>; none?: string }): JSX.Element {
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      <select className="gb-input" value={value} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 12, maxWidth: 200 }}>
        {none !== undefined && <option value="">{none}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.own ? ' (this pack)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

function Tile({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="gb-card" style={{ padding: '6px 8px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <strong style={{ fontSize: 15, color: 'var(--accent)' }}>{value}</strong>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <div className="gb-label">{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function Row({ title, meta, children }: { title: string; meta?: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="gb-card" style={{ padding: '6px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <strong style={{ fontSize: 13 }}>{title}</strong>
        {meta && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{meta}</span>}
      </div>
      {children && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{children}</div>}
    </div>
  )
}

function Muted({ children }: { children: ReactNode }): JSX.Element {
  return <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{children}</p>
}

const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 3 } as const
const labelStyle = { fontSize: 11, color: 'var(--text-muted)' } as const
