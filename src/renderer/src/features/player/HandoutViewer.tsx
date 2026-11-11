import { useEffect, useMemo, useState } from 'react'
import type { Handout } from '@shared/ipc'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { renderNoteMarkdown } from '../../markdown'
import { playSfx } from '../audio/soundEffects'

/**
 * A player's side of handouts: whatever the DM shows (ShowToPlayersButton) comes up here, over the canvas,
 * until they close it. A newer one replaces it. `knownTitles` lets a note's links show as links to the notes you have.
 */
export function HandoutViewer({ knownTitles }: { knownTitles: Set<string> }): JSX.Element {
  const [handout, setHandout] = useState<Handout | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(
    () =>
      window.goblin.handouts.onShow((next) => {
        setHandout(next)
        setOpen(true)
        playSfx('sceneAdvance')
      }),
    []
  )

  const html = useMemo(() => (handout?.kind === 'note' ? renderNoteMarkdown(handout.markdown, knownTitles, '') : ''), [handout, knownTitles])

  return (
    <Modal open={open} onClose={() => setOpen(false)} width={handout?.kind === 'image' ? 760 : 560}>
      {handout && (
        <div className="gb-handout">
          <div className="gb-handout-eyebrow">From the DM</div>
          <h2 className="gb-handout-title">{handout.title}</h2>
          {handout.kind === 'image' ? (
            <img className="gb-handout-image" src={handout.src} alt={handout.title} />
          ) : (
            <div className="gb-markdown gb-handout-note" dangerouslySetInnerHTML={{ __html: html }} />
          )}
          <div className="gb-handout-actions">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
