import type { ReactNode } from 'react'
import { SKILLS, type Ability } from '@shared/dnd5e'
import { HoverDetailCard } from '../HoverDetailCard'
import type { SpellOption } from './useCreator'

/**
 * The creator's selectable tiles, for picking several of something from a
 * list (skills, spells): a card per option with what it's for, a tick when
 * chosen, and greyed out with a reason when it can't be picked.
 */

const ABILITY_SHORT: Record<Ability, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }

/** What each skill is for, in a line. */
const SKILL_USE: Record<string, string> = {
  Acrobatics: 'Keep your balance, tumble, and land on your feet.',
  'Animal Handling': 'Calm, guide or read the mood of an animal.',
  Arcana: 'Recall lore about magic, spells and other planes.',
  Athletics: 'Climb, jump, swim, and wrestle.',
  Deception: 'Lie convincingly and mislead people.',
  History: 'Recall events, people and places from the past.',
  Insight: 'Read what someone really means or wants.',
  Intimidation: 'Sway people with threats and sheer presence.',
  Investigation: 'Search for clues and work out puzzles.',
  Medicine: 'Steady the dying and tell what ails someone.',
  Nature: 'Know terrain, plants, beasts and weather.',
  Perception: 'Notice things: hidden foes, sounds, details.',
  Performance: 'Entertain with music, dance, acting or stories.',
  Persuasion: 'Win people over with tact and charm.',
  Religion: 'Know gods, rites, holy symbols and cults.',
  'Sleight of Hand': 'Pick pockets and pull off tricks of the hand.',
  Stealth: 'Move without being seen or heard.',
  Survival: 'Track, hunt, find your way and live off the land.'
}

export function CheckIcon({ size = 12 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  )
}

function Tile({ on, disabled, reason, onClick, title, tag, children }: { on: boolean; disabled?: boolean; reason?: string; onClick: () => void; title: string; tag?: ReactNode; children?: ReactNode }): JSX.Element {
  return (
    <button type="button" className={`cc-tile${on ? ' cc-tile--on' : ''}`} disabled={disabled} onClick={onClick} aria-pressed={on} title={disabled ? reason : undefined}>
      <span className="cc-tile-head">
        <span className="cc-tile-tick">{on && <CheckIcon size={11} />}</span>
        <span className="cc-tile-title">{title}</span>
        {tag && <span className="cc-tile-tag">{tag}</span>}
      </span>
      {children}
      {disabled && reason && <span className="cc-tile-reason">{reason}</span>}
    </button>
  )
}

/**
 * Skills to pick from, as tiles: the skill, its ability, and what it's for.
 * `locked` names skills you already have elsewhere (and why); `full` greys
 * out the rest once enough are chosen.
 */
export function SkillTiles({ skills, chosen, max, locked, onToggle }: { skills: string[]; chosen: string[]; max: number; locked?: (skill: string) => string | undefined; onToggle: (skill: string) => void }): JSX.Element {
  const full = chosen.length >= max
  return (
    <div className="cc-tiles">
      {skills.map((skill) => {
        const on = chosen.includes(skill)
        const lockedWhy = !on ? locked?.(skill) : undefined
        const ability = SKILLS.find((s) => s.id === skill)?.ability
        return (
          <Tile key={skill} on={on} disabled={!on && (!!lockedWhy || full)} reason={lockedWhy} onClick={() => onToggle(skill)} title={skill} tag={ability ? ABILITY_SHORT[ability] : undefined}>
            {SKILL_USE[skill] && <span className="cc-tile-text">{SKILL_USE[skill]}</span>}
          </Tile>
        )
      })}
    </div>
  )
}

/** Spells to pick from: name, school and casting details, with the whole spell on hover. */
export function SpellTiles({ spells, chosen, full, onToggle }: { spells: SpellOption[]; chosen: string[]; full: boolean; onToggle: (id: string) => void }): JSX.Element {
  return (
    <div className="cc-tiles cc-tiles--spells">
      {spells.map((s) => {
        const on = chosen.includes(s.id)
        const flags = [s.concentration ? 'Concentration' : '', s.ritual ? 'Ritual' : ''].filter(Boolean)
        return (
          <HoverDetailCard
            key={s.id}
            title={s.name}
            subtitle={`${s.level === 0 ? `${s.school} cantrip` : `Level 1 ${s.school}`}${flags.length ? ` · ${flags.join(', ')}` : ''}`}
            fields={[
              { label: 'Casting time', value: s.castingTime },
              { label: 'Range', value: s.range },
              { label: 'Duration', value: s.duration }
            ]}
            description={s.description}
            width={360}
            interceptWheel={false}
          >
            <Tile on={on} disabled={!on && full} onClick={() => onToggle(s.id)} title={s.name} tag={s.school}>
              <span className="cc-tile-meta">
                {[s.castingTime, s.range, ...flags].filter(Boolean).join(' · ')}
              </span>
              <span className="cc-tile-text cc-tile-text--clamp">{s.description}</span>
            </Tile>
          </HoverDetailCard>
        )
      })}
    </div>
  )
}
