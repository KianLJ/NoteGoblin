// The DM's stand-in players for trying a map out before the table meets:
// each joins every fight as a party member, playing one of the DM's own
// characters (or just a token with a darkvision range). "Play as" in the
// Combat tab's header then shows the map through their eyes.
import { useEffect, useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { TestPlayer } from '@shared/battleMap'
import { XIcon } from '../../ui/icons'
import { setLibrary, useBattleLibrary } from './encounterStore'

const DARKVISION = [0, 30, 60, 90, 120]
const CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']
const SCORES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
const QUICK = '__quick'

export function TestPlayersMenu(): JSX.Element {
  const library = useBattleLibrary()
  const tests = library.testPlayers ?? []
  const [open, setOpen] = useState(false)
  const [characters, setCharacters] = useState<CharacterSheet[]>([])
  const [name, setName] = useState('')
  const [characterId, setCharacterId] = useState('')
  const [darkvision, setDarkvision] = useState(0)
  const [quick, setQuick] = useState<NonNullable<TestPlayer['quick']>>({ className: 'Fighter', level: 3, scores: { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 10 } })

  // Your characters, read fresh each time it opens; Escape closes it.
  useEffect(() => {
    if (!open) return
    void window.goblin.characters.list().then((result) => result.ok && setCharacters(result.data))
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const save = (next: TestPlayer[]): void => setLibrary((l) => ({ ...l, testPlayers: next }))
  function add(): void {
    const sheet = characters.find((c) => c.id === characterId)
    const isQuick = characterId === QUICK
    const player: TestPlayer = {
      id: crypto.randomUUID(),
      name: name.trim() || sheet?.name || (isQuick ? `${quick.className} ${tests.length + 1}` : `Test player ${tests.length + 1}`),
      characterId: sheet ? sheet.id : null,
      ...(sheet || isQuick || !darkvision ? {} : { darkvision }),
      ...(isQuick ? { quick } : {})
    }
    save([...tests, player])
    setName('')
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Stand-in players, to try the map out as the party would"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, border: `1px solid ${open ? 'var(--accent)' : 'var(--border-strong)'}`, background: 'var(--bg-surface-raised)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        Test players{tests.length ? ` (${tests.length})` : ''}
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, width: 300, padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
            <div style={{ color: 'var(--text-muted)' }}>
              Stand-ins join every fight in this campaign as party members. Pick one in the Combat tab’s “Play as” to see the map through their eyes and move their token. One that plays a character can also crew a vehicle’s stations (Initiative → Vehicles) and roll with that character’s numbers.
            </div>
            {tests.map((t) => {
              const sheet = characters.find((c) => c.id === t.characterId)
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-raised)' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {t.characterId ? `Plays ${sheet?.name ?? 'one of your characters'}` : t.quick ? `Level ${t.quick.level} ${t.quick.className} (stand-in)` : t.darkvision ? `Just a token, darkvision ${t.darkvision} ft` : 'Just a token'}
                    </span>
                  </span>
                  <button type="button" onClick={() => save(tests.filter((x) => x.id !== t.id))} title={`Remove ${t.name}`} style={{ background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex' }}>
                    <XIcon size={11} />
                  </button>
                </div>
              )
            })}
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />
            <input className="gb-input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Name (optional)" style={{ fontSize: 12, padding: '4px 8px' }} />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="gb-label" style={{ margin: 0 }}>
                Plays
              </span>
              <select className="gb-input" value={characterId} onChange={(e) => setCharacterId(e.target.value)} style={{ fontSize: 12, padding: '3px 6px' }}>
                <option value={QUICK}>A quick stand-in (class, level, scores)</option>
                <option value="">Just a token (can’t crew a vehicle)</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || 'Unnamed character'}
                  </option>
                ))}
              </select>
            </label>
            {characterId === QUICK && (
              <>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="gb-input" value={quick.className} onChange={(e) => setQuick({ ...quick, className: e.target.value })} style={{ flex: 1, fontSize: 12, padding: '3px 6px' }} aria-label="Class">
                    {CLASSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Level
                    <input className="gb-input" type="number" min={1} max={20} value={quick.level} onChange={(e) => setQuick({ ...quick, level: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} style={{ width: 48, fontSize: 12, padding: '2px 4px' }} />
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                  {SCORES.map((s) => (
                    <label key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--text-muted)' }}>
                      {s.toUpperCase()}
                      <input className="gb-input" type="number" min={1} max={30} value={quick.scores[s]} onChange={(e) => setQuick({ ...quick, scores: { ...quick.scores, [s]: Math.max(1, Math.min(30, Number(e.target.value) || 10)) } })} style={{ width: '100%', fontSize: 12, padding: '2px 2px', textAlign: 'center' }} />
                    </label>
                  ))}
                </div>
              </>
            )}
            {!characterId && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Darkvision
                <select className="gb-input" value={darkvision} onChange={(e) => setDarkvision(Number(e.target.value))} style={{ fontSize: 12, padding: '3px 6px' }}>
                  {DARKVISION.map((d) => (
                    <option key={d} value={d}>
                      {d ? `${d} ft` : 'None'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className="gb-btn gb-btn--primary" style={{ fontSize: 12, padding: '4px 10px', alignSelf: 'flex-start' }} onClick={add}>
              + Add test player
            </button>
          </div>
        </>
      )}
    </div>
  )
}
