/**
 * One-shot Sound Board cues for the DM's toolbar (see SoundBoardButton.tsx)
 * — magic, weapon, creature, and turn-flow stingers, discovered from
 * src/renderer/src/assets/soundboard/** the same way musicLibrary.ts and
 * ambientLibrary.ts discover their own bundled files. Drop an MP3 into one
 * of the category folders below and it shows up in its menu section
 * automatically — no code change needed. Category ids/labels/order started
 * as the "Pocket Foley" curation checklist's eight sides; its Spell Schools
 * side was dropped as redundant with Spellcasting once actually curating,
 * so this only has seven now.
 */
import { SPELL_SFX_CATEGORY, SCHOOL_FALLBACK_SFX, SPELL_SFX_CUE_FOLDER } from './spellSfxCategories'
import { MONSTER_SFX_CATEGORY } from './monsterSfxCategories'

export interface SfxCue {
  /** Unique across the whole library — "<categoryId>-<n>". */
  id: string
  /** Shown on the cue's button — the cue's own subfolder name, not the category's or any one variant's file name. */
  label: string
  /**
   * One or more alternate takes of the same cue (see the doc comment above)
   * — a plain flat file directly in a category folder is just a
   * single-variant cue. `pickSfxVariant` below is how a play picks one.
   */
  urls: string[]
}

export interface SfxCategory {
  id: string
  label: string
  cues: SfxCue[]
}

const files = import.meta.glob<string>('../assets/soundboard/**/*.mp3', { eager: true, query: '?url', import: 'default' })

/**
 * Each cue is curated as its own subfolder of alternate takes of the same
 * sound — e.g. assets/soundboard/WeaponImpacts/Sword Clang Parry/*.mp3 holds
 * several different sword-on-sword recordings — so a repeated cue (a fight
 * with a dozen sword clangs) doesn't sound identical every time; see
 * pickSfxVariant. A flat *.mp3 dropped directly in a category folder (no
 * subfolder) still works as a plain single-variant cue, named from its own
 * filename same as musicLibrary.ts's convention.
 */
interface RawEntry {
  category: string
  /** The cue's display name — its subfolder name, or (for a flat file) the filename itself. */
  cueName: string
  fileName: string
  url: string
}

const raw: RawEntry[] = Object.entries(files)
  .map(([path, url]) => {
    const relPath = path.slice(path.indexOf('assets/soundboard/') + 'assets/soundboard/'.length)
    const parts = relPath.split('/')
    const category = parts[0]
    const fileName = parts[parts.length - 1]
    const cueName = parts.length >= 3 ? parts[1] : labelFromFilename(fileName)
    return { category, cueName, fileName, url }
  })
  // Stable, deterministic variant order within a cue regardless of whatever
  // order import.meta.glob happened to enumerate files in.
  .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }))

function labelFromFilename(fileName: string): string {
  const base = fileName.replace(/\.mp3$/i, '')
  // Same "NN - Name" convention as musicLibrary/ambientLibrary — strip a
  // leading ordering number if the curator chose to add one, but don't
  // require it the way those two do, since a Sound Board folder doesn't
  // need a play order.
  const match = base.match(/^\d+\s*-\s*(.+)$/)
  return match ? match[1] : base
}

/**
 * Order here is the menu's display order — see this file's own doc comment
 * for why it mirrors Pocket Foley's eight sides. Turn Flow (that side's
 * eighth) is deliberately NOT one of these — those cues are tied to the
 * Initiative Tracker's own actions (starting combat, changing turns, death
 * saves — see InitiativeTracker.tsx) rather than a manual DM button press,
 * so they're kept out of the Sound Board's menu entirely; see
 * TURN_FLOW_CUES below for where they actually live.
 */
const CATEGORIES: { id: string; label: string }[] = [
  { id: 'WeaponImpacts', label: 'Weapon Impacts' },
  { id: 'Elemental', label: 'Elemental & Damage' },
  { id: 'Spellcasting', label: 'Spellcasting' },
  { id: 'ClassFeatures', label: 'Class Features' },
  { id: 'Creatures', label: 'Creatures & Combat' },
  { id: 'Movement', label: 'Footsteps & Movement' }
]

function cuesForCategory(categoryId: string): SfxCue[] {
  const byCueName = new Map<string, string[]>()
  for (const entry of raw) {
    if (entry.category !== categoryId) continue
    const urls = byCueName.get(entry.cueName)
    if (urls) urls.push(entry.url)
    else byCueName.set(entry.cueName, [entry.url])
  }
  return [...byCueName.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([cueName, urls], i) => ({ id: `${categoryId}-${i + 1}`, label: cueName, urls }))
}

