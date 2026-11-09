import type { ReactNode } from 'react'
import { ResizableSidebar } from '../../ui/ResizableSidebar'

/** The classic screens' left sidebar: the notes tree, resizable and collapsible, with the switcher and settings along its foot. */
export function ClassicSidebar({ footer, children }: { footer: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <ResizableSidebar
      defaultWidth={220}
      collapseStorageKey="gb-sidebar-collapsed:notes"
      widthStorageKey="gb-sidebar-width:notes"
      footer={
        <div
          style={{
            borderRight: '1px solid var(--border-subtle)',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-sunken)',
            padding: 'var(--space-2)',
            display: 'flex',
            gap: 'var(--space-2)',
            flexShrink: 0,
            minWidth: 0
          }}
        >
          {footer}
        </div>
      }
    >
      <div style={{ height: '100%', borderRight: '1px solid var(--border-subtle)' }}>{children}</div>
    </ResizableSidebar>
  )
}
