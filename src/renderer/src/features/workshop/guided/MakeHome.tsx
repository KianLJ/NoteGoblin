import { useState, type ReactNode } from 'react'
import { GUIDED_KINDS, guidedEntries, type GuidedKind } from '@shared/content/guided'
import type { ContentPack } from '@shared/content/schema'
import type { PackDraft } from '@shared/content/workshop'

/** Small line icons for the make cards (no emoji). */
const ICONS: Record<GuidedKind, JSX.Element> = {
  magicItem: <path d="M12 3l2.2 5.2L20 9l-4.4 3.8L17 18.5 12 15.6 7 18.5l1.4-5.7L4 9l5.8-.8z" />,
  weapon: <path d="M19 3l2 2-11 11-3 1 1-3zM5 15l4 4M3 21l3-3" />,
  armor: <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />,
  spell: <path d="M5 19l9-9M14 4v3M18 8h3M17 5l2-2M12 6l1 2M16 10l2 1M7 11l1-1M11 15l-1 1" />,
  feat: <path d="M12 2l3 6 6 .9-4.5 4.4 1 6.2L12 16.6 6.5 19.5l1-6.2L3 8.9 9 8z" />,
  species: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />,
  monster: <path d="M5 20c0-6 2-11 7-11s7 5 7 11M8 9L6 4l4 3M16 9l2-5-4 3M10 14h.01M14 14h.01" />
}

const PLURAL: Record<GuidedKind, string> = {
  magicItem: 'Magic items',
  weapon: 'Weapons',
  armor: 'Armour and shields',
  spell: 'Spells',
  feat: 'Feats',
  species: 'Species',
  monster: 'Monsters'
}

/** A heading with a count that folds what's under it. */
function Fold({ title, count, defaultOpen, indent, children }: { title: ReactNode; count: number; defaultOpen: boolean; indent?: boolean; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginLeft: indent ? 14 : 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', padding: '2px 0', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left' }}
      >
        <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms', flexShrink: 0 }}>
          <path d="M6 3l5 5-5 5" />
        </svg>
        {title}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{count}</span>
      </button>
      {open && children}
    </div>
  )
}

function KindIcon({ kind }: { kind: GuidedKind }): JSX.Element {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[kind]}
    </svg>
  )
}

/**
 * The Workshop's front door: "What do you want to make?" — one card per
 * guided kind — and the things already made with them (the My Homebrew
 * pack). The full pack editor is a step away for everything else.
 */
export function MakeHome({
  library,
  onMake,
  onOpen,
  onFullEditor,
  onImport,
  busy
}: {
  library: ContentPack[]
  onMake: (kind: GuidedKind) => void
  onOpen: (kind: GuidedKind, entry: Record<string, unknown>, packId: string) => void
  onFullEditor: () => void
  onImport: () => void
  busy?: boolean
}): JSX.Element {
  // Everything in your packs a guided form can open, by pack.
  const made = library.map((p) => ({ pack: p, entries: guidedEntries(p as unknown as PackDraft) })).filter((g) => g.entries.length > 0)
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 24 }}>What do you want to make?</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Pick one and fill in the blanks — the character sheet works out the numbers. New things go in your <strong>My Homebrew</strong> pack unless you pick another one when you save.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
          {GUIDED_KINDS.map((k) => (
            <button key={k.kind} type="button" className="gb-card" onClick={() => onMake(k.kind)} style={{ padding: 'var(--space-3)', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>
                <KindIcon kind={k.kind} />
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{k.title}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{k.hint}</span>
              </span>
            </button>
          ))}
        </div>

        {made.map(({ pack, entries }) => (
          <Fold key={pack.id} title={<span style={{ fontSize: 15, fontFamily: 'var(--font-display)' }}>In {pack.name}</span>} count={entries.length} defaultOpen={made.length === 1 || entries.length <= 12}>
            {GUIDED_KINDS.filter((g) => entries.some((e) => e.kind === g.kind)).map((g) => {
              const ofKind = entries.filter((e) => e.kind === g.kind).sort((a, b) => String(a.entry.name ?? '').localeCompare(String(b.entry.name ?? '')))
              return (
                <Fold key={g.kind} title={<span style={{ fontSize: 13, fontWeight: 700 }}>{PLURAL[g.kind]}</span>} count={ofKind.length} defaultOpen={ofKind.length <= 8} indent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {ofKind.map(({ kind, entry }) => (
                <button
                  key={`${kind}:${String(entry.id)}`}
                  type="button"
                  onClick={() => onOpen(kind, entry, pack.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--text-primary)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                  className="gb-hover-row"
                >
                  <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                    <KindIcon kind={kind} />
                  </span>
                  <strong style={{ fontSize: 13, flex: 1 }}>{String(entry.name ?? 'Untitled')}</strong>
                </button>
              ))}
            </div>
                </Fold>
              )
            })}
          </Fold>
        ))}

        <div className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong style={{ fontSize: 13 }}>Something bigger?</strong>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Classes, subclasses and backgrounds — and every option for the things above — are in the full editor, where you can also build whole packs to share.
          </span>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button type="button" className="gb-btn gb-btn--secondary" onClick={onFullEditor} style={{ fontSize: 12, padding: '4px 10px' }}>
              Open the full editor
            </button>
            <button type="button" className="gb-btn gb-btn--ghost" disabled={busy} onClick={onImport} style={{ fontSize: 12, padding: '4px 10px' }}>
              Import a pack file…
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
