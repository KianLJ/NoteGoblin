import type { ReactNode } from 'react'
import { findNode, type CanvasLayout } from '@shared/canvasLayout'
import { TOOL_META, TOOLS_BY_MODE, type CanvasMode, type ToolKind } from '@shared/canvasTools'

export interface CanvasItem {
  /** A tool kind ('calendar') or an open-many id ('note:<id>') — see shared/canvasLayout.ts. */
  id: string
  title: ReactNode
  icon?: ReactNode
  size: { w: number; h: number }
  content: ReactNode
  actions?: ReactNode
  /** Fired when the node is clicked into — e.g. to make its note the active one. */
  onFocus?: () => void
  /** Open-many nodes say what closing them means (closing a note's tab); a tool just leaves the canvas. */
  onClose?: () => void
  /** Extra classes on the box, to style a kind of box (a sticky note). */
  className?: string
  /** No close button (a session's scene: delete it from its own title-bar action instead). */
  noClose?: boolean
}

/** What each tool shows, for the tools a workspace has right now. */
export type ToolContents = Partial<Record<ToolKind, ReactNode>>

/** The canvas items for every tool that's open in `layout` (a tool is open while the layout holds its node). */
export function toolItems(mode: CanvasMode, layout: CanvasLayout, contents: ToolContents, icons: Record<ToolKind, ReactNode>): CanvasItem[] {
  return TOOLS_BY_MODE[mode]
    .filter((kind) => contents[kind] !== undefined && findNode(layout, kind))
    .map((kind) => ({
      id: kind,
      title: TOOL_META[kind].title,
      icon: icons[kind],
      size: TOOL_META[kind],
      content: contents[kind]
    }))
}