/** Every Sound Board menu category, in menu order — empty ones are kept (rather than filtered out) so the Sound Board's shape stays stable as cues get added over time; SoundBoardButton.tsx decides whether to hide an empty section. */
export const SFX_LIBRARY: SfxCategory[] = CATEGORIES.map(({ id, label }) => ({ id, label, cues: cuesForCategory(id) }))

/**
 * The Combat & Turn Flow cues (Initiative Start, Turn Change, Death Save
 * Tick/Success/Fail) — curated the exact same way as a Sound Board category
 * (assets/soundboard/CombatFlow/<cue name>/*.mp3, several takes per cue),
 * just never surfaced in the Sound Board menu itself (see CATEGORIES' doc
 * comment above). Looked up by label from InitiativeTracker.tsx via
 * findTurnFlowCue rather than by id, the same way findClassFeatureSfxCue
 * works for ability names.
 */
export const TURN_FLOW_CUES: SfxCue[] = cuesForCategory('CombatFlow')

export function findTurnFlowCue(label: string): SfxCue | undefined {
  return TURN_FLOW_CUES.find((c) => c.label === label)
}

export function findSfxCue(cueId: string): SfxCue | undefined {
  for (const category of SFX_LIBRARY) {
    const cue = category.cues.find((c) => c.id === cueId)
    if (cue) return cue
  }
  return TURN_FLOW_CUES.find((c) => c.id === cueId)
}

/** Looks up one cue by its exact display label within a specific category — used where the trigger (a natural 20/1 on an attack roll, see RollAnimationOverlay.tsx) knows a cue by name rather than by id, the same way findClassFeatureSfxCue does for ability names. Undefined if that category has no cue with this label (including one not curated yet). */
export function findSfxCueByLabel(categoryId: string, label: string): SfxCue | undefined {
  return SFX_LIBRARY.find((c) => c.id === categoryId)?.cues.find((c) => c.label === label)
}

/** Picks which of a cue's alternate takes to actually play — called independently by every client on every trigger (never broadcast as part of the cue id), so a synced table still hears a different take from each other by chance, same as it would if the DM triggered the same cue twice in a row locally. */
export function pickSfxVariant(cue: SfxCue): string {
  return cue.urls[Math.floor(Math.random() * cue.urls.length)]
}

/**
 * Maps a character sheet ability's own display name (Rage, Divine Smite,
 * Channel Divinity: Turn Undead, ...) to the Class Features cue that plays
 * when a player activates/uses it — see CombatTab.tsx's Toggle Actions,
 * Special Actions, and Bonus/Other Class Resources sections, and
 * FeaturesTab.tsx's DivineSmiteCard. Matched by keyword rather than an exact
 * name since the same ability can render under a few different labels
 * (Channel Divinity's sub-options, a subclass's own Ki-fueled feature) —
 * first pattern to match wins. A pattern with no corresponding cue actually
 * curated yet (see the ClassFeatures folder) just never matches anything,
 * so this degrades to silently doing nothing rather than erroring.
 */
