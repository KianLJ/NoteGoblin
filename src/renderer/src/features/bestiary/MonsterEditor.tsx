import { useState } from 'react'
import { Modal } from '../../ui/Modal'
import { StatblockCard } from '../campaigns/StatblockCard'
import { attackText, damageWithAverage, rollsInBonusLine, rollsInEntry, type StatblockRoll } from '@shared/statblockRolls'
import { saveEditedMonster, PERSONAL_MONSTER_PACK_ID, type PackMonster } from '../../data/packMonsters'
import { isCustomMonster } from '../../data/customBestiary'
import type { StatblockEntry } from '../../statblock'
import './monsterEditor.css'

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
const LISTS = [
  ['traits', 'Traits'],
  ['actions', 'Actions'],
  ['bonus_actions', 'Bonus actions'],
  ['reactions', 'Reactions'],
  ['legendary_actions', 'Legendary actions']
] as const
type ListKey = (typeof LISTS)[number][0]

const BASICS: Array<[keyof PackMonster, string, string]> = [
  ['size', 'Size', 'Medium'],
  ['type', 'Type', 'humanoid'],
  ['alignment', 'Alignment', 'neutral'],
  ['ac', 'Armor Class', '15 (leather)'],
  ['hp', 'Hit Points', '7 (2d6)'],
  ['speed', 'Speed', '30 ft.'],
  ['initiative', 'Initiative', '+2 (12)'],
  ['cr', 'Challenge', '1/4'],
  ['senses', 'Senses', 'darkvision 60 ft., passive Perception 9'],
  ['languages', 'Languages', 'Common']
]

const DEFENCES: Array<[keyof PackMonster, string]> = [
  ['damage_vulnerabilities', 'Vulnerabilities'],
  ['damage_resistances', 'Resistances'],
  ['damage_immunities', 'Damage immunities'],
  ['condition_immunities', 'Condition immunities']
]

/** Whether the editor changes this creature where it is (it's yours) or saves a copy of it (the SRD's, another pack's). */
export function editsInPlace(monster: PackMonster): boolean {
  return monster.packId === PERSONAL_MONSTER_PACK_ID || (!monster.packId && isCustomMonster(monster.index))
}

function rollLabel(roll: StatblockRoll): string {
  if (roll.kind === 'damage') return roll.expr
  return `${roll.modifier >= 0 ? '+' : '−'}${Math.abs(roll.modifier)} to hit`
}

/**
 * The monster editor: every part of a statblock as a field, with the
 * statblock itself beside it, live and rollable. Under each action it shows
 * the roll buttons its text will get, and warns when an attack's text has no
 * roll in it; "Write an attack" fills in an attack in the form the statblock
 * rolls ("+4 to hit", "5 (1d6 + 2)"). Your own creatures change where they
 * are; any other is saved as your copy in My Creatures.
 */
