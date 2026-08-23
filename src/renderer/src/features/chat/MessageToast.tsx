import type { MessageToastInfo } from './useMessageToast'

/** Anchored below the Messages header button by whichever parent sets `position: relative` on it — see MessagesButton.tsx. */
export function MessageToast({ toast }: { toast: MessageToastInfo }): JSX.Element {
  return (
    <div
      className="gb-toast-fade"
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 4,
        maxWidth: 220,
        background: 'var(--bg-surface-raised)',
        border: '1px solid var(--accent)',
        borderRadius: 'var(--radius-sm)',
        padding: '4px 8px',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        boxShadow: 'var(--shadow-md)',
        zIndex: 10,
        pointerEvents: 'none'
      }}
    >
      {toast.text}
    </div>
  )
}
