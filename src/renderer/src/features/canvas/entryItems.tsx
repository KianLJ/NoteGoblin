import { Suspense, lazy } from 'react'
import { findNode, type CanvasLayout } from '@shared/canvasLayout'
import { DYNAMIC_SIZE, type CanvasMode } from '@shared/canvasTools'
import { StatblockCard } from '../campaigns/StatblockCard'
import { ImageIcon, PawIcon, PencilIcon, StickyIcon } from '../campaigns/icons'
import type { BestiaryMonster } from '../../data/bestiary'
import { BestiaryIcon } from '../shell/icons'
import { dropEntry, type CanvasEntry } from './canvasEntries'
import type { CanvasItem } from './toolItems'
import { StickyColorButton, StickyNote } from './StickyNote'
import { ImageBox } from './ImageBox'
import { deleteCanvasImage } from './canvasImages'

// The Codex's code loads the first time an entry's box shows.
const CodexEntryView = lazy(() => import('../bestiary/Bestiary').then((m) => ({ default: m.CodexEntryView })))

/**
 * A box for every Codex entry, statblock and sticky note on this canvas (see canvasEntries.ts). Closing one
 * forgets it. With `onEditMonster` (the DM's canvas), a statblock's title bar has an Edit button.
 */
export function entryItems(
  mode: CanvasMode,
  layout: CanvasLayout,
  entries: Record<string, CanvasEntry>,
  onEditMonster?: (nodeId: string, monster: BestiaryMonster) => void
): CanvasItem[] {
  return Object.entries(entries)
    .filter(([id]) => findNode(layout, id))
    .map(([id, entry]): CanvasItem => {
      if (entry.kind === 'image') {
        return {
          id,
          title: entry.name,
          icon: <ImageIcon />,
          size: { w: 400, h: 332 },
          onClose: () => {
            dropEntry(mode, id)
            void deleteCanvasImage(entry.id)
          },
          content: <ImageBox image={entry} />
        }
      }
      if (entry.kind === 'sticky') {
        return {
          id,
          title: entry.text.split('\n')[0].trim() || 'Sticky note',
          icon: <StickyIcon />,
          size: DYNAMIC_SIZE.sticky,
          className: `gb-canvas-node--sticky gb-sticky--${entry.color}`,
          actions: <StickyColorButton mode={mode} sticky={entry} />,
          onClose: () => dropEntry(mode, id),
          content: <StickyNote mode={mode} sticky={entry} />
        }
      }
      return {
        id,
        title: entry.kind === 'monster' ? entry.monster.name : entry.name,
        icon: entry.kind === 'monster' ? <PawIcon /> : <BestiaryIcon />,
        size: entry.kind === 'monster' ? DYNAMIC_SIZE.monster : DYNAMIC_SIZE.entry,
        actions:
          entry.kind === 'monster' && onEditMonster ? (
            <button type="button" className="gb-canvas-node-close" title="Edit this statblock" aria-label="Edit this statblock" onClick={() => onEditMonster(id, entry.monster)}>
              <PencilIcon />
            </button>
          ) : undefined,
        onClose: () => dropEntry(mode, id),
        content:
          entry.kind === 'monster' ? (
            <StatblockCard monster={entry.monster} />
          ) : (
            <Suspense fallback={null}>
              <CodexEntryView kind={entry.kind} id={entry.id} />
            </Suspense>
          )
      }
    })
}
