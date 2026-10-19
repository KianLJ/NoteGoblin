// The campaign's Vehicles tab (DM right panel and players' party sidebar):
// every vehicle the campaign tracks — mounts, carts, ships, starships — with
// its hull and components, resources, weapons, crew, cargo and notes. The DM
// changes everything; a player sees the vehicles the DM hasn't hidden and can
// roll the weapons of the stations their character crews. Rolls go through
// the dice roller like the character sheet's.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import type { CharacterSheet } from '@shared/ipc'
import { diceGroups } from '@shared/dice'
import { vehicleDefSchema, type VehicleDef } from '@shared/content/schema'
import {
  ammoLeft,
  componentHp,
  damageVehicle,
  repairVehicle,
  resourceLeft,
  restVehicle,
  stationsFor,
  trackVehicle,
  vehicleCondition,
  vehicleName,
  type TrackedVehicle
} from '@shared/vehicles'
import { useActivePackRegistry } from '../content/pickerContent'
import { useSheetRoller } from '../dice/useSheetRoller'
import { rollInlineDice } from '../dice/inlineDice'
import { inlineTextHtml } from '../../markdown'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { XIcon } from '../../ui/icons'
import { VehicleCard, weaponLine } from './VehicleCard'
import { useVehicles } from './useVehicles'
import '../player/sheet/sheet.css'

interface VehiclesPanelProps {
  /** Where the list is read from: null for the DM (local), the joined session id for a player. */
  sessionId: string | null
  /** Where rolls are broadcast: the session the DM is hosting, or the one a player joined. */
  rollSessionId: string | null
  campaignId: string | null
  /** A player's view: no changes, rolls only from their own stations. */
  readOnly: boolean
  myUserId?: string | null
  /** DM: the connected players' characters, to put at stations. */
  playerCharacters?: Map<string, CharacterSheet>
  /** DM: puts the vehicle in the initiative tracker. */
  onAddToInitiative?: (vehicle: TrackedVehicle) => void
  /** Opens this vehicle (clicked from the initiative tracker) — a new object each click, so the same one reopens. */
  focus?: { id: string } | null
}

const BLANK: VehicleDef = vehicleDefSchema.parse({ id: 'custom', name: 'New vehicle', speeds: [{ mode: 'walk', value: '30 ft.' }], hp: 50, ac: 12 })

export function VehiclesPanel({ sessionId, rollSessionId, campaignId, readOnly, myUserId = null, playerCharacters, onAddToInitiative, focus }: VehiclesPanelProps): JSX.Element {
  const { doc, save, error } = useVehicles(sessionId, campaignId)
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => {
    if (focus) setOpenId(focus.id)
  }, [focus])
  const [adding, setAdding] = useState(false)

  if (!campaignId) return <Empty text="Open a campaign to track its vehicles." />

  const update = (v: TrackedVehicle): void => void save({ vehicles: doc.vehicles.map((x) => (x.id === v.id ? v : x)) })
  const remove = (id: string): void => void save({ vehicles: doc.vehicles.filter((x) => x.id !== id) })

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{error}</p>}
      {doc.vehicles.length === 0 && !adding && (
        <Empty text={readOnly ? 'No vehicles yet. The DM adds them.' : 'No vehicles yet. Add a mount, ship or anything else the party travels in; make your own in the Workshop.'} />
      )}
      {doc.vehicles.map((v) =>
        openId === v.id ? (
          <TrackedVehicleCard
            key={v.id}
            vehicle={v}
            readOnly={readOnly}
            rollSessionId={rollSessionId}
            myUserId={myUserId}
            playerCharacters={playerCharacters}
            onChange={update}
            onRemove={() => remove(v.id)}
            onClose={() => setOpenId(null)}
            onAddToInitiative={onAddToInitiative}
          />
        ) : (
          <VehicleRow key={v.id} vehicle={v} readOnly={readOnly} onOpen={() => setOpenId(v.id)} />
        )
      )}
      {!readOnly &&
        (adding ? (
          <AddVehicle
            onAdd={(v) => {
              void save({ vehicles: [...doc.vehicles, v] })
              setAdding(false)
              setOpenId(v.id)
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button type="button" className="gb-btn gb-btn--secondary" style={{ fontSize: 12 }} onClick={() => setAdding(true)}>
            + Add a vehicle
          </button>
        ))}
    </div>
  )
}