export function MonsterEditor({ monster, onClose, onSaved }: { monster: PackMonster; onClose: () => void; onSaved: (monster: PackMonster) => void }): JSX.Element {
  const [draft, setDraft] = useState<PackMonster>(() => structuredClone(monster))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inPlace = editsInPlace(monster)

  const set = (key: keyof PackMonster, value: string): void => setDraft((d) => ({ ...d, [key]: value }))
  const list = (key: ListKey): StatblockEntry[] => draft[key] ?? []
  const setList = (key: ListKey, next: StatblockEntry[]): void => setDraft((d) => ({ ...d, [key]: next }))

  async function save(): Promise<void> {
    setSaving(true)
    setError(null)
    // Empty rows left from adding and not filling in go.
    const tidy = Object.fromEntries(LISTS.map(([key]) => [key, list(key).filter((e) => e.name.trim() || e.desc.trim())]))
    const result = await saveEditedMonster({ ...draft, ...tidy, name: draft.name.trim() || 'Unnamed Creature' })
    setSaving(false)
    if ('error' in result) setError(result.error)
    else onSaved(result.monster)
  }

  return (
    <Modal onClose={onClose} width={1120} dismissible={false}>
      <div className="gb-mon-edit">
        <header className="gb-mon-edit-head">
          <input className="gb-mon-edit-name" value={draft.name} onChange={(e) => set('name', e.target.value)} aria-label="Name" placeholder="Creature name" />
          <span className="gb-mon-edit-where">{inPlace ? 'Your creature — saved where it is' : 'Saved as your own copy, in My Creatures'}</span>
          <button type="button" className="gb-btn gb-btn--ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="gb-btn gb-btn--primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : inPlace ? 'Save' : 'Save a copy'}
          </button>
        </header>
        {error && <p className="gb-mon-edit-error">{error}</p>}
        <div className="gb-mon-edit-body">
          <div className="gb-mon-edit-form">
            <section>
              <h3>Basics</h3>
              <div className="gb-mon-edit-grid">
                {BASICS.map(([key, label, placeholder]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input className="gb-input" value={(draft[key] as string | undefined) ?? ''} placeholder={placeholder} onChange={(e) => set(key, e.target.value)} />
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3>Ability scores</h3>
              <div className="gb-mon-edit-abilities">
                {ABILITIES.map((a) => {
                  const score = Number.parseInt(draft[a] ?? '', 10)
                  const mod = Number.isFinite(score) ? Math.floor((score - 10) / 2) : null
                  return (
                    <label key={a}>
                      <span>{a.toUpperCase()}</span>
                      <input className="gb-input" inputMode="numeric" value={draft[a] ?? ''} onChange={(e) => set(a, e.target.value)} />
                      <em>{mod === null ? '—' : `${mod >= 0 ? '+' : '−'}${Math.abs(mod)}`}</em>
                    </label>
                  )
                })}
              </div>
              <BonusLine label="Saving throws" value={draft.saves ?? ''} placeholder="Dex +5, Wis +3" onChange={(v) => set('saves', v)} />
              <BonusLine label="Skills" value={draft.skills ?? ''} placeholder="Perception +4, Stealth +6" onChange={(v) => set('skills', v)} />
            </section>

            <section>
              <h3>Defences</h3>
              <div className="gb-mon-edit-grid">
                {DEFENCES.map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input className="gb-input" value={(draft[key] as string | undefined) ?? ''} onChange={(e) => set(key, e.target.value)} />
                  </label>
                ))}
              </div>
            </section>

            {LISTS.map(([key, label]) => (
              <section key={key}>
                <h3>{label}</h3>
                {list(key).map((entry, i) => (
                  <EntryEditor
                    key={i}
                    entry={entry}
                    attackable={key !== 'traits'}
                    onChange={(next) => setList(key, list(key).map((e, j) => (j === i ? next : e)))}
                    onRemove={() => setList(key, list(key).filter((_, j) => j !== i))}
                    onMove={
                      i > 0
                        ? () => {
                            const next = [...list(key)]
                            ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                            setList(key, next)
                          }
                        : undefined
                    }
                  />
                ))}
                <button type="button" className="gb-mon-edit-add" onClick={() => setList(key, [...list(key), { name: '', desc: '' }])}>
                  + Add {label.toLowerCase().replace(/s$/, '')}
                </button>
              </section>
            ))}
          </div>
          <aside className="gb-mon-edit-preview" aria-label="Preview">
            <span className="gb-mon-edit-preview-label">Preview — click the chips to try the rolls</span>
            <StatblockCard monster={draft} />
          </aside>
        </div>
      </div>
    </Modal>
  )
}

function BonusLine({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }): JSX.Element {
  const count = rollsInBonusLine(value)
  return (
    <label className="gb-mon-edit-line">
      <span>{label}</span>
      <input className="gb-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <small className={value.trim() && count === 0 ? 'gb-mon-edit-warn' : undefined}>
        {value.trim() ? (count ? `${count} roll${count === 1 ? '' : 's'}` : `No rolls — write them as “${placeholder}”`) : ''}
      </small>
    </label>
  )
}

