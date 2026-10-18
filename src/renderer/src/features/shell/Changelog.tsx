import { Modal } from '../../ui/Modal'
import { CHANGELOG } from '../../data/changelog'
import { XIcon } from '../../ui/icons'
import type { UpdateStatus } from '@shared/ipc'
import { UpdatePanel } from './UpdateStatus'

interface ChangelogProps {
  onClose: () => void
  /** The version currently running, highlighted so "what did I just get" is obvious at a glance. Falls back to CHANGELOG's newest entry when unset. */
  currentVersion?: string | null
  /** The auto-updater's status, shown above the list with Check for updates (omitted: no updates block). */
  update?: UpdateStatus
}

export function Changelog({ onClose, currentVersion, update }: ChangelogProps): JSX.Element {
  return (
    <Modal onClose={onClose} width={480}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18 }}>What's new</h2>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
        >
          <XIcon size={12} />
        </button>
      </div>
      {update && <UpdatePanel status={update} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {CHANGELOG.map((entry) => (
          <div key={entry.version}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>
                v{entry.version}
              </span>
              {entry.version === currentVersion && (
                <span className="gb-badge gb-badge--success" style={{ fontSize: 10 }}>
                  Current
                </span>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{entry.title}</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {entry.highlights.map((line, i) => (
                <li key={i} style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  )
}
