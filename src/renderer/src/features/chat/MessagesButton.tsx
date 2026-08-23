import { useEffect, useRef, useState } from 'react'
import { ChatIcon } from '../campaigns/panelIcons'
import { ChatPanel } from './ChatPanel'
import { useMessageToast } from './useMessageToast'
import { MessageToast } from './MessageToast'

interface MessagesButtonProps {
  campaignId: string | null
  sessionId: string | null
  myUserId: string | null
}

/**
 * Header-level Messages entry point — same popover pattern as FriendsMenu.tsx
 * right next to it. ChatPanel itself stays mounted at all times (just hidden
 * via CSS when the popover's closed, not unmounted), so its own live unread
 * tracking (Party's local counter in particular — see ChatPanel.tsx) keeps
 * running in the background instead of resetting every time you close this.
 */
export function MessagesButton({ campaignId, sessionId, myUserId }: MessagesButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const toast = useMessageToast(campaignId, myUserId)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="gb-btn gb-btn--secondary"
        title="Messages"
        style={{ position: 'relative', padding: 'var(--space-2)', display: 'flex' }}
      >
        <ChatIcon />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 15,
              height: 15,
              padding: '0 3px',
              borderRadius: '999px',
              background: 'var(--accent)',
              color: 'var(--accent-contrast, #fff)',
              fontSize: 9,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {!open && toast && <MessageToast key={toast.id} toast={toast} />}

      <div
        className="gb-card"
        style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: 320,
          height: 420,
          zIndex: 20,
          padding: 0,
          overflow: 'hidden',
          display: open ? 'flex' : 'none',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <ChatPanel campaignId={campaignId} sessionId={sessionId} myUserId={myUserId} onUnreadTotalChange={setUnread} />
      </div>
    </div>
  )
}