function Empty({ text }: { text: string }): JSX.Element {
  return <p style={{ margin: 0, padding: 'var(--space-2)', fontSize: 12, color: 'var(--text-muted)' }}>{text}</p>
}

function HpBar({ hp, max, temp = 0, height = 6 }: { hp: number; max: number; temp?: number; height?: number }): JSX.Element {
  const total = Math.max(max, hp) + temp
  const pct = hp / Math.max(1, max)
  return (
    <div style={{ height, borderRadius: 9, background: 'var(--bg-sunken)', overflow: 'hidden', display: 'flex' }} aria-hidden="true">
      <div style={{ width: `${(Math.max(0, hp) / total) * 100}%`, background: pct > 0.5 ? 'var(--success)' : pct > 0.25 ? 'var(--accent)' : 'var(--danger)' }} />
      <div style={{ width: `${(temp / total) * 100}%`, background: '#4b8db5' }} />
    </div>
  )
}

/** One line per vehicle: name, kind, and its hull (numbers for the DM and the party's own; just how hurt it looks for an enemy, to players). */
function VehicleRow({ vehicle: v, readOnly, onOpen }: { vehicle: TrackedVehicle; readOnly: boolean; onOpen: () => void }): JSX.Element {
  const showNumbers = !readOnly || v.party
  return (
    <button type="button" className="gb-card" onClick={onOpen} style={{ padding: '8px 10px', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vehicleName(v)}</strong>
        {v.hidden && <span className="gb-badge" style={{ fontSize: 10 }} title="Players can’t see it yet">Hidden</span>}
        {!v.party && <span className="gb-badge" style={{ fontSize: 10, color: 'var(--danger)' }}>Enemy</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {v.def.size} {v.def.category.toLowerCase()} · {showNumbers ? `${v.hp}/${v.def.hp} HP` : vehicleCondition(v.hp, v.def.hp)}
      </div>
      {showNumbers && <HpBar hp={v.hp} max={v.def.hp} temp={v.tempHp} />}
    </button>
  )
}

/** The DM picks a template from the campaign's packs (or starts blank) and names this one. */
function AddVehicle({ onAdd, onCancel }: { onAdd: (v: TrackedVehicle) => void; onCancel: () => void }): JSX.Element {
  const { registry } = useActivePackRegistry()
  const templates = registry.all('vehicles')
  const [templateId, setTemplateId] = useState(templates[0]?.fullId ?? '')
  const [name, setName] = useState('')
  const [party, setParty] = useState(true)
  const template = templates.find((t) => t.fullId === templateId)
  const def = template?.def ?? BLANK
  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <strong style={{ fontSize: 13 }}>Add a vehicle</strong>
      <label style={labelStyle}>
        From
        <select className="gb-input" style={fieldStyle} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((t) => (
            <option key={t.fullId} value={t.fullId}>
              {t.def.name} ({t.def.category})
            </option>
          ))}
          <option value="">A blank vehicle</option>
        </select>
      </label>
      {templates.length === 0 && <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Make vehicles in the Workshop and turn their pack on for this campaign to pick them here.</p>}
      <label style={labelStyle}>
        Its name
        <input className="gb-input" style={fieldStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={def.name} />
      </label>
      <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={party} onChange={(e) => setParty(e.target.checked)} />
        The party’s own (players see its exact hit points)
      </label>
      {template && (
        <details>
          <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>See its statblock</summary>
          <div style={{ marginTop: 6 }} onClick={(e) => rollInlineDice(e, null)}>
            <VehicleCard vehicle={template.def} />
          </div>
        </details>
      )}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" className="gb-btn gb-btn--ghost" style={smallButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="gb-btn gb-btn--primary" style={smallButton} onClick={() => onAdd(trackVehicle(def, { id: uuid(), templateId: template?.fullId, name: name.trim() || def.name, party }))}>
          Add
        </button>
      </div>
    </div>
  )
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="gb-label" style={{ margin: 0, flex: 1 }}>
          {title}
        </span>
        {right}
      </div>
      {children}
    </div>
  )
}

