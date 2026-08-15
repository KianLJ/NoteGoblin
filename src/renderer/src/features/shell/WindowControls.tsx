import { useEffect, useState, type ReactNode } from 'react'
import { CloseWindowIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from './icons'

/** Hand-drawn minimize/maximize/close, since the window is frame:false — see main/index.ts for why (native titleBarOverlay's drag hit-testing was unreliable). Sits at the far right of the header, outside the drag region. */
export function WindowControls(): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.goblin.windowControls.isMaximized().then(setMaximized)
    return window.goblin.windowControls.onMaximizedChange(setMaximized)
  }, [])

  return (
    <div className="gb-no-drag" style={{ display: 'flex', alignItems: 'stretch', height: 44, flexShrink: 0 }}>
      <ControlButton title="Minimize" onClick={() => window.goblin.windowControls.minimize()}>
        <MinimizeIcon />
      </ControlButton>
      <ControlButton title={maximized ? 'Restore' : 'Maximize'} onClick={() => window.goblin.windowControls.toggleMaximize()}>
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </ControlButton>
      <ControlButton title="Close" danger onClick={() => window.goblin.windowControls.close()}>
        <CloseWindowIcon />
      </ControlButton>
    </div>
  )
}

function ControlButton({
  title,
  danger,
  onClick,
  children
}: {
  title: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 46,
        border: 'none',
        background: 'none',
        color: 'var(--text-secondary)',
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'var(--danger)' : 'var(--bg-sunken)'
        e.currentTarget.style.color = danger ? 'var(--text-on-accent)' : 'var(--text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
        e.currentTarget.style.color = 'var(--text-secondary)'
      }}
    >
      {children}
    </button>
  )
}
