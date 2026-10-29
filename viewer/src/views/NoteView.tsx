import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { renderNoteMarkdown } from '@renderer/markdown'
import { rollDie } from '@shared/dice'
import { href } from '../route'
import { Status } from './Status'
import { useCampaign, VisibilityBadge } from './CampaignView'

interface Roll {
  label: string
  dice: number[]
  modifier: number
  total: number
}

export function NoteView({ campaignId, noteId, setTitle }: { campaignId: string; noteId: string; setTitle: (title: string) => void }): JSX.Element {
  const { data, error, reload } = useCampaign(campaignId)
  const [roll, setRoll] = useState<Roll | null>(null)
  const note = data?.notes.find((n) => n.id === noteId)

  useEffect(() => setTitle(note?.title || 'Note'), [note?.title, setTitle])

  const html = useMemo(() => {
    if (!data || !note) return ''
    const knownTitles = new Set(data.notes.map((n) => (n.title || '').toLowerCase()))
    return renderNoteMarkdown(note.body_markdown, knownTitles, campaignId)
  }, [data, note, campaignId])

  useEffect(() => {
    if (!roll) return
    const timer = setTimeout(() => setRoll(null), 6000)
    return () => clearTimeout(timer)
  }, [roll])

  function onClick(e: MouseEvent<HTMLDivElement>): void {
    const target = e.target as HTMLElement
    const link = target.closest<HTMLElement>('[data-wikilink]')
    if (link && data) {
      e.preventDefault()
      const title = (link.dataset.wikilink ?? '').toLowerCase()
      const linked = data.notes.find((n) => (n.title || '').toLowerCase() === title)
      if (linked) window.location.hash = href({ view: 'note', campaignId, noteId: linked.id })
      return
    }
    const diceButton = target.closest<HTMLElement>('[data-dice-roll]')
    if (diceButton?.dataset.diceRoll) {
      const { sides, count, modifier } = JSON.parse(diceButton.dataset.diceRoll) as { sides: number; count: number; modifier: number }
      const dice = Array.from({ length: count }, () => rollDie(sides))
      const sign = modifier ? (modifier > 0 ? ` + ${modifier}` : ` − ${-modifier}`) : ''
      setRoll({ label: `${count}d${sides}${sign}`, dice, modifier, total: dice.reduce((a, b) => a + b, 0) + modifier })
    }
  }

  if (!data) return <Status error={error} loading onRetry={reload} />
  if (!note) return <p className="v-empty">This note isn't in the synced copy of the campaign — it may have been deleted.</p>

  return (
    <article className="v-note">
      <div className="v-note-meta">
        <VisibilityBadge visibility={note.visibility} />
        <span>Updated {new Date(note.updated_at).toLocaleDateString()}</span>
      </div>
      <div className="gb-markdown v-markdown" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
      {roll && (
        <button type="button" className="v-roll-toast gb-card" onClick={() => setRoll(null)}>
          <span className="v-roll-label">{roll.label}</span>
          <span className="v-roll-total">{roll.total}</span>
          <span className="v-roll-detail">
            [{roll.dice.join(', ')}]{roll.modifier ? (roll.modifier > 0 ? ` + ${roll.modifier}` : ` − ${-roll.modifier}`) : ''}
          </span>
        </button>
      )}
    </article>
  )
}
