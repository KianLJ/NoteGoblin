import type { ReactNode } from 'react'

/**
 * The creator's pictures and one-line pitches: an emblem per class (simple
 * line drawings, in the app's SVG style), and a short description of each
 * built-in class, species and background in our own words. A homebrew entry
 * gets a generic emblem and its pack's own description instead.
 */

function Emblem({ size = 40, children }: { size?: number; children: ReactNode }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {children}
    </svg>
  )
}

const CLASS_EMBLEMS: Record<string, ReactNode> = {
  // A double-bladed axe.
  barbarian: (
    <>
      <path d="M24 6v38" />
      <path d="M24 12c-6-4-12-3-15 1 2 6 8 9 15 7" />
      <path d="M24 12c6-4 12-3 15 1-2 6-8 9-15 7" />
    </>
  ),
  // A lute.
  bard: (
    <>
      <ellipse cx="19" cy="31" rx="10" ry="11" />
      <circle cx="19" cy="31" r="3" />
      <path d="M26 23l13-14" />
      <path d="M36 7l5 5" />
    </>
  ),
  // A radiant holy symbol.
  cleric: (
    <>
      <circle cx="24" cy="24" r="7" />
      <path d="M24 5v7M24 36v7M5 24h7M36 24h7M10.5 10.5l5 5M32.5 32.5l5 5M37.5 10.5l-5 5M15.5 32.5l-5 5" />
    </>
  ),
  // A leaf.
  druid: (
    <>
      <path d="M10 38C10 20 22 8 40 8c0 18-12 30-30 30z" />
      <path d="M10 38L30 18" />
      <path d="M20 28h-6M25 23v-7" />
    </>
  ),
  // Sword over a shield.
  fighter: (
    <>
      <path d="M12 10h24v12c0 9-6 15-12 18-6-3-12-9-12-18z" />
      <path d="M24 6v30M18 30h12" />
    </>
  ),
  // A balanced circle.
  monk: (
    <>
      <circle cx="24" cy="24" r="17" />
      <path d="M24 7a8.5 8.5 0 010 17 8.5 8.5 0 000 17" />
      <circle cx="24" cy="15.5" r="2" />
      <circle cx="24" cy="32.5" r="2" />
    </>
  ),
  // A shield bearing a cross.
  paladin: (
    <>
      <path d="M10 9h28v13c0 10-7 16-14 19-7-3-14-9-14-19z" />
      <path d="M24 14v20M17 21h14" />
    </>
  ),
  // A bow and arrow.
  ranger: (
    <>
      <path d="M14 6c14 6 14 30 0 36" />
      <path d="M14 6v36" />
      <path d="M8 24h32M35 19l5 5-5 5" />
    </>
  ),
  // A dagger.
  rogue: (
    <>
      <path d="M33 7l8 8-20 20-6-2-2-6z" />
      <path d="M13 27l8 8M9 39l6-6" />
    </>
  ),
  // A flame.
  sorcerer: (
    <>
      <path d="M24 42c-8 0-13-6-13-13 0-8 7-11 8-20 5 4 6 9 5 13 3-2 5-5 5-8 6 5 9 10 9 15 0 7-6 13-14 13z" />
      <path d="M24 42c-3 0-5-2-5-5 0-4 5-6 5-10 3 3 5 6 5 10 0 3-2 5-5 5z" />
    </>
  ),
  // An eye.
  warlock: (
    <>
      <path d="M5 24c5-8 12-12 19-12s14 4 19 12c-5 8-12 12-19 12S10 32 5 24z" />
      <circle cx="24" cy="24" r="6" />
      <path d="M24 21v6" />
    </>
  ),
  // A pointed hat with a star.
  wizard: (
    <>
      <path d="M8 38h32" />
      <path d="M13 38L22 8l13 30" />
      <path d="M22 8c6 1 10 4 12 8" />
      <path d="M23 25l1.5 3 3 .5-2.2 2 .5 3-2.8-1.5-2.8 1.5.5-3-2.2-2 3-.5z" />
    </>
  )
}

/** A generic crest: a star in a ring, for homebrew classes. */
const GENERIC_EMBLEM = (
  <>
    <circle cx="24" cy="24" r="17" />
    <path d="M24 13l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2L24 29.5l-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1z" />
  </>
)

export function ClassEmblem({ classId, size }: { classId: string; size?: number }): JSX.Element {
  return <Emblem size={size}>{CLASS_EMBLEMS[localId(classId)] ?? GENERIC_EMBLEM}</Emblem>
}

