import './initiative.css'

/** A combatant's wounds (dismemberments) as red tags with a drop of blood — the players' read-only view of them. */
export function WoundTags({ list }: { list: string[] }): JSX.Element | null {
  if (list.length === 0) return null
  return (
    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {list.map((tag) => (
        <span key={tag} className="it-tag it-tag--wound">
          <svg width={10} height={10} viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.5C8 1.5 3.5 6.6 3.5 9.9a4.5 4.5 0 0 0 9 0C12.5 6.6 8 1.5 8 1.5Z" fill="currentColor" />
          </svg>
          {tag}
        </span>
      ))}
    </span>
  )
}
