import { useEffect, useRef, useState } from 'react'
import type { CharacterSheet, QuestReward } from '@shared/ipc'
import { playSfx } from '../audio/soundEffects'

/**
 * A player's side of quest rewards: their share of a finished quest's gold and XP is added to the character
 * they're playing (`onApply` saves it), and a banner says what they got. With no character picked there's
 * nowhere to put it, and the banner says that instead.
 */
export function QuestRewardNotice({ character, onApply }: { character: CharacterSheet | null; onApply: (character: CharacterSheet, reward: QuestReward) => void }): JSX.Element | null {
  const [shown, setShown] = useState<{ reward: QuestReward; to: string | null } | null>(null)
  // The latest character and save, without re-subscribing every time the sheet changes.
  const latest = useRef({ character, onApply })
  latest.current = { character, onApply }

  useEffect(
    () =>
      window.goblin.quests.onReward((reward) => {
        const { character: c, onApply: apply } = latest.current
        if (c) apply(c, reward)
        setShown({ reward, to: c ? c.name || 'your character' : null })
        playSfx('levelUp')
      }),
    []
  )

  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(null), 8000)
    return () => clearTimeout(t)
  }, [shown])

  if (!shown) return null
  const { reward, to } = shown
  const parts = [reward.gold ? `${reward.gold.toLocaleString()} gp` : '', reward.xp ? `${reward.xp.toLocaleString()} XP` : ''].filter(Boolean).join(' and ')
  return (
    <div className="gb-quest-reward-notice" role="status">
      <button type="button" className="gb-quest-reward-close" aria-label="Close" onClick={() => setShown(null)}>
        ×
      </button>
      <span className="gb-quest-reward-eyebrow">Quest complete</span>
      <strong>{reward.questTitle}</strong>
      <span>
        {to ? `${to} gains ${parts}` : `Your share is ${parts} — pick a character to keep rewards like this`}
        {reward.partySize > 1 ? `, a ${reward.partySize}-way split.` : '.'}
      </span>
    </div>
  )
}