const CLASS_FEATURE_SFX_PATTERNS: { match: RegExp; cueLabel: string }[] = [
  { match: /\brage\b/i, cueLabel: 'Barbarian Rage' },
  { match: /bardic inspiration/i, cueLabel: 'Bardic Inspiration' },
  { match: /channel divinity/i, cueLabel: 'Cleric Burst' },
  { match: /flurry of blows|patient defense|step of the wind|\bki\b/i, cueLabel: 'Monk Ki Strike' },
  { match: /divine smite/i, cueLabel: 'Paladin Smite' },
  { match: /hunter'?s mark/i, cueLabel: "Ranger Hunter's Mark Ping" },
  { match: /sneak attack/i, cueLabel: 'Rogue Sneak Attack' },
  { match: /metamagic/i, cueLabel: 'Sorcerer Metamagic Surge' },
  { match: /eldritch blast/i, cueLabel: 'Warlock Eldritch Blast' },
  { match: /arcane recovery/i, cueLabel: 'Wizard Arcane Recovery' }
]

/** Looks up a Class Features cue by an ability's own display name — see CLASS_FEATURE_SFX_PATTERNS above. Returns undefined for an ability with no mapped pattern, or one whose mapped cue hasn't been curated (added to assets/soundboard/ClassFeatures) yet. */
export function findClassFeatureSfxCue(abilityName: string): SfxCue | undefined {
  const pattern = CLASS_FEATURE_SFX_PATTERNS.find((p) => p.match.test(abilityName))
  if (!pattern) return undefined
  const category = SFX_LIBRARY.find((c) => c.id === 'ClassFeatures')
  return category?.cues.find((c) => c.label === pattern.cueLabel)
}

export function totalSfxCount(): number {
  return SFX_LIBRARY.reduce((sum, c) => sum + c.cues.length, 0)
}

/**
 * Every SRD spell's own cast cue — see spellSfxCategories.ts's own doc
 * comment for how each one was picked (damage type first, then school),
 * and SpellsTab.tsx's Cast button for where this is actually triggered.
 * `compendiumId`/`school` mirror a spell's own fields: a compendium spell
 * (has a real id) resolves through SPELL_SFX_CATEGORY; a custom/homebrew
 * spell (no id) falls back to SCHOOL_FALLBACK_SFX by its own freeform
 * school text, or undefined if it has none set either.
 */
export function findSpellCastSfxCue(compendiumId: string | undefined, school: string | undefined): SfxCue | undefined {
  const label = (compendiumId ? SPELL_SFX_CATEGORY[compendiumId] : undefined) ?? (school ? SCHOOL_FALLBACK_SFX[school] : undefined)
  if (!label) return undefined
  const folder = SPELL_SFX_CUE_FOLDER[label]
  return folder ? findSfxCueByLabel(folder, label) : undefined
}

/**
 * Recognizes an inline `` `oneshot: WeaponImpacts-3` `` code span (see
 * markdown.ts's `codespan` renderer override and MarkdownLiveEditor.tsx's
 * matching Write-mode widget) — the note-authoring counterpart to a
 * `` `dice: 2d6 + 3` `` roll trigger (see shared/dice.ts's
 * parseDiceCodeSpan), written the same deliberate way so it reads as a
 * trigger rather than colliding with ordinary backticked text. Returns the
 * cue id, or null if the span isn't one of these or names a cue that no
 * longer exists (e.g. the file was since removed from assets/soundboard).
 */
export function parseOneShotCodeSpan(text: string): string | null {
  const match = /^oneshot:\s*(.+)$/i.exec(text.trim())
  if (!match) return null
  const cueId = match[1].trim()
  return findSfxCue(cueId) ? cueId : null
}

/**
 * Which Creatures cue a monster's name/type sounds most like — see
 * Bestiary.tsx's Monsters row (clicking one in the Codex plays this) and
 * InitiativeTracker.tsx's turn-change handling (a monster's turn coming up
 * plays this too, broadcast to the table). An SRD monster resolves through
 * MONSTER_SFX_CATEGORY (generated once from the same name-keyword-then-type
 * logic below, see monsterSfxCategories.ts's own doc comment); a custom
 * monster has no index in that map and falls back to running the same logic
 * live here instead. Name keyword is checked first (a name like "Skeleton"
 * is a stronger signal than its SRD type string), then the SRD `type`
 * field's own family, and finally Beast Growl as the generic "some kind of
 * creature" catch-all for anything else (most beasts, and any type with no
 * more specific cue of its own).
 */
export function findMonsterSfxCue(monster: { name: string; type: string; index?: string }): SfxCue | undefined {
  const mapped = monster.index ? MONSTER_SFX_CATEGORY[monster.index] : undefined
  const label = mapped ?? categorizeMonster(monster.name, monster.type)
  return findSfxCueByLabel('Creatures', label)
}

function categorizeMonster(name: string, type: string): string {
  const n = name.toLowerCase()
  const t = type.toLowerCase()
  if (t.includes('dragon')) return 'Dragon Roar'
  if (/\bspider\b/.test(n)) return 'Spider Hiss'
  if (/\bwolf\b|\bworg\b/.test(n)) return 'Wolf Snarl'
  if (/\bgoblin\b/.test(n) || t.includes('goblinoid')) return 'Goblin Battle Cry'
  if (/\bogre\b/.test(n)) return 'Ogre Grunt'
  if (/ghost|specter|spectre|wraith|banshee|phantom|shadow/.test(n)) return 'Ghost Wail'
  if (/skeleton/.test(n)) return 'Skeleton Rattle'
  if (t.includes('undead')) return 'Undead Groan'
  if (t.includes('humanoid')) return 'Humanoid Shout'
  if (t.includes('aberration')) return 'Aberration Shriek'
  if (t.includes('celestial')) return 'Celestial Chime'
  if (t.includes('construct')) return 'Construct Grind'
  if (t.includes('elemental')) return 'Elemental Roar'
  if (t.includes('fey')) return 'Fey Whisper'
  if (t.includes('fiend')) return 'Fiend Snarl'
  if (t.includes('giant')) return 'Giant Bellow'
  if (t.includes('monstrosity')) return 'Monstrosity Roar'
  if (t.includes('ooze')) return 'Ooze Squelch'
  if (t.includes('plant')) return 'Plant Rustle'
  if (t.includes('swarm')) return 'Swarm Buzz'
  return 'Beast Growl'
}