/** A scroll, for backgrounds. */
export function BackgroundEmblem({ size }: { size?: number }): JSX.Element {
  return (
    <Emblem size={size}>
      <path d="M14 10h22a4 4 0 010 8h-4v18a4 4 0 01-4 4H12a4 4 0 010-8h4V14a4 4 0 00-4-4" />
      <path d="M12 32h16a4 4 0 010 8M22 18h6M22 24h6" />
    </Emblem>
  )
}

/** A species' initial in a ring. */
export function SpeciesEmblem({ name, size = 40 }: { name: string; size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <text x="24" y="31" textAnchor="middle" fontSize="20" fontFamily="var(--font-display)" fill="currentColor">
        {name.trim().charAt(0).toUpperCase() || '?'}
      </text>
    </svg>
  )
}

const localId = (id: string): string => id.slice(id.lastIndexOf(':') + 1).toLowerCase()

interface Pitch {
  line: string
  /** What it does in a party, a word or two each. */
  role?: string[]
}

const CLASS_PITCH: Record<string, Pitch> = {
  barbarian: { line: 'A fierce warrior who shrugs off blows and hits hard in a primal rage.', role: ['Front line', 'Tough'] },
  bard: { line: 'A performer whose music and words weave magic, inspiring friends and confounding foes.', role: ['Support', 'Spellcaster', 'Skills'] },
  cleric: { line: 'A priest who channels divine power to heal allies and smite enemies.', role: ['Healer', 'Spellcaster'] },
  druid: { line: 'A keeper of the wild who wields nature’s magic and takes the shape of beasts.', role: ['Spellcaster', 'Shapeshifter'] },
  fighter: { line: 'A master of weapons and armour, dependable in any fight.', role: ['Front line', 'Simple to play'] },
  monk: { line: 'A martial artist who fights with speed, discipline and focused energy.', role: ['Mobile', 'Unarmed'] },
  paladin: { line: 'A holy warrior bound by an oath, blending heavy armour with divine magic.', role: ['Front line', 'Healer'] },
  ranger: { line: 'A hunter and scout of the wild places, deadly with a bow.', role: ['Ranged', 'Explorer'] },
  rogue: { line: 'A cunning expert who sneaks, picks locks, and strikes where it hurts most.', role: ['Skills', 'Sneak attack'] },
  sorcerer: { line: 'A born spellcaster whose magic comes from within, and who can bend it to their will.', role: ['Spellcaster', 'Blaster'] },
  warlock: { line: 'A spellcaster who earned their power through a pact with an otherworldly patron.', role: ['Spellcaster', 'Ranged'] },
  wizard: { line: 'A scholar who masters magic through study, with the widest range of spells of all.', role: ['Spellcaster', 'Versatile'] }
}

const SPECIES_PITCH: Record<string, string> = {
  dragonborn: 'Proud folk with the blood of dragons, who breathe out elemental energy.',
  dwarf: 'Sturdy, long-lived people of stone and forge, hard to poison and hard to put down.',
  elf: 'Graceful, long-lived people of magic, who rest in trance instead of sleep.',
  gnome: 'Small, curious folk with a natural knack for magic and invention.',
  goliath: 'Towering people descended from giants, with a giant’s strength.',
  halfling: 'Small, nimble and remarkably lucky folk who slip past danger.',
  human: 'Adaptable and ambitious, found everywhere, and skilled at almost anything.',
  orc: 'Powerful, enduring people who keep going when others would fall.',
  tiefling: 'People touched by fiendish heritage, with innate magic to match.'
}

const BACKGROUND_PITCH: Record<string, string> = {
  acolyte: 'You served in a temple, studying its rites and its god.',
  criminal: 'You made a living in the shadows, on the wrong side of the law.',
  sage: 'You spent years among books and scholars, learning the lore of the world.',
  soldier: 'You trained for war and served in an army or a mercenary band.'
}

/** A built-in entry's pitch, or the first paragraph of a pack's own description. */
export function classPitch(id: string, packDescription: string): Pitch {
  return CLASS_PITCH[localId(id)] ?? { line: firstParagraph(packDescription) }
}
export function speciesPitch(id: string, packDescription: string): string {
  return SPECIES_PITCH[localId(id)] ?? firstParagraph(packDescription)
}
export function backgroundPitch(id: string, packDescription: string): string {
  return BACKGROUND_PITCH[localId(id)] ?? firstParagraph(packDescription)
}

function firstParagraph(text: string): string {
  return (text || '').split(/\n\s*\n/)[0].trim()
}
