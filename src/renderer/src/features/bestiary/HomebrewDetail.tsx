import type { CodexEntry } from '@shared/content/codexContent'

/** A content-pack entry, whatever its kind: its facts, description and longer parts (levels, traits, options), with the pack it's from. */
export function HomebrewDetail({ entry }: { entry: CodexEntry }): JSX.Element {
  return (
    <div>
      <DetailHeader name={entry.name} subtitle={`${entry.kindLabel} · ${entry.packName}`} />
      <span className="gb-badge gb-badge--accent" style={{ fontSize: 10 }} title={entry.fullId}>
        {entry.packName}
      </span>
      <div style={{ marginTop: 'var(--space-3)' }}>
        {entry.fields.map((f) => (
          <DetailField key={f.label} label={f.label} value={f.value} />
        ))}
      </div>
      {entry.description && <p style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{entry.description}</p>}
      {entry.sections.map((section) => (
        <div key={section.title} style={{ marginTop: 'var(--space-4)' }}>
          <div className="gb-label">{section.title}</div>
          {section.items.map((item, i) => (
            <div key={i} style={{ marginBottom: 'var(--space-2)' }}>
              {(item.name || item.meta) && (
                <div style={{ fontSize: 13 }}>
                  {item.name && <strong>{item.name}</strong>}
                  {item.meta && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{item.meta}</span>}
                </div>
              )}
              {item.description && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.description}</div>}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function DetailHeader({ name, subtitle }: { name: string; subtitle: string }): JSX.Element {
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--accent)' }}>{name}</div>
      <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-secondary)' }}>{subtitle}</div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ fontSize: 13, marginBottom: 3 }}>
      <strong>{label}: </strong>
      <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
    </div>
  )
}
