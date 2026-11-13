import { useEffect, useRef, useState } from 'react'
import { ChatIcon } from '../campaigns/panelIcons'
import { ChatPanel } from './ChatPanel'
import { useMessageToast } from './useMessageToast'
import { MessageToast } from './MessageToast'
import './chat.css'

interface MessagesButtonProps {
  campaignId: string | null
  sessionId: string | null
  myUserId: string | null
}

/**
 * Header-level Messages entry point — a popover rather than a canvas tool,
 * so it's one click away whatever's on the canvas. ChatPanel itself stays mounted at all times (just hidden
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
        className={open ? 'gb-topbtn on' : 'gb-topbtn'}
        title="Messages"
        aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
      >
        <ChatIcon />
        {unread > 0 && <span className="gb-topbtn-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {!open && toast && <MessageToast key={toast.id} toast={toast} />}

      <div className="gb-card ms-pop" style={{ display: open ? 'flex' : 'none' }}>
        <ChatPanel campaignId={campaignId} sessionId={sessionId} myUserId={myUserId} onUnreadTotalChange={setUnread} visible={open} />
      </div>
    </div>
  )
}
