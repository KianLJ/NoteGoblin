// The campaign's vehicles (the Initiative tab's Vehicles, for the DM and
// players alike): every vehicle the campaign tracks — mounts, carts, ships,
// starships — set up between fights: its hull and components, supplies, who's
// aboard and where, how good its hired crew is, cargo and notes. The DM
// changes everything; a player sees the vehicles the DM hasn't hidden, and
// where they sit. Fighting with a vehicle happens in the Combat tab.
import { useEffect, useState, type ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import type { CharacterSheet } from '@shared/ipc'
import { vehicleDefSchema, type VehicleDef } from '@shared/content/schema'
import { CREW_TIERS, crewKey, resourceLeft, restVehicle, trackVehicle, vehicleCondition, vehicleName, type TrackedVehicle } from '@shared/vehicles'
import { isTestUser } from '@shared/battleMap'
import { formatModifier } from '@shared/dnd5e'
import { useActivePackRegistry } from '../content/pickerContent'
import { rollInlineDice } from '../dice/inlineDice'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { XIcon } from '../../ui/icons'
import { VehicleCard } from './VehicleCard'
import { crewLabel } from './crewBonus'
import { ComponentHealth } from './ComponentHealth'
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

export function VehiclesPanel({ sessionId, rollSessionId, campaignId, readOnly, myUserId = null, onAddToInitiative, focus }: VehiclesPanelProps): JSX.Element {
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

/**
 * One tracked vehicle, set up between fights: who's aboard and where, how
 * good its hired crew is, its hull and parts, supplies, cargo and notes.
 * Fighting with it — its weapons and station actions — happens in the Combat
 * tab (the DM's panel for the ship; each player's for their own station).
 */
function TrackedVehicleCard({
  vehicle: v,
  readOnly,
  rollSessionId,
  myUserId,
  onChange,
  onRemove,
  onClose,
  onAddToInitiative
}: {
  vehicle: TrackedVehicle
  readOnly: boolean
  rollSessionId: string | null
  myUserId: string | null
  onChange: (v: TrackedVehicle) => void
  onRemove: () => void
  onClose: () => void
  onAddToInitiative?: (v: TrackedVehicle) => void
}): JSX.Element {
  const [showBlock, setShowBlock] = useState(false)
  const showNumbers = !readOnly || v.party
  const d = v.def
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
              {readOnly ? (
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>{v.hp}</span>
              ) : (
                <input
                  type="number"
                  min={0}
                  max={d.hp}
                  className="gb-input"
                  value={v.hp}
                  onChange={(e) => onChange({ ...v, hp: Math.max(0, Math.min(d.hp, Math.round(Number(e.target.value) || 0))) })}
                  style={{ width: 70, fontFamily: 'var(--font-display)', fontSize: 18, padding: '1px 6px' }}
                  aria-label="Hit points"
                  title="Its hit points now (in a fight, damage it from the Combat tab)"
                />
              )}
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/ {d.hp}</span>
              {v.tempHp > 0 && <span className="gb-badge" style={{ fontSize: 10 }}>+{v.tempHp} temp</span>}
              {v.hp <= 0 && <span className="gb-badge" style={{ fontSize: 10, color: 'var(--danger)' }}>Wrecked</span>}
            </div>
            <HpBar hp={v.hp} max={d.hp} temp={v.tempHp} height={8} />
          </>
        ) : (
          <span style={{ fontSize: 13 }}>{vehicleCondition(v.hp, d.hp)}</span>
        )}
      </Section>

      {d.components.length > 0 && (
        <Section title="Components">
          <ComponentHealth vehicle={v} readOnly={readOnly} showNumbers={showNumbers} onChange={onChange} />
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

      {d.stations.length > 0 && (
        <Section title="Crew">
          <CrewSetup vehicle={v} readOnly={readOnly} myUserId={myUserId} />
        </Section>
      )}

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

/**
 * Who works the ship, at a glance: the hired crew's tier, and who sits where.
 * It's set in the Combat screen (the ship's Stations tab); a player just sees
 * where they are.
 */
function CrewSetup({ vehicle: v, readOnly, myUserId }: { vehicle: TrackedVehicle; readOnly: boolean; myUserId: string | null }): JSX.Element {
  const stationName = (id: string): string => v.def.stations.find((s) => s.id === id)?.name ?? id
  const whereIs = (key: string): string | null => Object.entries(v.crew).find(([, people]) => people.some((m) => crewKey(m) === key))?.[0] ?? null
  const tier = CREW_TIERS.find((t) => t.id === v.crewTier) ?? CREW_TIERS[1]

  if (readOnly) {
    const mine = myUserId ? whereIs(`user:${myUserId}`) : null
    return (
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
        {mine ? `You’re at ${stationName(mine)} — your rolls are in the Combat tab.` : 'You’re not at a station. The DM puts the party where they sit.'} The rest of the ship is worked by {tier.name.toLowerCase()} crew ({formatModifier(tier.bonus)}).
      </p>
    )
  }

  const seated = Object.entries(v.crew).flatMap(([station, people]) => people.map((m) => ({ station, m })))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
      <span>
        Hired crew: {tier.name} {formatModifier(tier.bonus)}
      </span>
      {seated.map(({ station, m }) => (
        <span key={`${station}:${crewKey(m)}`}>
          {crewLabel(m)}
          {isTestUser(m.userId) ? ' (test)' : ''} · {stationName(station)}
        </span>
      ))}
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Set who sits where (and the crew’s tier) in the Combat screen: select the ship, then its Stations tab.</span>
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


const smallButton = { fontSize: 11, padding: '3px 8px' } as const
const fieldStyle = { fontSize: 12, padding: '3px 6px' } as const
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-muted)' } as const
const checkLabel = { display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' } as const
const iconButton = { background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'inline-flex' } as const
