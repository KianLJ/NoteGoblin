// Pieces of the Combat tab's side panel shared by the DM's view and the
// player's: a character's actions and spells (the sheet's own Actions and
// Spells tabs), a monster's abilities with their dice to click, and the
// hit point and initiative controls.
import { useMemo, useState, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { CharacterSheetData } from '@shared/dnd5e'
import { deriveSheet } from '@shared/content/sheet'
import type { BestiaryMonster } from '../../data/bestiary'
import { inlineTextHtml } from '../../markdown'
import { rollInlineDice } from '../dice/inlineDice'
import { CombatTab } from '../player/characterSheetTabs/CombatTab'
import { SpellsTab } from '../player/characterSheetTabs/SpellsTab'

/**
 * A character's Actions (attacks, special and bonus actions, toggles,
 * reactions) and Spells, as on their sheet. With `onSave` (the player's own
 * character) using one spends its uses and slots on the sheet; without, it's
 * for looking at.
 */
export function CharacterTabs({ character, sessionId, onSave }: { character: CharacterSheet; sessionId: string | null; onSave?: (patch: Partial<CharacterSheetData>) => void }): JSX.Element {
  const { derived } = useMemo(() => deriveSheet(character), [character])
  const caster = character.spellcastingAbility !== null || derived.spellcasting.sources.length > 0 || character.spells.length > 0
  const [tab, setTab] = useState<'actions' | 'spells'>('actions')
  const readOnly = !onSave
  const save = onSave ?? noSave
  return (
    <div className="gb-combat-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {caster && (
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border-subtle)' }}>
          {(['actions', 'spells'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} style={tabButton(tab === t)}>
              {t === 'actions' ? 'Actions' : 'Spells'}
            </button>
          ))}
        </div>
      )}
      {/* Both stay mounted, so an edit waiting to save isn't lost by looking at the other. */}
      <div style={{ display: tab === 'actions' || !caster ? 'block' : 'none' }}>
        <CombatTab character={character} onSave={save} readOnly={readOnly} sessionId={sessionId} actionsOnly compact />
      </div>
      {caster && (
        <div style={{ display: tab === 'spells' ? 'block' : 'none' }}>
          <SpellsTab character={character} onSave={save} readOnly={readOnly} sessionId={sessionId} />
        </div>
      )}
    </div>
  )
}

function noSave(): void {}

/** A statblock's dice in brackets ("13 (2d8 + 4)") made clickable, like a `dice:` span. */
function withDiceButtons(text: string): string {
  return inlineTextHtml(text.replace(/\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/g, '(`dice: $1`)'))
}

/** A monster's traits, actions, bonus actions, reactions and legendary actions, each with its dice to click. */
export function MonsterAbilities({ monster, sessionId }: { monster: BestiaryMonster; sessionId: string | null }): JSX.Element {
  const sections: Array<[string, Array<{ name: string; desc: string }> | undefined]> = [
    ['Traits', monster.traits],
    ['Actions', monster.actions],
    ['Bonus actions', monster.bonus_actions],
    ['Reactions', monster.reactions],
    ['Legendary actions', monster.legendary_actions]
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onClick={(e) => rollInlineDice(e, sessionId)}>
      {sections
        .filter(([, list]) => list && list.length > 0)
        .map(([title, list]) => (
          <PanelBlock key={title} title={title}>
            {list!.map((a, i) => (
              <div key={i} className="gb-markdown" style={{ fontSize: 12, lineHeight: 1.45, padding: '6px 8px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)' }}>
                <strong>{a.name}.</strong> <span dangerouslySetInnerHTML={{ __html: withDiceButtons(a.desc) }} />
              </div>
            ))}
          </PanelBlock>
        ))}
    </div>
  )
}

export function PanelBlock({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="gb-label" style={{ margin: 0 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

/** Hit points: an amount, then Damage or Heal (Repair, for a vehicle) — and Temp for a character with temporary hit points to give. */
export function HpControls({ onHp, repair, temp }: { onHp: (amount: number, kind: 'damage' | 'heal' | 'temp') => void; repair?: boolean; temp?: boolean }): JSX.Element {
  const [amount, setAmount] = useState('')
  const n = Number(amount)
  const hit = (kind: 'damage' | 'heal' | 'temp'): void => {
    if (!(n > 0)) return
    onHp(n, kind)
    setAmount('')
  }
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <input type="number" min={1} className="gb-input" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && hit('damage')} placeholder="0" aria-label="Amount" style={{ width: 56, padding: '4px 8px' }} />
      <button type="button" className="gb-btn gb-btn--secondary" style={{ ...btn, flex: 1, color: 'var(--danger)' }} disabled={!(n > 0)} onClick={() => hit('damage')}>
        Damage
      </button>
      <button type="button" className="gb-btn gb-btn--secondary" style={{ ...btn, flex: 1, color: 'var(--success)' }} disabled={!(n > 0)} onClick={() => hit('heal')}>
        {repair ? 'Repair' : 'Heal'}
      </button>
      {temp && (
        <button type="button" className="gb-btn gb-btn--secondary" style={{ ...btn, flex: 1 }} disabled={!(n > 0)} onClick={() => hit('temp')} title="Temporary hit points (they don't stack: the higher stays)">
          Temp
        </button>
      )}
    </div>
  )
}

/** An initiative number to type, and a d20 to roll it. */
export function InitiativeField({ value, onChange, onRoll, rollTitle }: { value: number | null; onChange: (v: number | null) => void; onRoll?: () => void; rollTitle?: string }): JSX.Element {
  return (
    <div style={{ textAlign: 'center', padding: 6, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <input
          type="number"
          className="gb-input"
          value={value ?? ''}
          placeholder="–"
          onChange={(e) => onChange(e.target.value === '' ? null : Math.round(Number(e.target.value)))}
          aria-label="Initiative"
          style={{ width: 46, padding: '1px 2px', fontFamily: 'var(--font-display)', fontSize: 18, textAlign: 'center', background: 'transparent', border: '1px solid transparent' }}
        />
        {onRoll && (
          <button type="button" onClick={onRoll} title={rollTitle ?? 'Roll initiative'} style={{ background: 'none', border: '1px solid var(--accent)', color: 'var(--accent-hover)', borderRadius: 999, fontSize: 10, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
            d20
          </button>
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Init</div>
    </div>
  )
}

export function Stat({ value, label }: { value: string; label: string }): JSX.Element {
  return (
    <div style={{ textAlign: 'center', padding: 6, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

/**
 * Hit point changes on a character sheet: damage comes off temporary hit
 * points first, healing can't go past the maximum, and temporary hit points
 * don't stack (the higher stays).
 */
export function hpChange(currentHp: number, tempHp: number, maxHp: number, amount: number, kind: 'damage' | 'heal' | 'temp'): { currentHp: number; tempHp: number } {
  if (kind === 'temp') return { currentHp, tempHp: Math.max(tempHp, amount) }
  if (kind === 'heal') return { currentHp: Math.min(maxHp, Math.max(0, currentHp) + amount), tempHp }
  const fromTemp = Math.min(tempHp, amount)
  return { currentHp: Math.max(0, currentHp - (amount - fromTemp)), tempHp: tempHp - fromTemp }
}

const btn = { fontSize: 12, padding: '4px 10px' } as const
const tabButton = (on: boolean): React.CSSProperties => ({
  border: 0,
  borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
  background: 'none',
  color: on ? 'var(--accent-hover)' : 'var(--text-secondary)',
  padding: '5px 10px',
  cursor: 'pointer',
  fontSize: 12,
  font: 'inherit'
})