function EntryEditor({
  entry,
  attackable,
  onChange,
  onRemove,
  onMove
}: {
  entry: StatblockEntry
  attackable: boolean
  onChange: (entry: StatblockEntry) => void
  onRemove: () => void
  onMove?: () => void
}): JSX.Element {
  const [writing, setWriting] = useState(false)
  const rolls = rollsInEntry(entry.desc, entry.name || 'Action')
  // Reads like an attack but nothing in it will roll: say how to write it.
  const looksLikeAttack = /\battack\b|\bhit:/i.test(entry.desc)
  return (
    <div className="gb-mon-edit-entry">
      <div className="gb-mon-edit-entry-head">
        <input className="gb-input" value={entry.name} placeholder="Name" onChange={(e) => onChange({ ...entry, name: e.target.value })} aria-label="Name" />
        {attackable && (
          <button type="button" className="gb-btn gb-btn--secondary" style={{ fontSize: 12 }} onClick={() => setWriting((w) => !w)} aria-expanded={writing}>
            ⚔ Write an attack
          </button>
        )}
        {onMove && (
          <button type="button" className="gb-mon-edit-icon" onClick={onMove} title="Move up" aria-label="Move up">
            ↑
          </button>
        )}
        <button type="button" className="gb-mon-edit-icon gb-mon-edit-icon--danger" onClick={onRemove} title="Remove" aria-label="Remove">
          ×
        </button>
      </div>
      {writing && (
        <AttackWriter
          // Starts from the attack already written there, if there is one.
          ranged={/^Ranged/i.test(entry.desc)}
          toHit={rolls.find((r) => r.kind === 'check')}
          dice={rolls.find((r) => r.kind === 'damage')}
          onWrite={(text) => {
            // An attack line goes first; whatever followed it (riders, saves) stays after.
            const rest = entry.desc.replace(/^(Melee|Ranged) Weapon Attack:[^]*?damage\.\s*/i, '')
            onChange({ ...entry, desc: rest ? `${text} ${rest}` : text })
            setWriting(false)
          }}
        />
      )}
      <textarea className="gb-input" rows={3} value={entry.desc} placeholder="What it does" onChange={(e) => onChange({ ...entry, desc: e.target.value })} aria-label="Description" />
      <div className="gb-mon-edit-rolls">
        {rolls.map((r, i) => (
          <span key={i} className={r.kind === 'damage' ? 'gb-mon-edit-chip gb-mon-edit-chip--dmg' : 'gb-mon-edit-chip'}>
            {rollLabel(r)}
          </span>
        ))}
        {rolls.length === 0 && looksLikeAttack && <span className="gb-mon-edit-warn">No rolls found — write the bonus as “+4 to hit” and damage as “5 (1d6 + 2)”, or use Write an attack.</span>}
      </div>
    </div>
  )
}

function AttackWriter(props: { ranged: boolean; toHit?: StatblockRoll; dice?: StatblockRoll; onWrite: (text: string) => void }): JSX.Element {
  const { onWrite } = props
  const [ranged, setRanged] = useState(props.ranged)
  const [toHit, setToHit] = useState(props.toHit?.kind === 'check' ? String(props.toHit.modifier) : '4')
  const [distance, setDistance] = useState('')
  const [dice, setDice] = useState(props.dice?.kind === 'damage' ? props.dice.expr : '1d6+2')
  const [damageType, setDamageType] = useState(ranged ? 'piercing' : 'slashing')
  const dmg = damageWithAverage(dice)
  const bonus = Number.parseInt(toHit.replace('−', '-'), 10)
  const ok = Number.isFinite(bonus) && !!dmg
  return (
    <div className="gb-mon-edit-attack">
      <select className="gb-input" value={ranged ? 'ranged' : 'melee'} onChange={(e) => setRanged(e.target.value === 'ranged')} aria-label="Melee or ranged">
        <option value="melee">Melee</option>
        <option value="ranged">Ranged</option>
      </select>
      <label>
        <span>To hit</span>
        <input className="gb-input" value={toHit} onChange={(e) => setToHit(e.target.value)} />
      </label>
      <label>
        <span>{ranged ? 'Range (ft.)' : 'Reach (ft.)'}</span>
        <input className="gb-input" value={distance} placeholder={ranged ? '80/320' : '5'} onChange={(e) => setDistance(e.target.value)} />
      </label>
      <label>
        <span>Damage</span>
        <input className="gb-input" value={dice} placeholder="1d6+2" onChange={(e) => setDice(e.target.value)} />
      </label>
      <label>
        <span>Type</span>
        <input className="gb-input" value={damageType} onChange={(e) => setDamageType(e.target.value)} />
      </label>
      <button type="button" className="gb-btn gb-btn--primary" disabled={!ok} title={ok ? undefined : 'Damage is dice like 1d6+2'} onClick={() => onWrite(attackText({ ranged, toHit: bonus, distance, dice, damageType }))}>
        Write it
      </button>
    </div>
  )
}