/** The whole tracked vehicle: what the DM changes, and what crew roll. */
function TrackedVehicleCard({
  vehicle: v,
  readOnly,
  rollSessionId,
  myUserId,
  playerCharacters,
  onChange,
  onRemove,
  onClose,
  onAddToInitiative
}: {
  vehicle: TrackedVehicle
  readOnly: boolean
  rollSessionId: string | null
  myUserId: string | null
  playerCharacters?: Map<string, CharacterSheet>
  onChange: (v: TrackedVehicle) => void
  onRemove: () => void
  onClose: () => void
  onAddToInitiative?: (v: TrackedVehicle) => void
}): JSX.Element {
  const { rollCheck, rollDamage } = useSheetRoller(rollSessionId, vehicleName(v))
  const [amount, setAmount] = useState('')
  const [target, setTarget] = useState('')
  const [showBlock, setShowBlock] = useState(false)
  const myStations = useMemo(() => (readOnly ? stationsFor(v, { characterIds: [], userId: myUserId }) : null), [v, readOnly, myUserId])
  const canFire = (station?: string): boolean => !readOnly || (!!myStations && (!station ? myStations.length > 0 : myStations.includes(station)))
  const showNumbers = !readOnly || v.party
  const n = Number(amount)
  const valid = Number.isFinite(n) && n > 0
  const d = v.def

  function hit(fn: typeof damageVehicle): void {
    if (!valid) return
    onChange(fn(v, n, target || undefined))
    setAmount('')
  }
  function rollDice(expr: string, label: string): void {
    const parsed = diceGroups(expr)
    if (parsed) rollDamage(parsed.groups, parsed.modifier, label)
  }
  function fire(w: VehicleDef['weapons'][number]): void {
    if (w.attackBonus !== undefined) rollCheck(`${w.name} Attack`, w.attackBonus)
    if (w.damage) rollDice(w.damage, `${w.name} Damage`)
    // The DM firing spends a shot; a player's roll doesn't change the vehicle (the DM keeps count).
    if (!readOnly && w.ammo !== undefined) onChange({ ...v, ammoUsed: { ...v.ammoUsed, [w.id]: Math.min(w.ammo, (v.ammoUsed[w.id] ?? 0) + 1) } })
  }
  const setUsed = (key: 'resourceUsed' | 'ammoUsed', id: string, used: number): void => onChange({ ...v, [key]: { ...v[key], [id]: Math.max(0, used) } })

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 10, borderColor: 'var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {readOnly ? (
            <strong style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{vehicleName(v)}</strong>
          ) : (
            <input className="gb-input" value={v.name} onChange={(e) => onChange({ ...v, name: e.target.value })} placeholder={d.name} style={{ fontFamily: 'var(--font-display)', fontSize: 15, padding: '2px 6px', width: '100%' }} aria-label="Vehicle name" />
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {d.size} {d.category.toLowerCase()} {d.name !== vehicleName(v) ? `· ${d.name}` : ''} · AC {d.ac}
            {d.speeds.length ? ` · ${d.speeds.map((s) => (s.mode === 'walk' ? s.value : `${s.mode} ${s.value}`)).join(', ')}` : ''}
          </div>
        </div>
        <button type="button" onClick={onClose} title="Close" style={iconButton}>
          <XIcon size={12} />
        </button>
      </div>

      {!readOnly && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)' }}>
          <label style={checkLabel} title="Players see its exact hit points">
            <input type="checkbox" checked={v.party} onChange={(e) => onChange({ ...v, party: e.target.checked })} /> Party’s own
          </label>
          <label style={checkLabel} title="Players can’t see it at all">
            <input type="checkbox" checked={v.hidden} onChange={(e) => onChange({ ...v, hidden: e.target.checked })} /> Hidden from players
          </label>
        </div>
      )}

      <Section title="Hit points" right={d.damageThreshold ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>threshold {d.damageThreshold}</span> : undefined}>
        {showNumbers ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>{v.hp}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/ {d.hp}</span>
              {v.tempHp > 0 && <span className="gb-badge" style={{ fontSize: 10 }}>+{v.tempHp} temp</span>}
              {v.hp <= 0 && <span className="gb-badge" style={{ fontSize: 10, color: 'var(--danger)' }}>Wrecked</span>}
            </div>
            <HpBar hp={v.hp} max={d.hp} temp={v.tempHp} height={8} />
          </>
        ) : (
          <span style={{ fontSize: 13 }}>{vehicleCondition(v.hp, d.hp)}</span>
        )}
        {!readOnly && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            <input type="number" min={1} className="gb-input" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && hit(damageVehicle)} placeholder="0" aria-label="Amount" style={{ width: 54, padding: '3px 6px' }} />
            {d.components.length > 0 && (
              <select className="gb-input" value={target} onChange={(e) => setTarget(e.target.value)} style={{ ...fieldStyle, flex: 1, minWidth: 80 }} aria-label="What it hits">
                <option value="">Hull</option>
                {d.components.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="gb-btn gb-btn--secondary" disabled={!valid} onClick={() => hit(damageVehicle)} style={{ ...smallButton, color: 'var(--danger)' }} title="Hits under the damage threshold do nothing">
              Damage
            </button>
            <button type="button" className="gb-btn gb-btn--secondary" disabled={!valid} onClick={() => hit(repairVehicle)} style={{ ...smallButton, color: 'var(--success)' }}>
              Repair
            </button>
          </div>
        )}
      </Section>

      {d.components.length > 0 && (
        <Section title="Components">
          {d.components.map((c) => {
            const hp = componentHp(v, c.id)
            return (
              <div key={c.id} title={c.notes || undefined}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: hp <= 0 ? 'var(--danger)' : undefined }}>
                    {c.name}
                    {hp <= 0 ? ' (out)' : ''}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{showNumbers ? `${hp}/${c.hp}` : vehicleCondition(hp, c.hp)}</span>
                </div>
                {showNumbers && <HpBar hp={hp} max={c.hp} height={4} />}
                {hp <= 0 && c.notes && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{c.notes}</div>}
              </div>
            )
          })}
        </Section>
      )}

      {d.resources.length > 0 && (
        <Section title="Resources">
          {d.resources.map((r) => {
            const left = resourceLeft(v, r.id)
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ flex: 1 }}>{r.name}</span>
                {!readOnly && (
                  <button type="button" className="gs-chip" disabled={left <= 0} onClick={() => setUsed('resourceUsed', r.id, (v.resourceUsed[r.id] ?? 0) + 1)} aria-label={`Use 1 ${r.name}`}>
                    −
                  </button>
                )}
                <span style={{ minWidth: 40, textAlign: 'center' }}>
                  {left}/{r.max}
                </span>
                {!readOnly && (
                  <button type="button" className="gs-chip" disabled={left >= r.max} onClick={() => setUsed('resourceUsed', r.id, (v.resourceUsed[r.id] ?? 0) - 1)} aria-label={`Get 1 ${r.name} back`}>
                    +
                  </button>
                )}
              </div>
            )
          })}
        </Section>
      )}

      {d.weapons.length > 0 && (
        <Section title="Weapons">
          {d.weapons.map((w) => {
            const ammo = ammoLeft(v, w.id)
            const can = canFire(w.station)
            return (
              <div key={w.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong style={{ fontSize: 13, flex: 1 }}>{w.name}</strong>
                  {ammo !== null && (
                    <span style={{ fontSize: 11, color: ammo === 0 ? 'var(--danger)' : 'var(--text-muted)' }} title="Shots left">
                      {ammo}/{w.ammo}
                    </span>
                  )}
                  {!readOnly && ammo !== null && ammo < (w.ammo ?? 0) && (
                    <button type="button" className="gs-chip" onClick={() => setUsed('ammoUsed', w.id, 0)} title="Reload">
                      Reload
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{weaponLine(w, d.stations)}</div>
                {w.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w.notes}</div>}
                {can && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="gb-btn gb-btn--primary" style={smallButton} disabled={ammo === 0} onClick={() => fire(w)} title={ammo === 0 ? 'Out of ammo' : 'Roll its attack and damage'}>
                      Fire
                    </button>
                    {w.damage && (
                      <button type="button" className="gb-btn gb-btn--secondary" style={smallButton} onClick={() => rollDice(w.damage, `${w.name} Damage`)} title="Roll just the damage">
                        Damage only
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </Section>
      )}

      {d.stations.length > 0 && (
        <Section title="Crew">
          {d.stations.map((s) => (
            <StationRow key={s.id} station={s} people={v.crew[s.id] ?? []} readOnly={readOnly} playerCharacters={playerCharacters} onChange={(people) => onChange({ ...v, crew: { ...v.crew, [s.id]: people } })} />
          ))}
          {readOnly && myStations && myStations.length === 0 && <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>You’re not at a station. The DM puts crew in place.</p>}
        </Section>
      )}

      {(d.traits.length > 0 || d.actions.length > 0) && (
        <Section title="Traits and actions">
          <div onClick={(e) => rollInlineDice(e, rollSessionId)} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[...d.traits, ...d.actions].map((t, i) => (
              <div key={i} style={{ fontSize: 12 }}>
                <strong>{t.name}.</strong> <span dangerouslySetInnerHTML={{ __html: inlineTextHtml(t.desc) }} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Conditions">
        <Tags values={v.conditions} readOnly={readOnly} placeholder="Add (Boarded, On fire…)" onChange={(conditions) => onChange({ ...v, conditions })} />
      </Section>

      <Section title={`Cargo${d.cargo ? ` (holds ${d.cargo})` : ''}`}>
        {v.cargo.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ flex: 1 }}>{c.name}</span>
            {readOnly ? (
              <span>×{c.quantity}</span>
            ) : (
              <>
                <input type="number" min={0} className="gb-input" value={c.quantity} onChange={(e) => onChange({ ...v, cargo: v.cargo.map((x, j) => (j === i ? { ...x, quantity: Math.max(0, Number(e.target.value) || 0) } : x)) })} style={{ width: 54, padding: '2px 6px' }} aria-label={`${c.name} quantity`} />
                <button type="button" style={iconButton} onClick={() => onChange({ ...v, cargo: v.cargo.filter((_, j) => j !== i) })} title="Remove">
                  <XIcon size={10} />
                </button>
              </>
            )}
          </div>
        ))}
        {!readOnly && <AddLine placeholder="Add cargo" onAdd={(name) => onChange({ ...v, cargo: [...v.cargo, { name, quantity: 1 }] })} />}
        {readOnly && v.cargo.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Empty</span>}
      </Section>

      <Section title="Notes">
        {readOnly ? (
          <p style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', color: v.notes ? undefined : 'var(--text-muted)' }}>{v.notes || 'Nothing yet.'}</p>
        ) : (
          <textarea className="gb-input" value={v.notes} onChange={(e) => onChange({ ...v, notes: e.target.value })} placeholder="Where it is, who owes money on it…" style={{ minHeight: 50, resize: 'vertical', fontSize: 12 }} />
        )}
      </Section>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" className="gb-btn gb-btn--ghost" style={smallButton} onClick={() => setShowBlock((x) => !x)}>
          {showBlock ? 'Hide statblock' : 'Statblock'}
        </button>
        {!readOnly && (
          <>
            {d.resources.length > 0 && (
              <>
                <button type="button" className="gb-btn gb-btn--ghost" style={smallButton} onClick={() => onChange(restVehicle(v, 'short'))} title="Short-rest resources come back">
                  Short rest
                </button>
                <button type="button" className="gb-btn gb-btn--ghost" style={smallButton} onClick={() => onChange(restVehicle(v, 'long'))} title="Long-rest and dawn resources come back too">
                  Long rest
                </button>
              </>
            )}
            {onAddToInitiative && (
              <button type="button" className="gb-btn gb-btn--secondary" style={smallButton} onClick={() => onAddToInitiative(v)}>
                Add to initiative
              </button>
            )}
            <ConfirmButton label="Remove" confirmLabel="Remove it?" variant="ghost" danger style={smallButton} title="Stop tracking this vehicle" onConfirm={onRemove} />
          </>
        )}
      </div>
      {showBlock && (
        <div onClick={(e) => rollInlineDice(e, rollSessionId)}>
          <VehicleCard vehicle={d} />
        </div>
      )}
    </div>
  )
}

/** One station and who's at it. The DM adds a party member's character or just types a name (a hired hand, an NPC). */
function StationRow({
  station,
  people,
  readOnly,
  playerCharacters,
  onChange
}: {
  station: VehicleDef['stations'][number]
  people: TrackedVehicle['crew'][string]
  readOnly: boolean
  playerCharacters?: Map<string, CharacterSheet>
  onChange: (people: TrackedVehicle['crew'][string]) => void
}): JSX.Element {
  const full = people.length >= station.count
  const party = [...(playerCharacters?.entries() ?? [])].filter(([userId]) => !people.some((p) => p.userId === userId))
  return (
    <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 3 }} title={station.notes || undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{station.name}</span>
        <span style={{ color: full ? 'var(--text-muted)' : 'var(--accent)' }}>
          {people.length}/{station.count}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {people.map((p, i) => (
          <span key={i} className="gb-badge" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {p.name}
            {!readOnly && (
              <button type="button" style={{ ...iconButton, padding: 0 }} onClick={() => onChange(people.filter((_, j) => j !== i))} title={`Take ${p.name} off ${station.name}`}>
                <XIcon size={9} />
              </button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && !full && (
        <div style={{ display: 'flex', gap: 4 }}>
          {party.length > 0 && (
            <select
              className="gb-input"
              value=""
              onChange={(e) => {
                const ch = playerCharacters?.get(e.target.value)
                if (ch) onChange([...people, { name: ch.name || 'Unnamed', characterId: ch.id, userId: e.target.value }])
              }}
              style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
              aria-label={`Put a party member at ${station.name}`}
            >
              <option value="">Party member…</option>
              {party.map(([userId, ch]) => (
                <option key={userId} value={userId}>
                  {ch.name || 'Unnamed'}
                </option>
              ))}
            </select>
          )}
          <AddLine placeholder="Or a name" onAdd={(name) => onChange([...people, { name }])} />
        </div>
      )}
    </div>
  )
}

/** A box that adds what's typed on Enter. */
function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }): JSX.Element {
  const [text, setText] = useState('')
  return (
    <input
      className="gb-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && text.trim()) {
          onAdd(text.trim())
          setText('')
        }
      }}
      placeholder={placeholder}
      style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
    />
  )
}

function Tags({ values, readOnly, placeholder, onChange }: { values: string[]; readOnly: boolean; placeholder: string; onChange: (v: string[]) => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {values.map((t, i) => (
        <span key={i} className="gb-badge" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {t}
          {!readOnly && (
            <button type="button" style={{ ...iconButton, padding: 0 }} onClick={() => onChange(values.filter((_, j) => j !== i))} title={`Remove ${t}`}>
              <XIcon size={9} />
            </button>
          )}
        </span>
      ))}
      {readOnly && values.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>None</span>}
      {!readOnly && <AddLine placeholder={placeholder} onAdd={(t) => onChange([...values, t])} />}
    </div>
  )
}

const smallButton = { fontSize: 11, padding: '3px 8px' } as const
const fieldStyle = { fontSize: 12, padding: '3px 6px' } as const
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-muted)' } as const
const checkLabel = { display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' } as const
const iconButton = { background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'inline-flex' } as const
