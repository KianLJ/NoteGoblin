// Static SRD-derived D&D 5e reference data + the shape of a character sheet.
// Deliberately not a full compendium — race/class/background entries carry
// enough mechanical data to drive derived stats (ability bonuses, hit dice,
// proficiencies), not full flavor text. Spells/equipment/features stay as
// freeform rows the player fills in themselves; there's no spell/item lookup.

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

export const ABILITIES: { id: Ability; label: string }[] = [
  { id: 'str', label: 'Strength' },
  { id: 'dex', label: 'Dexterity' },
  { id: 'con', label: 'Constitution' },
  { id: 'int', label: 'Intelligence' },
  { id: 'wis', label: 'Wisdom' },
  { id: 'cha', label: 'Charisma' }
]

/**
 * "The Six Abilities" — the SRD's own "Score Measures", "Make a Check
 * To...", and "Make a Save To..." table entries (SRD 5.2.1, Creative
 * Commons Attribution 4.0 — see the app's About/attribution notice), plus
 * a closing line naming the skills that key off that ability and which
 * classes use it to cast spells (not SRD text — derived from the SKILLS
 * table and CLASSES below). Shown as a hover tooltip on each ability score
 * (see OverviewTab.tsx).
 */
export const ABILITY_DESCRIPTIONS: Record<Ability, string> = {
  str: 'Measures: Physical might.\nMake a check to lift, push, pull, or break something.\nMake a save to physically resist direct force.\nGoverns the Athletics skill, and melee attacks with most weapons.',
  dex: 'Measures: Agility, reflexes, and balance.\nMake a check to move nimbly, quickly, or quietly.\nMake a save to dodge out of harm’s way.\nGoverns Acrobatics, Sleight of Hand, and Stealth, ranged weapon attacks, and your Armor Class and Initiative.',
  con: 'Measures: Health and stamina.\nMake a check to push your body beyond normal limits.\nMake a save to endure a toxic hazard.\nHas no skills of its own, but sets your hit points and is the save most often called for to maintain Concentration.',
  int: 'Measures: Reasoning and memory.\nMake a check to reason or remember.\nMake a save to recognize an illusion as fake.\nGoverns Arcana, History, Investigation, Nature, and Religion. Spellcasting ability for Wizards.',
  wis: 'Measures: Perceptiveness and mental fortitude.\nMake a check to notice things in the environment or in creatures’ behavior.\nMake a save to resist a mental assault.\nGoverns Animal Handling, Insight, Medicine, Perception, and Survival. Spellcasting ability for Clerics, Druids, and Rangers.',
  cha: 'Measures: Confidence, poise, and charm.\nMake a check to influence, entertain, or deceive.\nMake a save to assert your identity.\nGoverns Deception, Intimidation, Performance, and Persuasion. Spellcasting ability for Bards, Paladins, Sorcerers, and Warlocks.'
}

export type AbilityScores = Record<Ability, number>

export const DEFAULT_ABILITY_SCORES: AbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10
}

/** The SRD's 13 damage types — offered as suggestions in the Resistances/Vulnerabilities/Immunities picker, though a freeform entry (homebrew, a DM-granted one-off) is accepted too. */
export const DAMAGE_TYPES = [
  'Acid',
  'Bludgeoning',
  'Cold',
  'Fire',
  'Force',
  'Lightning',
  'Necrotic',
  'Piercing',
  'Poison',
  'Psychic',
  'Radiant',
  'Slashing',
  'Thunder'
] as const

export type SkillName =
  | 'Acrobatics'
  | 'Animal Handling'
  | 'Arcana'
  | 'Athletics'
  | 'Deception'
  | 'History'
  | 'Insight'
  | 'Intimidation'
  | 'Investigation'
  | 'Medicine'
  | 'Nature'
  | 'Perception'
  | 'Performance'
  | 'Persuasion'
  | 'Religion'
  | 'Sleight of Hand'
  | 'Stealth'
  | 'Survival'

export const SKILLS: { id: SkillName; ability: Ability }[] = [
  { id: 'Acrobatics', ability: 'dex' },
  { id: 'Animal Handling', ability: 'wis' },
  { id: 'Arcana', ability: 'int' },
  { id: 'Athletics', ability: 'str' },
  { id: 'Deception', ability: 'cha' },
  { id: 'History', ability: 'int' },
  { id: 'Insight', ability: 'wis' },
  { id: 'Intimidation', ability: 'cha' },
  { id: 'Investigation', ability: 'int' },
  { id: 'Medicine', ability: 'wis' },
  { id: 'Nature', ability: 'int' },
  { id: 'Perception', ability: 'wis' },
  { id: 'Performance', ability: 'cha' },
  { id: 'Persuasion', ability: 'cha' },
  { id: 'Religion', ability: 'int' },
  { id: 'Sleight of Hand', ability: 'dex' },
  { id: 'Stealth', ability: 'dex' },
  { id: 'Survival', ability: 'wis' }
]

export const ALIGNMENTS = [
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'True Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil'
]

export interface Race {
  id: string
  name: string
  abilityBonuses: Partial<AbilityScores>
  speed: number
  traits: string[]
}

/**
 * Full text for every trait name used in RACES below — this app's species
 * list models the 2014-ruleset traits (ability-score-granting species,
 * Half-Elf/Half-Orc included), not the 2024 SRD's species list (which
 * dropped ability bonuses from species entirely, moving them to
 * Background, and replaced Half-Elf/Half-Orc with Goliath/Orc) — so these
 * are standard 5e trait text, not verbatim SRD 5.2.1 quotes. Shown as a
 * hover tooltip in FeaturesTab.tsx.
 */
export const RACE_TRAIT_DESCRIPTIONS: Record<string, string> = {
  'Extra Language': 'You can speak, read, and write one extra language of your choice.',
  Darkvision:
    'You can see in dim light within a fixed range of you as if it were bright light, and in darkness as if it were dim light. You discern color in that darkness only as shades of gray.',
  'Keen Senses': 'You have proficiency in the Perception skill.',
  'Fey Ancestry': "You have advantage on saving throws against being charmed, and magic can't put you to sleep.",
  Trance:
    "You don't need to sleep. Instead, you meditate deeply for 4 hours a day. After resting this way, you gain the same benefit a human does from 8 hours of sleep.",
  'Dwarven Resilience': 'You have advantage on saving throws against poison, and resistance against poison damage.',
  Stonecunning:
    'Whenever you make an Intelligence (History) check related to the origin of stonework, you are considered proficient in the History skill and add double your proficiency bonus to the check.',
  Lucky: 'When you roll a 1 on a d20 for an attack roll, ability check, or saving throw, you can reroll the die and must use the new roll.',
  Brave: 'You have advantage on saving throws against being frightened.',
  'Halfling Nimbleness': 'You can move through the space of any creature that is of a size larger than yours.',
  'Draconic Ancestry':
    'You have draconic ancestry. Choose one type of dragon — your Breath Weapon and Damage Resistance traits are determined by that choice.',
  'Breath Weapon':
    'You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation.',
  'Damage Resistance': 'You have resistance to the damage type associated with your Draconic Ancestry.',
  'Gnome Cunning': 'You have advantage on all Intelligence, Wisdom, and Charisma saving throws against magic.',
  'Skill Versatility': 'You gain proficiency in two skills of your choice.',
  'Relentless Endurance':
    "When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. You can't use this trait again until you finish a long rest.",
  'Savage Attacks':
    "When you score a critical hit with a melee weapon attack, you can roll one of the weapon's damage dice one additional time and add it to the extra damage of the critical hit.",
  'Hellish Resistance': 'You have resistance to fire damage.',
  'Infernal Legacy':
    'You know the thaumaturgy cantrip. At 3rd level you can cast hellish rebuke once per long rest, and at 5th level darkness once per long rest — Charisma is your spellcasting ability for these.'
}

export const RACES: Race[] = [
  {
    id: 'human',
    name: 'Human',
    abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    speed: 30,
    traits: ['Extra Language']
  },
  {
    id: 'elf',
    name: 'Elf',
    abilityBonuses: { dex: 2 },
    speed: 30,
    traits: ['Darkvision', 'Keen Senses', 'Fey Ancestry', 'Trance']
  },
  {
    id: 'dwarf',
    name: 'Dwarf',
    abilityBonuses: { con: 2 },
    speed: 25,
    traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning']
  },
  {
    id: 'halfling',
    name: 'Halfling',
    abilityBonuses: { dex: 2 },
    speed: 25,
    traits: ['Lucky', 'Brave', 'Halfling Nimbleness']
  },
  {
    id: 'dragonborn',
    name: 'Dragonborn',
    abilityBonuses: { str: 2, cha: 1 },
    speed: 30,
    traits: ['Draconic Ancestry', 'Breath Weapon', 'Damage Resistance']
  },
  {
    id: 'gnome',
    name: 'Gnome',
    abilityBonuses: { int: 2 },
    speed: 25,
    traits: ['Darkvision', 'Gnome Cunning']
  },
  {
    id: 'half-elf',
    name: 'Half-Elf',
    abilityBonuses: { cha: 2, dex: 1, wis: 1 },
    speed: 30,
    traits: ['Darkvision', 'Fey Ancestry', 'Skill Versatility']
  },
  {
    id: 'half-orc',
    name: 'Half-Orc',
    abilityBonuses: { str: 2, con: 1 },
    speed: 30,
    traits: ['Darkvision', 'Relentless Endurance', 'Savage Attacks']
  },
  {
    id: 'tiefling',
    name: 'Tiefling',
    abilityBonuses: { cha: 2, int: 1 },
    speed: 30,
    traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy']
  }
]

export interface Class {
  id: string
  name: string
  hitDie: number
  primaryAbility: Ability
  savingThrowProficiencies: Ability[]
  skillChoice: { choose: number; from: SkillName[] }
  spellcastingAbility: Ability | null
  /** The level this class picks a subclass at (1 for Cleric/Sorcerer/Warlock, 2 for Druid/Wizard, 3 for everyone else) — drives both the level-up prompt's subclass chooser and when OverviewTab's subclass field unlocks. */
  subclassLevel: number
}

export const CLASSES: Class[] = [
  {
    id: 'barbarian',
    name: 'Barbarian',
    hitDie: 12,
    primaryAbility: 'str',
    savingThrowProficiencies: ['str', 'con'],
    skillChoice: { choose: 2, from: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'] },
    spellcastingAbility: null,
    subclassLevel: 3
  },
  {
    id: 'bard',
    name: 'Bard',
    hitDie: 8,
    primaryAbility: 'cha',
    savingThrowProficiencies: ['dex', 'cha'],
    skillChoice: { choose: 3, from: SKILLS.map((s) => s.id) },
    spellcastingAbility: 'cha',
    subclassLevel: 3
  },
  {
    id: 'cleric',
    name: 'Cleric',
    hitDie: 8,
    primaryAbility: 'wis',
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoice: { choose: 2, from: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'] },
    spellcastingAbility: 'wis',
    subclassLevel: 1
  },
  {
    id: 'druid',
    name: 'Druid',
    hitDie: 8,
    primaryAbility: 'wis',
    savingThrowProficiencies: ['int', 'wis'],
    skillChoice: { choose: 2, from: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'] },
    spellcastingAbility: 'wis',
    subclassLevel: 2
  },
  {
    id: 'fighter',
    name: 'Fighter',
    hitDie: 10,
    primaryAbility: 'str',
    savingThrowProficiencies: ['str', 'con'],
    skillChoice: { choose: 2, from: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'] },
    spellcastingAbility: null,
    subclassLevel: 3
  },
  {
    id: 'monk',
    name: 'Monk',
    hitDie: 8,
    primaryAbility: 'dex',
    savingThrowProficiencies: ['str', 'dex'],
    skillChoice: { choose: 2, from: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'] },
    spellcastingAbility: null,
    subclassLevel: 3
  },
  {
    id: 'paladin',
    name: 'Paladin',
    hitDie: 10,
    primaryAbility: 'str',
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoice: { choose: 2, from: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'] },
    spellcastingAbility: 'cha',
    subclassLevel: 3
  },
  {
    id: 'ranger',
    name: 'Ranger',
    hitDie: 10,
    primaryAbility: 'dex',
    savingThrowProficiencies: ['str', 'dex'],
    skillChoice: { choose: 3, from: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'] },
    spellcastingAbility: 'wis',
    subclassLevel: 3
  },
  {
    id: 'rogue',
    name: 'Rogue',
    hitDie: 8,
    primaryAbility: 'dex',
    savingThrowProficiencies: ['dex', 'int'],
    skillChoice: { choose: 4, from: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'] },
    spellcastingAbility: null,
    subclassLevel: 3
  },
  {
    id: 'sorcerer',
    name: 'Sorcerer',
    hitDie: 6,
    primaryAbility: 'cha',
    savingThrowProficiencies: ['con', 'cha'],
    skillChoice: { choose: 2, from: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'] },
    spellcastingAbility: 'cha',
    subclassLevel: 1
  },
  {
    id: 'warlock',
    name: 'Warlock',
    hitDie: 8,
    primaryAbility: 'cha',
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoice: { choose: 2, from: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'] },
    spellcastingAbility: 'cha',
    subclassLevel: 1
  },
  {
    id: 'wizard',
    name: 'Wizard',
    hitDie: 6,
    primaryAbility: 'int',
    savingThrowProficiencies: ['int', 'wis'],
    skillChoice: { choose: 2, from: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'] },
    spellcastingAbility: 'int',
    subclassLevel: 2
  }
]

/** The exact CLASS_LEVEL_FEATURES entry name that represents "choose your subclass" for each class — FeaturesTab.tsx excludes this row from a class's plain curated-feature list and renders an actual interactive picker (or, once chosen, a resolved card) in its place. */
export const SUBCLASS_CHOICE_FEATURE_NAME: Record<string, string> = {
  barbarian: 'Primal Path',
  bard: 'Bard College',
  cleric: 'Divine Domain',
  druid: 'Druid Circle',
  fighter: 'Martial Archetype',
  monk: 'Monastic Tradition',
  paladin: 'Sacred Oath',
  ranger: 'Ranger Archetype',
  rogue: 'Roguish Archetype',
  sorcerer: 'Sorcerous Origin',
  warlock: 'Otherworldly Patron',
  wizard: 'Arcane Tradition'
}

export interface Background {
  id: string
  name: string
  skillProficiencies: SkillName[]
  feature: { name: string; description: string }
}

export const BACKGROUNDS: Background[] = [
  {
    id: 'acolyte',
    name: 'Acolyte',
    skillProficiencies: ['Insight', 'Religion'],
    feature: { name: 'Shelter of the Faithful', description: 'You command the respect of those who share your faith, and can perform religious ceremonies. You and your companions can expect free healing and care at temples of your faith.' }
  },
  {
    id: 'criminal',
    name: 'Criminal',
    skillProficiencies: ['Deception', 'Stealth'],
    feature: { name: 'Criminal Contact', description: 'You have a reliable and trustworthy contact who acts as your liaison to a network of other criminals.' }
  },
  {
    id: 'folk-hero',
    name: 'Folk Hero',
    skillProficiencies: ['Animal Handling', 'Survival'],
    feature: { name: 'Rustic Hospitality', description: 'Common folk will shelter and hide you from the law or those searching for you, though they will not risk their lives for you.' }
  },
  {
    id: 'noble',
    name: 'Noble',
    skillProficiencies: ['History', 'Persuasion'],
    feature: { name: 'Position of Privilege', description: 'People are inclined to think the best of you. You are welcome in high society, and people assume you have the right to be wherever you are.' }
  },
  {
    id: 'sage',
    name: 'Sage',
    skillProficiencies: ['Arcana', 'History'],
    feature: { name: 'Researcher', description: 'When you attempt to learn or recall a piece of lore, you often know where and from whom you can obtain it, if you do not already know it.' }
  },
  {
    id: 'soldier',
    name: 'Soldier',
    skillProficiencies: ['Athletics', 'Intimidation'],
    feature: { name: 'Military Rank', description: 'You have a military rank from your career as a soldier. Soldiers loyal to your former military organization still recognize your authority and influence.' }
  },
  {
    id: 'charlatan',
    name: 'Charlatan',
    skillProficiencies: ['Deception', 'Sleight of Hand'],
    feature: { name: 'False Identity', description: 'You have created a second identity with documentation, established acquaintances, and disguises that lets you assume that persona.' }
  },
  {
    id: 'hermit',
    name: 'Hermit',
    skillProficiencies: ['Medicine', 'Religion'],
    feature: { name: 'Discovery', description: 'Your seclusion has led to a unique and powerful discovery — a great truth about the cosmos, a forbidden secret, or a lost knowledge.' }
  }
]

export interface ClassLevel {
  className: string
  level: number
  subclass?: string
}

/** One headline feature unlocked at a given class level — name + a short one-line gist, not full rules text. Ability Score Improvement levels are deliberately generic since the exact choice (ASI vs feat) is the player's. */
export interface ClassLevelFeature {
  level: number
  name: string
  description: string
}

const ASI: ClassLevelFeature = {
  level: 0,
  name: 'Ability Score Improvement',
  description: 'Increase one ability score by 2, or two scores by 1 each — or take a feat instead, if your table allows them.'
}

function asi(level: number): ClassLevelFeature {
  return { ...ASI, level }
}

/** Curated headline progression by class id, levels 1-20. Not exhaustive rules text — enough to tell you what you got, and to drive the level-up prompt. */
export const CLASS_LEVEL_FEATURES: Record<string, ClassLevelFeature[]> = {
  barbarian: [
    { level: 1, name: 'Rage', description: 'Fly into a rage for bonus damage and resistance to bludgeoning/piercing/slashing.' },
    { level: 1, name: 'Unarmored Defense', description: 'AC = 10 + Dex mod + Con mod while not wearing armor.' },
    { level: 2, name: 'Reckless Attack', description: 'Attack with advantage at the cost of attacks against you also having advantage.' },
    { level: 2, name: 'Danger Sense', description: 'Advantage on Dex saves against effects you can see.' },
    { level: 3, name: 'Primal Path', description: 'Choose a barbarian subclass.' },
    asi(4),
    { level: 5, name: 'Extra Attack', description: 'Attack twice, instead of once, whenever you take the Attack action.' },
    { level: 5, name: 'Fast Movement', description: '+10 ft speed while not wearing heavy armor.' },
    { level: 6, name: 'Path Feature', description: 'Gain a feature from your Primal Path.' },
    { level: 7, name: 'Feral Instinct', description: 'Advantage on initiative; act normally when surprised if you rage first.' },
    asi(8),
    { level: 9, name: 'Brutal Critical (1 die)', description: 'Roll one extra weapon damage die on a critical hit.' },
    { level: 10, name: 'Path Feature', description: 'Gain a feature from your Primal Path.' },
    { level: 11, name: 'Relentless Rage', description: 'Drop to 1 HP instead of 0 once per rage, on a Con save.' },
    asi(12),
    { level: 13, name: 'Brutal Critical (2 dice)', description: 'Roll two extra weapon damage dice on a critical hit.' },
    { level: 14, name: 'Path Feature', description: 'Gain a feature from your Primal Path.' },
    { level: 15, name: 'Persistent Rage', description: 'Your rage only ends early if you choose to end it or fall unconscious.' },
    asi(16),
    { level: 17, name: 'Brutal Critical (3 dice)', description: 'Roll three extra weapon damage dice on a critical hit.' },
    { level: 18, name: 'Indomitable Might', description: 'Use your Strength score in place of a lower Strength check total.' },
    asi(19),
    { level: 20, name: 'Primal Champion', description: 'Strength and Constitution scores increase by 4, to a max of 24.' }
  ],
  bard: [
    { level: 1, name: 'Spellcasting', description: 'Cast bard spells using Charisma.' },
    { level: 1, name: 'Bardic Inspiration (d6)', description: 'Give an ally a bonus die to add to one roll.' },
    { level: 2, name: 'Jack of All Trades', description: 'Add half your proficiency bonus to ability checks you aren’t proficient in.' },
    { level: 2, name: 'Song of Rest (d6)', description: 'Allies who rest with you regain extra HP.' },
    { level: 3, name: 'Bard College', description: 'Choose a bard subclass, and gain Expertise in two skills.' },
    asi(4),
    { level: 5, name: 'Bardic Inspiration (d8)', description: 'Your inspiration die improves; also gain Font of Inspiration (regain uses on a short rest).' },
    { level: 6, name: 'Countercharm', description: 'You and nearby allies get advantage on saves against being frightened or charmed; gain a College feature.' },
    asi(8),
    { level: 9, name: 'Song of Rest (d8)', description: 'Your rest-healing die improves.' },
    { level: 10, name: 'Bardic Inspiration (d10)', description: 'Your inspiration die improves further; gain Expertise and a College feature.' },
    asi(12),
    { level: 13, name: 'Song of Rest (d10)', description: 'Your rest-healing die improves.' },
    { level: 14, name: 'Magical Secrets', description: 'Learn two spells from any class list; gain a College feature.' },
    { level: 15, name: 'Bardic Inspiration (d12)', description: 'Your inspiration die improves to its maximum.' },
    asi(16),
    { level: 17, name: 'Song of Rest (d12)', description: 'Your rest-healing die reaches its maximum.' },
    { level: 18, name: 'Magical Secrets', description: 'Learn two more spells from any class list.' },
    asi(19),
    { level: 20, name: 'Superior Inspiration', description: 'Regain one use of Bardic Inspiration when you roll initiative with none left.' }
  ],
  cleric: [
    { level: 1, name: 'Spellcasting', description: 'Cast cleric spells using Wisdom.' },
    { level: 1, name: 'Divine Domain', description: 'Choose a divine domain, granting domain spells and features.' },
    { level: 2, name: 'Channel Divinity (1/rest)', description: 'Fuel a divine effect, including Turn Undead and a domain option.' },
    { level: 3, name: 'Domain Feature', description: 'Gain a feature from your Divine Domain.' },
    asi(4),
    { level: 5, name: 'Destroy Undead (CR ½)', description: 'Turned undead of low CR are destroyed instead of fleeing.' },
    { level: 6, name: 'Channel Divinity (2/rest)', description: 'Use Channel Divinity twice between rests; gain a Domain feature.' },
    { level: 8, name: 'Destroy Undead (CR 1)', description: 'Turned undead threshold increases; gain a Domain feature.' },
    { level: 10, name: 'Divine Intervention', description: 'Call on your deity for a miracle, once per long rest.' },
    { level: 11, name: 'Destroy Undead (CR 2)', description: 'Turned undead threshold increases further.' },
    asi(12),
    { level: 14, name: 'Destroy Undead (CR 3)', description: 'Turned undead threshold increases further.' },
    asi(16),
    { level: 17, name: 'Destroy Undead (CR 4)', description: 'Turned undead threshold increases further; gain a Domain feature.' },
    { level: 18, name: 'Channel Divinity (3/rest)', description: 'Use Channel Divinity three times between rests.' },
    asi(19),
    { level: 20, name: 'Divine Intervention Improvement', description: 'Your Divine Intervention succeeds automatically.' }
  ],
  druid: [
    { level: 1, name: 'Druidic', description: 'You know the secret language of druids.' },
    { level: 1, name: 'Spellcasting', description: 'Cast druid spells using Wisdom.' },
    { level: 2, name: 'Wild Shape', description: 'Transform into a beast with a challenge rating of 1/4 or lower, no flying or swimming speed, twice per short rest.' },
    { level: 2, name: 'Druid Circle', description: 'Choose a druid subclass.' },
    { level: 4, name: 'Wild Shape Improvement', description: 'Wild Shape into a beast with a challenge rating of 1/2 or lower — a swimming speed is now allowed, but not a flying one.' },
    asi(4),
    { level: 6, name: 'Circle Feature', description: 'Gain a feature from your Druid Circle.' },
    { level: 8, name: 'Wild Shape Improvement', description: 'Wild Shape into a beast with a challenge rating of 1 or lower — a flying speed is now allowed.' },
    asi(8),
    { level: 10, name: 'Circle Feature', description: 'Gain a feature from your Druid Circle.' },
    asi(12),
    { level: 14, name: 'Circle Feature', description: 'Gain a feature from your Druid Circle.' },
    asi(16),
    { level: 18, name: 'Timeless Body', description: 'Age more slowly; also gain Beast Spells (cast while Wild Shaped).' },
    asi(19),
    { level: 20, name: 'Archdruid', description: 'Wild Shape an unlimited number of times.' }
  ],
  fighter: [
    { level: 1, name: 'Fighting Style', description: 'Adopt a specialized style of combat.' },
    { level: 1, name: 'Second Wind', description: 'Regain HP as a bonus action, once per short rest.' },
    { level: 2, name: 'Action Surge (1 use)', description: 'Take one additional action on your turn, once per short rest.' },
    { level: 3, name: 'Martial Archetype', description: 'Choose a fighter subclass.' },
    asi(4),
    { level: 5, name: 'Extra Attack (1)', description: 'Attack twice, instead of once, whenever you take the Attack action.' },
    asi(6),
    { level: 7, name: 'Archetype Feature', description: 'Gain a feature from your Martial Archetype.' },
    asi(8),
    { level: 9, name: 'Indomitable (1 use)', description: 'Reroll a failed saving throw, once per long rest.' },
    { level: 10, name: 'Archetype Feature', description: 'Gain a feature from your Martial Archetype.' },
    { level: 11, name: 'Extra Attack (2)', description: 'Attack three times whenever you take the Attack action.' },
    asi(12),
    { level: 13, name: 'Indomitable (2 uses)', description: 'Use Indomitable twice per long rest.' },
    asi(14),
    { level: 15, name: 'Archetype Feature', description: 'Gain a feature from your Martial Archetype.' },
    asi(16),
    { level: 17, name: 'Action Surge (2 uses)', description: 'Use Action Surge twice per short rest; Indomitable improves to three uses.' },
    { level: 18, name: 'Archetype Feature', description: 'Gain a feature from your Martial Archetype.' },
    asi(19),
    { level: 20, name: 'Extra Attack (3)', description: 'Attack four times whenever you take the Attack action.' }
  ],
  monk: [
    { level: 1, name: 'Unarmored Defense', description: 'AC = 10 + Dex mod + Wis mod while unarmored.' },
    { level: 1, name: 'Martial Arts', description: 'Use Dex for unarmed strikes/monk weapons; bonus unarmed strike.' },
    { level: 2, name: 'Ki', description: 'Spend ki points to fuel Flurry of Blows, Patient Defense, Step of the Wind.' },
    { level: 2, name: 'Unarmored Movement', description: '+10 ft speed while unarmored.' },
    { level: 3, name: 'Monastic Tradition', description: 'Choose a monk subclass.' },
    { level: 3, name: 'Deflect Missiles', description: 'Reduce and possibly catch and throw back ranged weapon damage.' },
    { level: 4, name: 'Slow Fall', description: 'Reduce falling damage with a reaction.' },
    asi(4),
    { level: 5, name: 'Extra Attack', description: 'Attack twice whenever you take the Attack action.' },
    { level: 5, name: 'Stunning Strike', description: 'Spend a ki point to attempt to stun a creature you hit.' },
    { level: 6, name: 'Ki-Empowered Strikes', description: 'Unarmed strikes count as magical; gain a Tradition feature.' },
    { level: 7, name: 'Evasion', description: 'Take no damage on a successful Dex save against an area effect.' },
    { level: 7, name: 'Stillness of Mind', description: 'Spend your action to end being charmed or frightened.' },
    asi(8),
    { level: 9, name: 'Unarmored Movement Improvement', description: 'Move along vertical surfaces and across liquids.' },
    { level: 10, name: 'Purity of Body', description: 'Immune to disease and poison.' },
    { level: 11, name: 'Tradition Feature', description: 'Gain a feature from your Monastic Tradition.' },
    asi(12),
    { level: 13, name: 'Tongue of the Sun and Moon', description: 'Understand and be understood by any spoken language.' },
    { level: 14, name: 'Diamond Soul', description: 'Proficiency in all saving throws.' },
    { level: 15, name: 'Timeless Body', description: 'Age more slowly, no longer need food or water.' },
    asi(16),
    { level: 17, name: 'Tradition Feature', description: 'Gain a feature from your Monastic Tradition.' },
    { level: 18, name: 'Empty Body', description: 'Turn invisible and resistant to all but force damage, or cast astral projection.' },
    asi(19),
    { level: 20, name: 'Perfect Self', description: 'Regain 4 ki points when you roll initiative with none left.' }
  ],
  paladin: [
    { level: 1, name: 'Divine Sense', description: 'Detect celestials, fiends, and undead nearby.' },
    { level: 1, name: 'Lay on Hands', description: 'A pool of HP you can distribute by touch to heal.' },
    { level: 2, name: 'Fighting Style', description: 'Adopt a specialized style of combat.' },
    { level: 2, name: 'Spellcasting', description: 'Cast paladin spells using Charisma.' },
    { level: 2, name: 'Divine Smite', description: 'Expend a spell slot to deal extra radiant damage on a melee hit.' },
    { level: 3, name: 'Divine Health', description: 'Immune to disease.' },
    { level: 3, name: 'Sacred Oath', description: 'Choose a paladin subclass.' },
    asi(4),
    { level: 5, name: 'Extra Attack', description: 'Attack twice whenever you take the Attack action.' },
    { level: 6, name: 'Aura of Protection', description: 'You and nearby allies add your Charisma modifier to saving throws.' },
    { level: 7, name: 'Oath Feature', description: 'Gain a feature from your Sacred Oath.' },
    asi(8),
    { level: 10, name: 'Aura of Courage', description: 'You and nearby allies can’t be frightened while you’re conscious.' },
    { level: 11, name: 'Improved Divine Smite', description: 'Your melee weapon strikes deal extra radiant damage.' },
    asi(12),
    { level: 14, name: 'Cleansing Touch', description: 'Expend a spell slot to end one spell affecting you or a willing creature.' },
    { level: 15, name: 'Oath Feature', description: 'Gain a feature from your Sacred Oath.' },
    asi(16),
    { level: 18, name: 'Aura Improvements', description: 'Your auras’ range increases to 30 feet.' },
    asi(19),
    { level: 20, name: 'Oath Feature (Capstone)', description: 'Gain your Sacred Oath’s capstone feature.' }
  ],
  ranger: [
    { level: 1, name: 'Favored Enemy', description: 'Advantage tracking and recalling lore about a chosen enemy type.' },
    { level: 1, name: 'Natural Explorer', description: 'Gain benefits while traveling in a favored terrain.' },
    { level: 2, name: 'Fighting Style', description: 'Adopt a specialized style of combat.' },
    { level: 2, name: 'Spellcasting', description: 'Cast ranger spells using Wisdom.' },
    { level: 3, name: 'Ranger Archetype', description: 'Choose a ranger subclass.' },
    { level: 3, name: 'Primeval Awareness', description: 'Expend a spell slot to sense certain creature types nearby.' },
    asi(4),
    { level: 5, name: 'Extra Attack', description: 'Attack twice whenever you take the Attack action.' },
    { level: 6, name: 'Favored Enemy & Explorer Improvement', description: 'Gain an additional favored enemy and favored terrain.' },
    { level: 7, name: 'Archetype Feature', description: 'Gain a feature from your Ranger Archetype.' },
    { level: 8, name: 'Land’s Stride', description: 'Move through nonmagical difficult terrain without cost.' },
    asi(8),
    { level: 10, name: 'Natural Explorer Improvement', description: 'Gain another favored terrain; also Hide in Plain Sight.' },
    { level: 11, name: 'Archetype Feature', description: 'Gain a feature from your Ranger Archetype.' },
    asi(12),
    { level: 14, name: 'Vanish', description: 'Hide as a bonus action; can’t be tracked non-magically.' },
    { level: 15, name: 'Archetype Feature', description: 'Gain a feature from your Ranger Archetype.' },
    asi(16),
    { level: 18, name: 'Feral Senses', description: 'Fight invisible creatures without disadvantage.' },
    asi(19),
    { level: 20, name: 'Foe Slayer', description: 'Add your Wisdom modifier to one attack or damage roll per turn against a favored enemy.' }
  ],
  rogue: [
    { level: 1, name: 'Expertise', description: 'Double your proficiency bonus for two chosen skill proficiencies.' },
    {
      level: 1,
      name: 'Sneak Attack',
      description:
        'Once per turn, deal an extra 1d6 damage (see the Combat tab for your current total, which grows every two Rogue levels) to one creature you hit with an attack using a Finesse or Ranged weapon, if you have advantage on the attack roll. You don’t need advantage if another enemy of the target is within 5 feet of it, that enemy isn’t incapacitated, and you don’t have disadvantage on the attack roll.'
    },
    { level: 1, name: 'Thieves’ Cant', description: 'A secret mix of dialect, jargon, and code.' },
    { level: 2, name: 'Cunning Action', description: 'Dash, Disengage, or Hide as a bonus action.' },
    { level: 3, name: 'Roguish Archetype', description: 'Choose a rogue subclass.' },
    asi(4),
    { level: 5, name: 'Uncanny Dodge', description: 'Halve the damage of one attack that hits you, as a reaction.' },
    { level: 6, name: 'Expertise', description: 'Double your proficiency bonus for two more skill proficiencies.' },
    { level: 7, name: 'Evasion', description: 'Take no damage on a successful Dex save against an area effect.' },
    asi(8),
    { level: 9, name: 'Archetype Feature', description: 'Gain a feature from your Roguish Archetype.' },
    asi(10),
    { level: 11, name: 'Reliable Talent', description: 'Treat any proficient ability check d20 roll of 9 or lower as a 10.' },
    asi(12),
    { level: 13, name: 'Archetype Feature', description: 'Gain a feature from your Roguish Archetype.' },
    { level: 14, name: 'Blindsense', description: 'Sense hidden or invisible creatures within 10 feet.' },
    { level: 15, name: 'Slippery Mind', description: 'Gain proficiency in Wisdom saving throws.' },
    asi(16),
    { level: 17, name: 'Archetype Feature', description: 'Gain a feature from your Roguish Archetype.' },
    { level: 18, name: 'Elusive', description: 'No attack roll has advantage against you while you aren’t incapacitated.' },
    asi(19),
    { level: 20, name: 'Stroke of Luck', description: 'Turn a miss into a hit, or a failed check into a 20, once per short rest.' }
  ],
  sorcerer: [
    { level: 1, name: 'Spellcasting', description: 'Cast sorcerer spells using Charisma.' },
    { level: 1, name: 'Sorcerous Origin', description: 'Choose a sorcerer subclass.' },
    { level: 2, name: 'Font of Magic', description: 'Gain sorcery points, convertible to and from spell slots.' },
    { level: 3, name: 'Metamagic', description: 'Learn two ways to twist your spells to suit your needs.' },
    asi(4),
    { level: 6, name: 'Origin Feature', description: 'Gain a feature from your Sorcerous Origin.' },
    asi(8),
    { level: 10, name: 'Metamagic', description: 'Learn an additional Metamagic option.' },
    asi(12),
    { level: 14, name: 'Origin Feature', description: 'Gain a feature from your Sorcerous Origin.' },
    asi(16),
    { level: 17, name: 'Metamagic', description: 'Learn an additional Metamagic option.' },
    { level: 18, name: 'Origin Feature', description: 'Gain a feature from your Sorcerous Origin.' },
    asi(19),
    { level: 20, name: 'Sorcerous Restoration', description: 'Regain 4 sorcery points on a short rest.' }
  ],
  warlock: [
    { level: 1, name: 'Otherworldly Patron', description: 'Choose the being that granted you power.' },
    { level: 1, name: 'Pact Magic', description: 'Cast warlock spells using Charisma; slots recharge on a short rest.' },
    { level: 2, name: 'Eldritch Invocations', description: 'Learn eldritch secrets that grant magical benefits.' },
    { level: 3, name: 'Pact Boon', description: 'Choose a boon from your patron: Blade, Chain, or Tome.' },
    asi(4),
    { level: 6, name: 'Patron Feature', description: 'Gain a feature from your Otherworldly Patron.' },
    asi(8),
    { level: 10, name: 'Patron Feature', description: 'Gain a feature from your Otherworldly Patron.' },
    { level: 11, name: 'Mystic Arcanum (6th level)', description: 'Learn a 6th-level spell you can cast once per long rest without a slot.' },
    asi(12),
    { level: 13, name: 'Mystic Arcanum (7th level)', description: 'Learn a 7th-level spell you can cast once per long rest without a slot.' },
    { level: 14, name: 'Patron Feature', description: 'Gain a feature from your Otherworldly Patron.' },
    { level: 15, name: 'Mystic Arcanum (8th level)', description: 'Learn an 8th-level spell you can cast once per long rest without a slot.' },
    asi(16),
    { level: 17, name: 'Mystic Arcanum (9th level)', description: 'Learn a 9th-level spell you can cast once per long rest without a slot.' },
    asi(19),
    { level: 20, name: 'Eldritch Master', description: 'Regain all expended Pact Magic slots once per long rest, outside of it.' }
  ],
  wizard: [
    { level: 1, name: 'Spellcasting', description: 'Cast wizard spells using Intelligence, prepared from your spellbook.' },
    { level: 1, name: 'Arcane Recovery', description: 'Recover expended spell slots once per day on a short rest.' },
    { level: 2, name: 'Arcane Tradition', description: 'Choose a wizard subclass.' },
    asi(4),
    { level: 6, name: 'Tradition Feature', description: 'Gain a feature from your Arcane Tradition.' },
    asi(8),
    { level: 10, name: 'Tradition Feature', description: 'Gain a feature from your Arcane Tradition.' },
    asi(12),
    { level: 14, name: 'Tradition Feature', description: 'Gain a feature from your Arcane Tradition.' },
    asi(16),
    { level: 18, name: 'Spell Mastery', description: 'Cast a chosen 1st- and 2nd-level spell at will without a slot.' },
    asi(19),
    { level: 20, name: 'Signature Spells', description: 'Always have two 3rd-level spells prepared, castable once each without a slot.' }
  ]
}

/** Player-authored entries for homebrew classes/levels the curated table doesn't cover — still surfaced by the level-up prompt like curated ones. */
export interface CustomClassFeature {
  id: string
  className: string
  level: number
  name: string
  description: string
}

/** Curated features unlocked strictly after `fromLevel` and up to `toLevel`, for the class matching `className` (case-insensitive name match against CLASSES). */
export function curatedFeaturesForLevelUp(className: string, fromLevel: number, toLevel: number): ClassLevelFeature[] {
  const cls = CLASSES.find((c) => c.name.toLowerCase() === className.toLowerCase())
  if (!cls) return []
  const table = CLASS_LEVEL_FEATURES[cls.id] ?? []
  return table.filter((f) => f.level > fromLevel && f.level <= toLevel)
}

/** Rogue Sneak Attack's damage die count at a given Rogue class level — 1d6 at 1st, +1d6 every 2 levels, capping at 10d6 at 19th. Shown dynamically wherever Sneak Attack is displayed, since the curated feature table only has one static row for it. */
export function sneakAttackDice(rogueLevel: number): string {
  return `${Math.min(10, Math.ceil(rogueLevel / 2))}d6`
}

/** Every ASI level (from CLASS_LEVEL_FEATURES's asi() rows) at or below `level` for a class — the set of slots FeaturesTab.tsx needs to render (resolved or as an inline chooser) for that class at its current level. */
export function asiSlotLevelsUpToLevel(className: string, level: number): number[] {
  return curatedFeaturesForLevelUp(className, 0, level)
    .filter((f) => f.name === 'Ability Score Improvement')
    .map((f) => f.level)
}

/**
 * Every "Fighting Style" level (Fighter 1, Paladin 2, Ranger 2) at or below
 * `level` — same shape as asiSlotLevelsUpToLevel. Under SRD 5.2.1, Fighting
 * Style is granted as a pick from the "Fighting Style" category feats (see
 * shared/compendium.ts's FEATS), so a slot here resolves into the exact same
 * asiSlotChoices record an ASI-into-a-feat pick does (kind: 'feat') — it's
 * just restricted to that one feat category and always free (no ability
 * score prerequisite to gate it).
 */
export function fightingStyleSlotLevelsUpToLevel(className: string, level: number): number[] {
  return curatedFeaturesForLevelUp(className, 0, level)
    .filter((f) => f.name === 'Fighting Style')
    .map((f) => f.level)
}

/** Subclass-granted extra Fighting Style picks, on top of the base-class one above — SRD 2014's only case is the Fighter's Champion archetype, which gets a second pick (Additional Fighting Style) at 10th level. Keyed off the class's chosen subclass id (see shared/compendium.ts's CompendiumSubclass), not the class table, since this is archetype-specific rather than universal to the class. */
export function subclassFightingStyleSlotLevelsUpToLevel(classId: string, subclassId: string | undefined, level: number): number[] {
  if (classId === 'fighter' && subclassId === 'champion' && level >= 10) return [10]
  return []
}

/** SRD 2014 Ranger Favored Enemy — creature types (plus two humanoid races of your choice, represented here as freeform-friendly generic options); one is chosen at 1st level, a second at 6th ("Favored Enemy & Explorer Improvement"). */
export const FAVORED_ENEMY_OPTIONS: NamedOption[] = [
  { name: 'Aberrations', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Aberrations — plus learn one language they speak, if any.' },
  { name: 'Beasts', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Beasts — plus learn one language they speak, if any.' },
  { name: 'Celestials', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Celestials — plus learn one language they speak, if any.' },
  { name: 'Constructs', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Constructs — plus learn one language they speak, if any.' },
  { name: 'Dragons', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Dragons — plus learn one language they speak, if any.' },
  { name: 'Elementals', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Elementals — plus learn one language they speak, if any.' },
  { name: 'Fey', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Fey — plus learn one language they speak, if any.' },
  { name: 'Fiends', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Fiends — plus learn one language they speak, if any.' },
  { name: 'Giants', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Giants — plus learn one language they speak, if any.' },
  { name: 'Monstrosities', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Monstrosities — plus learn one language they speak, if any.' },
  { name: 'Oozes', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Oozes — plus learn one language they speak, if any.' },
  { name: 'Plants', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Plants — plus learn one language they speak, if any.' },
  { name: 'Undead', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, Undead — plus learn one language they speak, if any.' },
  { name: 'Humanoids (two races of your choice)', description: 'Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall lore about, two races of humanoid you choose — plus learn one language spoken by either, if any.' }
]

/** SRD 2014 Ranger Natural Explorer favored terrains — one chosen at 1st level, additional ones at 6th and 10th. */
/** Natural Explorer's benefits are identical in every favored terrain — only which terrain they apply to changes — so each option gets the same full text (parameterized by name) rather than pointing back at whichever one happened to be listed first. */
function naturalExplorerDescription(terrain: string): string {
  return `While traveling for an hour or more in ${terrain.toLowerCase()} terrain, you gain the following benefits: difficult terrain doesn’t slow your group’s travel, you can’t get lost except by magic, you stay alert to danger even while doing another task while traveling (such as foraging, navigating, or tracking), if you’re traveling alone you can move stealthily at a normal pace, when you forage you find twice as much food as you normally would, and while tracking other creatures you also learn their exact number, their sizes, and how long ago they passed through the area.`
}

export const FAVORED_TERRAIN_OPTIONS: NamedOption[] = [
  { name: 'Arctic', description: naturalExplorerDescription('Arctic') },
  { name: 'Coast', description: naturalExplorerDescription('Coast') },
  { name: 'Desert', description: naturalExplorerDescription('Desert') },
  { name: 'Forest', description: naturalExplorerDescription('Forest') },
  { name: 'Grassland', description: naturalExplorerDescription('Grassland') },
  { name: 'Mountain', description: naturalExplorerDescription('Mountain') },
  { name: 'Swamp', description: naturalExplorerDescription('Swamp') },
  { name: 'Underdark', description: naturalExplorerDescription('Underdark') }
]

/** Favored Enemy is picked at 1st level, then again at 6th ("Favored Enemy & Explorer Improvement") — same shape as asiSlotLevelsUpToLevel/fightingStyleSlotLevelsUpToLevel. */
export function favoredEnemySlotLevelsUpToLevel(level: number): number[] {
  return [1, 6].filter((l) => level >= l)
}

/** Natural Explorer's favored terrain is picked at 1st, 6th, and 10th level. */
export function favoredTerrainSlotLevelsUpToLevel(level: number): number[] {
  return [1, 6, 10].filter((l) => level >= l)
}

export interface NamedOption {
  name: string
  description: string
}

/** SRD 2014 sorcerer Metamagic — 8 options, each a standing modification you can apply to a spell you cast by spending sorcery points. */
export const METAMAGIC_OPTIONS: NamedOption[] = [
  { name: 'Careful Spell', description: 'When you cast a spell that forces a saving throw, you can protect up to Charisma modifier creatures from its effect — they auto-succeed. Costs 1 sorcery point.' },
  { name: 'Distant Spell', description: 'When you cast a spell with a range of 5+ feet, double its range; a touch spell becomes 30 feet. Costs 1 sorcery point.' },
  { name: 'Empowered Spell', description: 'When you roll damage for a spell, reroll up to Charisma modifier (minimum 1) damage dice, using the new rolls. Costs 1 sorcery point.' },
  { name: 'Extended Spell', description: 'When you cast a spell with a duration of 1 minute or longer, double its duration, to a maximum of 24 hours. Costs 1 sorcery point.' },
  { name: 'Heightened Spell', description: 'When you cast a spell that forces a saving throw, give one target disadvantage on its first save against it. Costs 3 sorcery points.' },
  { name: 'Quickened Spell', description: 'When you cast a spell with a casting time of one action, change its casting time to a bonus action instead. Costs 2 sorcery points.' },
  { name: 'Subtle Spell', description: 'When you cast a spell, cast it without any somatic or verbal components. Costs 1 sorcery point.' },
  { name: 'Twinned Spell', description: 'When you cast a spell that targets only one creature and doesn’t have a range of Self, target a second creature in range with the same spell (spell slot level twice, minus one, sorcery points if it doesn’t already target multiple). Costs a number of sorcery points equal to the spell’s level (1 for a cantrip).' }
]

/** Metamagic options known grows at 3rd, 10th, and 17th level — 2 → 3 → 4 total, never fewer, never a re-pick of ones already known. */
export function metamagicSlotCountAtLevel(level: number): number {
  if (level >= 17) return 4
  if (level >= 10) return 3
  if (level >= 3) return 2
  return 0
}

/** Which class level unlocked the Nth Metamagic pick (0-indexed) — the first two both unlock at 3rd level, so this is purely for display ("Metamagic — Sorcerer 3"), not a dedup key the way an ASI slot's level is. */
export function metamagicSlotUnlockLevel(pickIndex: number): number {
  return pickIndex < 2 ? 3 : pickIndex === 2 ? 10 : 17
}

/** SRD 2014 warlock Pact Boon — one of three, chosen once at 3rd level and never changed again by the class table itself. */
export const PACT_BOON_OPTIONS: NamedOption[] = [
  { name: 'Pact of the Chain', description: 'Learn the find familiar spell and can cast it as a ritual; when you cast it, you can choose one of three normally-unavailable forms (imp, pseudodragon, quasit, or sprite) for your familiar, which also gains the ability to attack.' },
  { name: 'Pact of the Blade', description: 'Conjure a pact weapon in your hand as an action — any melee weapon you’re proficient with, which counts as magical for overcoming resistance. Dismiss it as a free action; conjuring it again while it’s not on your person returns it to your hand instead of creating a new one.' },
  { name: 'Pact of the Tome', description: 'Your patron gives you a Book of Shadows. Choose three cantrips from any class’s spell list — they count as warlock spells for you and don’t count against your number of cantrips known.' }
]

export interface EldritchInvocationOption extends NamedOption {
  /** Minimum warlock level required — 2, 5, 7, 9, 12, or 15 in the SRD. */
  level: number
  /** Requires having taken this exact Pact Boon (see PACT_BOON_OPTIONS) — undefined if the invocation has no pact requirement. */
  prereqPact?: string
  /** Requires knowing this spell (compendium id) — every case in the SRD is eldritch-blast. */
  prereqSpell?: string
}

/** SRD 2014 warlock Eldritch Invocations — the full list, each gated by warlock level and (for some) a Pact Boon or known spell. */
export const ELDRITCH_INVOCATIONS: EldritchInvocationOption[] = [
  { name: 'Agonizing Blast', level: 2, prereqSpell: 'eldritch-blast', description: 'When you cast eldritch blast, add your Charisma modifier to the damage it deals on a hit.' },
  { name: 'Armor of Shadows', level: 2, description: 'You can cast mage armor on yourself at will, without expending a spell slot or material components.' },
  { name: 'Beast Speech', level: 2, description: 'You can cast speak with animals at will, without expending a spell slot.' },
  { name: 'Beguiling Influence', level: 2, description: 'You gain proficiency in the Deception and Persuasion skills.' },
  {
    name: 'Book of Ancient Secrets',
    level: 2,
    prereqPact: 'Pact of the Tome',
    description:
      "You can now inscribe magical rituals in your Book of Shadows. Choose two 1st-level spells that have the ritual tag from any class's spell list (the two needn't be from the same list). The spells appear in the book and don't count against the number of spells you know. With your Book of Shadows in hand, you can cast the chosen spells as rituals. You can't cast the spells except as rituals, unless you've learned them by some other means. You can also cast a warlock spell you know as a ritual if it has the ritual tag. On your adventures, you can add other ritual spells to your Book of Shadows. When you find such a spell, you can add it to the book if the spell's level is equal to or less than half your warlock level (rounded up) and if you can spare the time to transcribe the spell. For each level of the spell, the transcription process takes 2 hours and costs 50 gp for the rare inks needed to inscribe it."
  },
  { name: "Devil's Sight", level: 2, description: 'You can see normally in darkness, both magical and nonmagical, to a distance of 120 feet.' },
  { name: 'Eldritch Sight', level: 2, description: 'You can cast detect magic at will, without expending a spell slot.' },
  { name: 'Eldritch Spear', level: 2, prereqSpell: 'eldritch-blast', description: 'When you cast eldritch blast, its range is 300 feet.' },
  { name: 'Eyes of the Rune Keeper', level: 2, description: 'You can read all writing.' },
  {
    name: 'Fiendish Vigor',
    level: 2,
    description: 'You can cast false life on yourself at will as a 1st-level spell, without expending a spell slot or material components.'
  },
  {
    name: 'Gaze of Two Minds',
    level: 2,
    description:
      "You can use your action to touch a willing humanoid and perceive through its senses until the end of your next turn. As long as the creature is on the same plane of existence as you, you can use your action on subsequent turns to maintain this connection, extending the duration until the end of your next turn. While perceiving through the other creature's senses, you benefit from any special senses possessed by that creature, and you are blinded and deafened to your own surroundings."
  },
  { name: 'Mask of Many Faces', level: 2, description: 'You can cast disguise self at will, without expending a spell slot.' },
  { name: 'Misty Visions', level: 2, description: 'You can cast silent image at will, without expending a spell slot or material components.' },
  {
    name: 'Repelling Blast',
    level: 2,
    prereqSpell: 'eldritch-blast',
    description: 'When you hit a creature with eldritch blast, you can push the creature up to 10 feet away from you in a straight line.'
  },
  { name: 'Thief of Five Fates', level: 2, description: "You can cast bane once using a warlock spell slot. You can't do so again until you finish a long rest." },
  {
    name: 'Voice of the Chain Master',
    level: 2,
    prereqPact: 'Pact of the Chain',
    description:
      "You can communicate telepathically with your familiar and perceive through your familiar's senses as long as you are on the same plane of existence. Additionally, while perceiving through your familiar's senses, you can also speak through your familiar in your own voice, even if your familiar is normally incapable of speech."
  },
  { name: 'Mire the Mind', level: 5, description: "You can cast slow once using a warlock spell slot. You can't do so again until you finish a long rest." },
  {
    name: 'One with Shadows',
    level: 5,
    description: 'When you are in an area of dim light or darkness, you can use your action to become invisible until you move or take an action or a reaction.'
  },
  { name: 'Sign of Ill Omen', level: 5, description: "You can cast bestow curse once using a warlock spell slot. You can't do so again until you finish a long rest." },
  {
    name: 'Thirsting Blade',
    level: 5,
    prereqPact: 'Pact of the Blade',
    description: 'You can attack with your pact weapon twice, instead of once, whenever you take the Attack action on your turn.'
  },
  { name: 'Bewitching Whispers', level: 7, description: "You can cast compulsion once using a warlock spell slot. You can't do so again until you finish a long rest." },
  { name: 'Dreadful Word', level: 7, description: "You can cast confusion once using a warlock spell slot. You can't do so again until you finish a long rest." },
  { name: 'Sculptor of Flesh', level: 7, description: "You can cast polymorph once using a warlock spell slot. You can't do so again until you finish a long rest." },
  { name: 'Ascendant Step', level: 9, description: 'You can cast levitate on yourself at will, without expending a spell slot or material components.' },
  {
    name: 'Minions of Chaos',
    level: 9,
    description: "You can cast conjure elemental once using a warlock spell slot. You can't do so again until you finish a long rest."
  },
  { name: 'Otherworldly Leap', level: 9, description: 'You can cast jump on yourself at will, without expending a spell slot or material components.' },
  { name: 'Whispers of the Grave', level: 9, description: 'You can cast speak with dead at will, without expending a spell slot.' },
  {
    name: 'Lifedrinker',
    level: 12,
    prereqPact: 'Pact of the Blade',
    description: 'When you hit a creature with your pact weapon, the creature takes extra necrotic damage equal to your Charisma modifier (minimum 1).'
  },
  {
    name: 'Chains of Carceri',
    level: 15,
    prereqPact: 'Pact of the Chain',
    description:
      'You can cast hold monster at will--targeting a celestial, fiend, or elemental--without expending a spell slot or material components. You must finish a long rest before you can use this invocation on the same creature again.'
  },
  { name: 'Master of Myriad Forms', level: 15, description: 'You can cast alter self at will, without expending a spell slot.' },
  { name: 'Visions of Distant Realms', level: 15, description: 'You can cast arcane eye at will, without expending a spell slot.' },
  {
    name: 'Witch Sight',
    level: 15,
    description: 'You can see the true form of any shapechanger or creature concealed by illusion or transmutation magic while the creature is within 30 feet of you and within line of sight.'
  }
]

/** Invocations known grows at 2nd, 5th, 7th, 9th, 11th, 14th, and 17th level — the standard SRD warlock progression (2 → 3 → 4 → 5 → 6 → 7 → 8), maxing out at 17th and never shrinking. */
export function eldritchInvocationSlotCountAtLevel(level: number): number {
  if (level >= 17) return 8
  if (level >= 14) return 7
  if (level >= 11) return 6
  if (level >= 9) return 5
  if (level >= 7) return 4
  if (level >= 5) return 3
  if (level >= 2) return 2
  return 0
}

/** An AsiSlotChoice is "active" only while the class it belongs to is still at or above the level it resolves — lowering a class's level (not deleting the record) is enough to make it (and whatever it granted) disappear everywhere, and raising it back restores the exact same choice instead of forcing a re-pick. */
export function activeAsiSlotChoices(classes: ClassLevel[], asiSlotChoices: AsiSlotChoice[]): AsiSlotChoice[] {
  return asiSlotChoices.filter((slot) => {
    const cls = classes.find((c) => c.className.toLowerCase() === slot.className.toLowerCase())
    return !!cls && cls.level >= slot.level
  })
}

/** Ids of every feat currently in effect — derived from active (see above) `kind: 'feat'` slot choices, never stored as its own list. */
export function activeFeatIds(classes: ClassLevel[], asiSlotChoices: AsiSlotChoice[]): string[] {
  return activeAsiSlotChoices(classes, asiSlotChoices)
    .filter((s): s is AsiSlotChoice & { featId: string } => s.kind === 'feat' && !!s.featId)
    .map((s) => s.featId)
}

/** Same active/inactive lifecycle as activeAsiSlotChoices — a SubclassFeatureChoice only counts while its class is still at or above the level it resolves. */
export function activeSubclassFeatureChoices(classes: ClassLevel[], choices: SubclassFeatureChoice[]): SubclassFeatureChoice[] {
  return choices.filter((choice) => {
    const cls = classes.find((c) => c.className.toLowerCase() === choice.className.toLowerCase())
    return !!cls && cls.level >= choice.level
  })
}

/**
 * A trackable class resource — the handful of D&D Beyond-style "click to
 * use" mechanics (Rage, Ki points, Lay on Hands, Second Wind, ...) rather
 * than the full class feature list, most of which is just flavor text with
 * nothing to click. Deliberately scoped to what the SRD actually defines
 * numbers for; homebrew/other-book resources (e.g. a subclass's own
 * charges) aren't modeled here.
 *
 * `kind: 'uses'` is a set of discrete charges (pips) that reset all at once
 * on the recharge; `kind: 'pool'` is a spendable numeric pool (Lay on
 * Hands' HP) where you dial in how much of it you're using.
 */
export interface ClassResourceDef {
  id: string
  name: string
  kind: 'uses' | 'pool'
  /** The level (in this class) at which the resource is first gained. */
  minLevel: number
  /** A 'short'-recharge resource clears on either a short or a long rest; a 'long'-recharge one only on a long rest. A function since a handful of resources change which one applies at a higher level (e.g. Bardic Inspiration becomes short-recharge at 5th level via Font of Inspiration) — same "computed live from level" idea as `max` below. */
  recharge: (level: number) => 'short' | 'long'
  /** Max uses (kind 'uses') or pool size (kind 'pool') at a given class level. */
  max: (level: number, abilityMod: (ability: Ability) => number) => number
  /** Which action economy this resource is spent with — drives which section of the Actions tab it's grouped into (see CombatTab.tsx). Most are 'bonus' (Rage, Second Wind, Ki-fueled abilities are usually bonus actions) or 'action'; omitted for a resource with no single fixed action cost (e.g. Sorcery Points, which fund other actions rather than being spent as one themselves). */
  actionType?: ActionType
  /** Short one-liner shown directly on the card. */
  description: string
  /** Full SRD rules text (2014 SRD, OGL) — shown as a hover tooltip in FeaturesTab.tsx, same hover-for-detail pattern as everything else on the sheet. */
  fullDescription: string
}

/** Curated by class id — SRD-only, and only the classes/resources the SRD actually gives numbers for (Ranger and Rogue have no chargeable core resource in the SRD, so they're absent here). */
export const CLASS_RESOURCES: Record<string, ClassResourceDef[]> = {
  barbarian: [
    {
      id: 'barbarian-rage',
      name: 'Rage',
      kind: 'uses',
      minLevel: 1,
      actionType: 'bonus',
      recharge: () => 'long',
      max: (level) => (level >= 20 ? 99 : level >= 17 ? 6 : level >= 12 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2),
      description: 'Bonus action to fly into a rage: bonus melee damage, resistance to bludgeoning/piercing/slashing, advantage on Strength checks and saves.',
      fullDescription:
        "In battle, you fight with primal ferocity. On your turn, you can enter a rage as a bonus action. While raging, you gain the following benefits if you aren't wearing heavy armor:\n- You have advantage on Strength checks and Strength saving throws.\n- When you make a melee weapon attack using Strength, you gain a bonus to the damage roll that increases as you level.\n- You have resistance to bludgeoning, piercing, and slashing damage.\nIf you are able to cast spells, you can't cast them or concentrate on them while raging.\nYour rage lasts for 1 minute. It ends early if you are knocked unconscious or if your turn ends and you haven't attacked a hostile creature since your last turn or taken damage since then. You can also end your rage on your turn as a bonus action.\nOnce you have raged the maximum number of times for your barbarian level, you must finish a long rest before you can rage again."
    }
  ],
  bard: [
    {
      id: 'bard-inspiration',
      name: 'Bardic Inspiration',
      kind: 'uses',
      minLevel: 1,
      actionType: 'bonus',
      // Font of Inspiration (5th level) changes this from long-rest to short-rest recharge — see the recharge field's own doc comment above.
      recharge: (level) => (level >= 5 ? 'short' : 'long'),
      max: (_level, abilityMod) => Math.max(1, abilityMod('cha')),
      description: 'Bonus action to give one creature within 60 ft. an inspiration die to add to one ability check, attack roll, or saving throw.',
      fullDescription:
        "You can inspire others through stirring words or music. To do so, you use a bonus action on your turn to choose one creature other than yourself within 60 feet of you who can hear you. That creature gains one Bardic Inspiration die, a d6. Once within the next 10 minutes, the creature can roll the die and add the number rolled to one ability check, attack roll, or saving throw it makes. The creature can wait until after it rolls the d20 before deciding to use the Bardic Inspiration die, but must decide before the GM says whether the roll succeeds or fails. Once the Bardic Inspiration die is rolled, it is lost. A creature can have only one Bardic Inspiration die at a time.\nYou regain any expended uses when you finish a long rest — or a short rest as well, once you have Font of Inspiration at 5th level.\nYour Bardic Inspiration die changes when you reach certain levels in this class: it becomes a d8 at 5th level, a d10 at 10th level, and a d12 at 15th level."
    }
  ],
  cleric: [
    {
      id: 'cleric-channel-divinity',
      name: 'Channel Divinity',
      kind: 'uses',
      minLevel: 2,
      actionType: 'action',
      recharge: () => 'short',
      max: (level) => (level >= 18 ? 3 : level >= 6 ? 2 : 1),
      description: 'Channel divine energy for a supernatural effect, including Turn Undead.',
      fullDescription:
        'You gain the ability to channel divine energy directly from your deity, using that energy to fuel magical effects. You start with two such effects: Turn Undead and an effect determined by your domain. Some domains grant you additional effects as you advance in levels.\nWhen you use your Channel Divinity, you choose which effect to create. You must then finish a short or long rest to use your Channel Divinity again.\nSome Channel Divinity effects require saving throws — the DC equals your cleric spell save DC.\nBeginning at 6th level, you can use your Channel Divinity twice between rests, and beginning at 18th level, three times between rests. When you finish a short or long rest, you regain your expended uses.'
    }
  ],
  druid: [
    {
      id: 'druid-wild-shape',
      name: 'Wild Shape',
      kind: 'uses',
      minLevel: 2,
      actionType: 'action',
      recharge: () => 'short',
      // Archdruid (20th level) makes this unlimited — see the "> 20 renders as Unlimited" display rule in FeaturesTab.tsx's UsesTracker.
      max: (level) => (level >= 20 ? 99 : 2),
      description: 'Magically assume the shape of a beast you’ve seen before.',
      fullDescription:
        "You can use your action to magically assume the shape of a beast that you have seen before. You regain expended uses when you finish a short or long rest — and at 20th level (Archdruid), you can do this an unlimited number of times, no rest required.\nYour druid level determines the beasts you can transform into: at 2nd level, any beast with a challenge rating of 1/4 or lower that doesn't have a flying or swimming speed; at 4th level, up to CR 1/2, swimming speed now allowed; at 8th level, up to CR 1, flying speed now allowed too.\nYou can stay in a beast shape for a number of hours equal to half your druid level (rounded down), reverting early is possible as a bonus action, and you automatically revert if you fall unconscious, drop to 0 hit points, or die.\nWhile transformed: your game statistics are replaced by the beast's, but you keep your alignment, personality, Intelligence/Wisdom/Charisma scores, and proficiencies (using the higher bonus if both you and the beast share one). You can't cast spells or speak. You retain class/race features usable in the new form, but not special senses like darkvision unless the new form also has them."
    }
  ],
  fighter: [
    {
      id: 'fighter-second-wind',
      name: 'Second Wind',
      kind: 'uses',
      minLevel: 1,
      actionType: 'bonus',
      recharge: () => 'short',
      max: () => 1,
      description: 'Bonus action to regain 1d10 + fighter level hit points.',
      fullDescription:
        'You have a limited well of stamina that you can draw on to protect yourself from harm. On your turn, you can use a bonus action to regain hit points equal to 1d10 + your fighter level. Once you use this feature, you must finish a short or long rest before you can use it again.'
    },
    {
      id: 'fighter-action-surge',
      name: 'Action Surge',
      kind: 'uses',
      minLevel: 2,
      actionType: 'action',
      recharge: () => 'short',
      max: (level) => (level >= 17 ? 2 : 1),
      description: 'Take one additional action on your turn.',
      fullDescription:
        'You can push yourself beyond your normal limits for a moment. On your turn, you can take one additional action on top of your regular action and a possible bonus action.\nOnce you use this feature, you must finish a short or long rest before you can use it again. Starting at 17th level, you can use it twice before a rest, but only once on the same turn.'
    },
    {
      id: 'fighter-indomitable',
      name: 'Indomitable',
      kind: 'uses',
      minLevel: 9,
      recharge: () => 'long',
      max: (level) => (level >= 17 ? 3 : level >= 13 ? 2 : 1),
      description: 'Reroll a failed saving throw — you must use the new roll.',
      fullDescription:
        "You can reroll a saving throw that you fail. If you do so, you must use the new roll, and you can't use this feature again until you finish a long rest. You can use this feature twice between long rests starting at 13th level, and three times between long rests starting at 17th level."
    }
  ],
  monk: [
    {
      id: 'monk-ki',
      name: 'Ki Points',
      kind: 'pool',
      minLevel: 2,
      recharge: () => 'short',
      max: (level) => level,
      description: 'Spend to fuel Flurry of Blows, Patient Defense, Step of the Wind, and other ki features.',
      fullDescription:
        'Your training allows you to harness the mystic energy of ki. You can spend ki points to fuel various ki features — you start knowing three: Flurry of Blows, Patient Defense, and Step of the Wind, and learn more as you gain levels.\nWhen you spend a ki point, it is unavailable until you finish a short or long rest, at the end of which you draw all of your expended ki back into yourself (you must spend at least 30 minutes of the rest meditating).\nSome ki features require a saving throw: DC = 8 + your proficiency bonus + your Wisdom modifier.'
    }
  ],
  paladin: [
    {
      id: 'paladin-lay-on-hands',
      name: 'Lay on Hands',
      kind: 'pool',
      minLevel: 1,
      actionType: 'action',
      recharge: () => 'long',
      max: (level) => level * 5,
      description: 'A pool of healing power — touch a creature to restore HP from the pool, 5 points to cure one disease or neutralize one poison.',
      fullDescription:
        "Your blessed touch can heal wounds. You have a pool of healing power that replenishes when you take a long rest — with that pool, you can restore a total number of hit points equal to your paladin level × 5.\nAs an action, you can touch a creature and draw power from the pool to restore hit points to it, up to the maximum remaining in your pool.\nAlternatively, you can expend 5 hit points from your pool to cure the target of one disease or neutralize one poison affecting it (you can cure multiple afflictions with one use, expending hit points separately for each). This feature has no effect on undead and constructs."
    },
    {
      id: 'paladin-divine-sense',
      name: 'Divine Sense',
      kind: 'uses',
      minLevel: 1,
      actionType: 'action',
      recharge: () => 'long',
      max: (_level, abilityMod) => 1 + Math.max(0, abilityMod('cha')),
      description: 'Action to detect celestials, fiends, and undead within 60 ft.',
      fullDescription:
        'The presence of strong evil registers on your senses like a noxious odor, and powerful good rings like heavenly music in your ears. As an action, you can open your awareness to detect such forces: until the end of your next turn, you know the location of any celestial, fiend, or undead within 60 feet of you that is not behind total cover, and its type (but not its identity). You also detect the presence of any place or object that has been consecrated or desecrated.\nWhen you finish a long rest, you regain all expended uses.'
    }
  ],
  sorcerer: [
    {
      id: 'sorcerer-sorcery-points',
      name: 'Sorcery Points',
      kind: 'pool',
      minLevel: 2,
      recharge: () => 'long',
      max: (level) => level,
      description: 'Spend to fuel Metamagic, or convert to/from spell slots.',
      fullDescription:
        'You tap into a deep wellspring of magic within yourself, represented by sorcery points, which allow you to create a variety of magical effects, including fueling your Metamagic options and converting to/from spell slots.\nYou can never have more sorcery points than shown for your sorcerer level. You regain all spent sorcery points when you finish a long rest.'
    }
  ],
  wizard: [
    {
      id: 'wizard-arcane-recovery',
      name: 'Arcane Recovery',
      kind: 'uses',
      minLevel: 1,
      recharge: () => 'long',
      max: () => 1,
      description: 'Once per day, on a short rest, recover expended spell slots with a combined level ≤ half your wizard level (rounded up).',
      fullDescription:
        "You have learned to regain some of your magical energy by studying your spellbook. Once per day when you finish a short rest, you can choose expended spell slots to recover. The spell slots can have a combined level equal to or less than half your wizard level (rounded up), and none of the slots can be 6th level or higher.\nFor example, a 4th-level wizard can recover up to two levels' worth of spell slots — either one 2nd-level slot or two 1st-level slots."
    }
  ]
}

/** Every class resource this character currently has, each carrying its live max (recomputed from the class's current level, never stored) alongside the def itself. */
export function resourcesForCharacter(
  classes: ClassLevel[],
  abilityScores: AbilityScores
): Array<ClassResourceDef & { classId: string; className: string; currentMax: number; currentRecharge: 'short' | 'long' }> {
  const abilityMod = (a: Ability): number => abilityModifier(abilityScores[a])
  const result: Array<ClassResourceDef & { classId: string; className: string; currentMax: number; currentRecharge: 'short' | 'long' }> = []
  for (const c of classes) {
    const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
    if (!cls) continue
    const defs = CLASS_RESOURCES[cls.id] ?? []
    for (const def of defs) {
      if (c.level < def.minLevel) continue
      result.push({ ...def, classId: cls.id, className: cls.name, currentMax: def.max(c.level, abilityMod), currentRecharge: def.recharge(c.level) })
    }
  }
  return result
}

export type ActionType = 'action' | 'bonus' | 'reaction'

/**
 * A class feature that's a free, unlimited-use toggle rather than a
 * chargeable resource (see CLASS_RESOURCES) or a passive number — you turn
 * it on for a scene/turn and its effects apply until you turn it back off.
 * Barbarian's Reckless Attack (attack with advantage, at the cost of
 * attacks against you also having advantage) is the SRD's clearest example;
 * modeled as its own small system rather than shoehorned into
 * CLASS_RESOURCES since it has no "uses" or "pool" to track. Rendered in
 * the Combat tab's Actions section as a plain on/off button, stored the
 * same way an activatable class resource buff is (character.activeBuffs),
 * just without ever spending a use.
 */
export interface ToggleFeatureDef {
  id: string
  name: string
  classId: string
  minLevel: number
  actionType: ActionType
  description: string
}

export const TOGGLE_FEATURES: ToggleFeatureDef[] = [
  {
    id: 'barbarian-reckless-attack',
    name: 'Reckless Attack',
    classId: 'barbarian',
    minLevel: 2,
    actionType: 'action',
    description:
      'When you make your first attack on your turn, you can decide to attack recklessly — doing so gives you advantage on melee weapon attack rolls using Strength during this turn, but attack rolls against you have advantage until your next turn.'
  }
]

/** Every toggle feature the character currently qualifies for, across all their classes. */
export function toggleFeaturesForCharacter(classes: ClassLevel[]): Array<ToggleFeatureDef & { className: string }> {
  const result: Array<ToggleFeatureDef & { className: string }> = []
  for (const c of classes) {
    const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
    if (!cls) continue
    for (const def of TOGGLE_FEATURES) {
      if (def.classId === cls.id && c.level >= def.minLevel) result.push({ ...def, className: c.className })
    }
  }
  return result
}

/**
 * A named, usable ability that spends charges from an existing class
 * resource (see CLASS_RESOURCES) rather than being its own tracked pool —
 * Cleric's Turn Undead (spends Channel Divinity), Monk's Flurry of
 * Blows/Patient Defense/Step of the Wind (each spend 1 ki point). The SRD
 * only ever describes these inside their owning resource's prose, with
 * nothing to click — this is what actually surfaces them as their own
 * "Use" button on the Actions tab (see CombatTab.tsx), spending from the
 * same currentUsed pool their resource card already tracks.
 */
export interface ResourceActionDef {
  id: string
  name: string
  /** The ClassResourceDef.id this spends charges from. */
  resourceId: string
  /** Uses (or ki points) spent per activation. */
  cost: number
  classId: string
  minLevel: number
  actionType: ActionType
  description: string
}

export const RESOURCE_ACTIONS: ResourceActionDef[] = [
  {
    id: 'cleric-turn-undead',
    name: 'Turn Undead',
    resourceId: 'cleric-channel-divinity',
    cost: 1,
    classId: 'cleric',
    minLevel: 2,
    actionType: 'action',
    description:
      'As an action, present your holy symbol and speak a prayer. Each undead within 30 feet that can see or hear you must make a Wisdom saving throw; on a failure, it is turned for 1 minute or until it takes damage.'
  },
  {
    id: 'monk-flurry-of-blows',
    name: 'Flurry of Blows',
    resourceId: 'monk-ki',
    cost: 1,
    classId: 'monk',
    minLevel: 2,
    actionType: 'bonus',
    description: 'Immediately after you take the Attack action on your turn, spend 1 ki point to make two unarmed strikes as a bonus action.'
  },
  {
    id: 'monk-patient-defense',
    name: 'Patient Defense',
    resourceId: 'monk-ki',
    cost: 1,
    classId: 'monk',
    minLevel: 2,
    actionType: 'bonus',
    description: 'Spend 1 ki point to take the Dodge action as a bonus action on your turn.'
  },
  {
    id: 'monk-step-of-the-wind',
    name: 'Step of the Wind',
    resourceId: 'monk-ki',
    cost: 1,
    classId: 'monk',
    minLevel: 2,
    actionType: 'bonus',
    description: 'Spend 1 ki point to take the Disengage or Dash action as a bonus action on your turn, and your jump distance is doubled for the turn.'
  }
]

/** Every resource action the character currently qualifies for, across all their classes. */
export function resourceActionsForCharacter(classes: ClassLevel[]): Array<ResourceActionDef & { className: string }> {
  const result: Array<ResourceActionDef & { className: string }> = []
  for (const c of classes) {
    const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
    if (!cls) continue
    for (const def of RESOURCE_ACTIONS) {
      if (def.classId === cls.id && c.level >= def.minLevel) result.push({ ...def, className: c.className })
    }
  }
  return result
}

/** Class names (as they appear on ClassLevel.className) of every class the character has that's actually a spellcasting class per CLASSES — used to restrict the Spells tab's "+ Add Spell" picker to spells on the character's own class list(s), the way real spell-known/prepared rules work. Feat-granted spellcasting from an outside list (Magic Initiate) deliberately bypasses this via its own dedicated chooser instead of the general picker. */
export function spellcasterClassNames(classes: ClassLevel[]): string[] {
  return classes
    .map((c) => CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase()))
    .filter((cls): cls is Class => !!cls && cls.spellcastingAbility !== null)
    .map((cls) => cls.name)
}

export interface Attack {
  id: string
  name: string
  damage: string
  damageType: string
  notes: string
  actionType?: ActionType
  /** Melee/Ranged — only meaningful for custom (non-compendium) weapons, set via the homebrew weapon form; compendium-linked weapons show this from the SRD data instead (see weaponFields in CombatTab). */
  weaponRange?: 'Melee' | 'Ranged'
  /** Freeform list (Finesse, Heavy, Two-Handed, etc.) for a custom weapon, comma-separated. */
  properties?: string
  /** Links back to a shared/compendium.ts weapon — set when this row was added via the compendium picker, so the detail popup can show the full SRD stat block instead of just `notes`. */
  compendiumId?: string
}

export interface EquipmentItem {
  id: string
  name: string
  quantity: number
  weight: number
  notes: string
  /** Freeform for custom items (e.g. "Adventuring Gear", "Potion") — compendium-linked items show their real category instead. */
  category?: string
  /** Freeform for custom items (e.g. "15 gp") — compendium-linked items show their real cost instead. */
  cost?: string
  /** For Armor-category items, feeds into computeArmorClassFromEquipment (shared/compendium.ts) instead of the default unarmored AC formula. For Weapon-category items, an equipped one is what actually puts it on the Combat tab's Attacks list — see weaponAttacksFromEquipment; unequip it there (not a remove button in Combat) to take it off. */
  equipped?: boolean
  /** Links back to a shared/compendium.ts mundane equipment entry — see Attack.compendiumId. */
  compendiumId?: string
  /** Links back to a shared/compendium.ts magic item entry (Potion of Healing, Ring of Protection, etc.) — a separate id space/lookup from compendiumId since magic items are a different SRD list (rarity/category, no weight/cost) from mundane equipment. */
  magicItemId?: string
}

export interface Feature {
  id: string
  name: string
  source: string
  description: string
}

/**
 * A resolved (or resolvable) Ability Score Improvement slot — one exists,
 * implicitly, at every `asi()` level in CLASS_LEVEL_FEATURES for a class the
 * character has (level 4, 8, 12, ... for most classes). FeaturesTab.tsx
 * enumerates every such slot up to the class's *current* level and looks
 * for a matching record here by (className, level); if none exists yet, it
 * renders an inline chooser instead of a resolved card. Records for a level
 * the class is no longer at (because the class level was lowered) are
 * simply skipped everywhere — never deleted — so leveling back up restores
 * the exact same choice instead of forcing a re-pick.
 */
export interface AsiSlotChoice {
  id: string
  className: string
  level: number
  kind: 'ability' | 'feat'
  /** kind 'ability': e.g. `{ str: 2 }` or `{ str: 1, dex: 1 }`. */
  abilityIncreases?: Partial<Record<Ability, number>>
  /** kind 'feat': the chosen feat's id (shared/compendium.ts's FEATS). */
  featId?: string
  /** kind 'feat', only when that feat has an `abilityScoreChoice` effect (e.g. Grappler's "Strength or Dexterity") — which ability was picked. Also doubles as the chosen spellcasting ability for a feat with a `spellChoice` effect (Magic Initiate) — picking Int/Wis/Cha for that feat's spells reuses this same field rather than a separate one. */
  chosenAbility?: Ability
  /** kind 'feat', only for a feat with a `spellChoice` effect (Magic Initiate) — the compendium spell ids chosen to fill it, in the order they were picked (cantrips first, then the leveled spell). The matching Spell rows are also written into character.spells directly (see FeaturesTab.tsx's MagicInitiateChooser) so they're fully real/castable; this list is kept alongside just so removing the feat can be traced back to what it granted. */
  chosenSpellIds?: string[]
}

/**
 * A resolved pick for a subclass feature that the SRD writes as several
 * mutually-exclusive named options rather than one entry with an embedded
 * choice (e.g. Draconic Bloodline's dragon ancestor, Circle of the Land's
 * terrain) — see groupedSubclassFeaturesForLevelUp in shared/compendium.ts,
 * which is what actually detects these groups from the flat feature data.
 * `featureName` is the shared base name (e.g. "Dragon Ancestor"); `chosenName`
 * is the full name of the specific option picked (e.g. "Dragon Ancestor:
 * Black - Acid Damage"). Same active/inactive lifecycle as AsiSlotChoice —
 * tagged with (className, level), only counted while the class is still at
 * or above that level.
 */
export interface SubclassFeatureChoice {
  id: string
  className: string
  level: number
  featureName: string
  chosenName: string
}

export interface Spell {
  id: string
  name: string
  level: number
  description: string
  actionType?: ActionType
  /** The rest of these are only meaningful for custom (non-compendium) spells, filled in via the homebrew spell form — compendium-linked spells show all of this from the SRD data instead (see spellFields in SpellsTab). */
  school?: string
  castingTime?: string
  range?: string
  components?: string
  duration?: string
  concentration?: boolean
  ritual?: boolean
  higherLevel?: string
  /** Links back to a shared/compendium.ts spell — see Attack.compendiumId. */
  compendiumId?: string
  /** True for a spell granted for free by a feat or subclass feature (Magic Initiate's cantrips/spell, a Druid Circle's circle spells) rather than chosen against the class's normal known/prepared spell cap — excluded from SpellsTab's spellCap/cantripCap counts, matching the SRD rule that these "always prepared"/bonus spells don't eat into your normal allotment. */
  free?: boolean
}

export interface Appearance {
  age: string
  height: string
  weight: string
  eyes: string
  skin: string
  hair: string
}

export interface Currency {
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
}

export interface DeathSaves {
  successes: number
  failures: number
}

/** The full sheet, stored (minus `name`, which is its own DB column) as sheet_json. */
// AC, initiative, speed, hit dice, proficiency bonus, and max HP are all
// fully derived (from ability scores/race/classes — see the calc helpers
// below) and deliberately not stored here; nothing to keep in sync when the
// inputs they're computed from change (e.g. an ability score improvement
// retroactively raising max HP, per the 5e rule).
export interface CharacterSheetData {
  race: string
  classes: ClassLevel[]
  background: string
  alignment: string
  experiencePoints: number
  appearance: Appearance

  abilityScores: AbilityScores
  savingThrowProficiencies: Ability[]
  skillProficiencies: Partial<Record<SkillName, 'proficient' | 'expertise'>>
  otherProficiencies: string

  currentHp: number
  tempHp: number
  /** The DM-awarded kind (advantage on one roll, spent to use it) — a simple on/off flag, not the Bard's Bardic Inspiration die pool. */
  inspiration: boolean
  deathSaves: DeathSaves
  /** Hit dice spent (not yet recovered), keyed by class name — one pool per class since each contributes `level` dice of its own hit die size. Spent on a Short Rest to heal, recovered (half the total, minimum one) on a Long Rest. */
  hitDiceUsed: Record<string, number>
  attacks: Attack[]

  currency: Currency
  equipment: EquipmentItem[]

  /** Freeform, unstructured extras — homebrew boons, DM-granted notes, anything outside the automatic class-table/subclass/ASI/feat system below. Everything curated (class features, subclass features, ASI/feat choices, racial traits) is derived live from class/level instead of stored here — see FeaturesTab.tsx. */
  features: Feature[]
  customClassFeatures: CustomClassFeature[]
  /** Every resolved (or still-resolvable) Ability Score Improvement slot — see AsiSlotChoice above. This is also where "which feats the character has" lives now (kind: 'feat' entries) — there's no separate feats list. */
  asiSlotChoices: AsiSlotChoice[]
  /** Every resolved pick for a subclass feature written as multiple named options — see SubclassFeatureChoice above. */
  subclassFeatureChoices: SubclassFeatureChoice[]
  /** How many charges/points of each class resource (see CLASS_RESOURCES below) have been spent — keyed by ClassResourceDef.id. The max is always computed live from class/level, never stored, so it can't drift out of sync with a level-up. */
  resourceUsed: Record<string, number>
  /** Class resources (see CLASS_RESOURCES) currently "activated" as an ongoing buff rather than a one-shot effect — e.g. Rage. Activating one also spends a use from resourceUsed, same as any other use of that resource; see BUFF_EFFECTS in shared/compendium.ts for what each one actually changes on the sheet while active. */
  activeBuffs: string[]

  /** Freeform damage-type tags (Fire, Poison, Bludgeoning, ...) — not gated to a fixed list, since homebrew/DM-granted resistances don't always match a standard type. Rage's resistance while active isn't stored here — it's shown as a separate, non-removable read-only tag (see ResistancesSection in OverviewTab.tsx) since it's conditional, not permanent. */
  damageResistances: string[]
  damageVulnerabilities: string[]
  damageImmunities: string[]

  spellcastingAbility: Ability | null
  spellSlots: Record<number, { total: number; used: number }>
  spells: Spell[]

  personalityTraits: string
  ideals: string
  bonds: string
  flaws: string
  backstory: string
  notes: string
}

export function emptyCharacterSheet(): CharacterSheetData {
  return {
    race: '',
    classes: [],
    background: '',
    alignment: '',
    experiencePoints: 0,
    appearance: { age: '', height: '', weight: '', eyes: '', skin: '', hair: '' },
    abilityScores: { ...DEFAULT_ABILITY_SCORES },
    savingThrowProficiencies: [],
    skillProficiencies: {},
    otherProficiencies: '',
    currentHp: 1,
    tempHp: 0,
    inspiration: false,
    deathSaves: { successes: 0, failures: 0 },
    hitDiceUsed: {},
    attacks: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    equipment: [],
    features: [],
    customClassFeatures: [],
    asiSlotChoices: [],
    subclassFeatureChoices: [],
    resourceUsed: {},
    activeBuffs: [],
    damageResistances: [],
    damageVulnerabilities: [],
    damageImmunities: [],
    spellcastingAbility: null,
    spellSlots: {},
    spells: [],
    personalityTraits: '',
    ideals: '',
    bonds: '',
    flaws: '',
    backstory: '',
    notes: ''
  }
}

// --- Derived-stat helpers (pure, computed at render time — nothing here is stored) ---

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/** Standard 5e "take the average" hit die value (e.g. a d8 averages to 5) — used to auto-scale max HP on level-up instead of asking the player to roll. */
export function hitDieAverage(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export function totalLevel(classes: ClassLevel[]): number {
  return classes.reduce((sum, c) => sum + c.level, 0) || 1
}

export function proficiencyBonus(classes: ClassLevel[]): number {
  return 2 + Math.floor((totalLevel(classes) - 1) / 4)
}

export function skillBonus(
  skill: SkillName,
  abilityScores: AbilityScores,
  skillProficiencies: Partial<Record<SkillName, 'proficient' | 'expertise'>>,
  classes: ClassLevel[]
): number {
  const ability = SKILLS.find((s) => s.id === skill)!.ability
  const mod = abilityModifier(abilityScores[ability])
  const prof = skillProficiencies[skill]
  const pb = proficiencyBonus(classes)
  if (prof === 'expertise') return mod + pb * 2
  if (prof === 'proficient') return mod + pb
  return mod
}

export function savingThrowBonus(
  ability: Ability,
  abilityScores: AbilityScores,
  savingThrowProficiencies: Ability[],
  classes: ClassLevel[]
): number {
  const mod = abilityModifier(abilityScores[ability])
  return savingThrowProficiencies.includes(ability) ? mod + proficiencyBonus(classes) : mod
}

export function passivePerception(
  abilityScores: AbilityScores,
  skillProficiencies: Partial<Record<SkillName, 'proficient' | 'expertise'>>,
  classes: ClassLevel[]
): number {
  return 10 + skillBonus('Perception', abilityScores, skillProficiencies, classes)
}

export function spellSaveDC(
  spellcastingAbility: Ability | null,
  abilityScores: AbilityScores,
  classes: ClassLevel[]
): number | null {
  if (!spellcastingAbility) return null
  return 8 + proficiencyBonus(classes) + abilityModifier(abilityScores[spellcastingAbility])
}

export function spellAttackBonus(
  spellcastingAbility: Ability | null,
  abilityScores: AbilityScores,
  classes: ClassLevel[]
): number | null {
  if (!spellcastingAbility) return null
  return proficiencyBonus(classes) + abilityModifier(abilityScores[spellcastingAbility])
}

/** Base unarmored AC (10 + Dex mod) — there's no armor/equipment-AC-bonus system yet, so this is the whole formula for now. */
export function computeArmorClass(abilityScores: AbilityScores): number {
  return 10 + abilityModifier(abilityScores.dex)
}

export function computeInitiative(abilityScores: AbilityScores): number {
  return abilityModifier(abilityScores.dex)
}

/** Looks up the character's race in RACES for its base speed; unrecognized/homebrew races fall back to the standard 30 ft. */
export function computeSpeed(raceName: string): number {
  const race = RACES.find((r) => r.name.toLowerCase() === raceName.trim().toLowerCase())
  return race?.speed ?? 30
}

/** e.g. "3d10" for a level-3 Fighter, "3d10 + 2d6" multiclassed with Rogue. Classes that don't match CLASSES (homebrew) are skipped since there's no hit die to draw from. */
export function hitDiceDisplay(classes: ClassLevel[]): string {
  const parts = classes
    .map((c) => {
      const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
      return cls ? `${c.level}d${cls.hitDie}` : null
    })
    .filter((p): p is string => p !== null)
  return parts.length ? parts.join(' + ') : '—'
}

/** Max HP, fully derived — never stored, so it's always in sync with the current build. First level of your first class gets its full hit die; every level after that (including level 1 of later multiclassed classes) gets the "take the average" value. Con modifier is added once per level, so an ability score change retroactively adjusts every level's worth at once, matching the 5e rule that an increased Con mod raises your HP maximum retroactively. */
export function computeMaxHp(classes: ClassLevel[], abilityScores: AbilityScores): number {
  const conMod = abilityModifier(abilityScores.con)
  let total = 0
  let isFirstLevel = true
  for (const c of classes) {
    const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
    if (!cls) continue
    for (let lvl = 1; lvl <= c.level; lvl++) {
      total += (isFirstLevel ? cls.hitDie : hitDieAverage(cls.hitDie)) + conMod
      isFirstLevel = false
    }
  }
  return Math.max(1, total)
}

export interface HitDicePool {
  className: string
  hitDie: number
  total: number
  used: number
}

/** One pool per recognized class — `total` dice of `hitDie` size, `used` already spent (from hitDiceUsed) and not yet recovered. Homebrew classes are skipped, same as hitDiceDisplay, since there's no die size to draw from. */
export function hitDicePools(classes: ClassLevel[], hitDiceUsed: Record<string, number>): HitDicePool[] {
  return classes
    .map((c) => {
      const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
      if (!cls) return null
      return { className: c.className, hitDie: cls.hitDie, total: c.level, used: hitDiceUsed[c.className] ?? 0 }
    })
    .filter((p): p is HitDicePool => p !== null)
}

/** Prepared casters (Cleric/Druid/Wizard: ability mod + level; Paladin: ability mod + half level) prepare a limited number of spells each day. "Known" casters (Bard/Sorcerer/Warlock/Ranger) instead know a fixed set they can always cast — no daily prep limit — so this returns null for them, and for non-casters. Multiclass characters sum each prepared-type class's own limit, computed from that class's own level (not total character level), which is how the real rule works. */
const PREPARED_CASTER_FORMULA: Partial<Record<string, { ability: Ability; halveLevel: boolean }>> = {
  cleric: { ability: 'wis', halveLevel: false },
  druid: { ability: 'wis', halveLevel: false },
  wizard: { ability: 'int', halveLevel: false },
  paladin: { ability: 'cha', halveLevel: true }
}

export function preparedSpellLimit(classes: ClassLevel[], abilityScores: AbilityScores): number | null {
  let total = 0
  let isPreparedCaster = false
  for (const c of classes) {
    const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
    if (!cls) continue
    const formula = PREPARED_CASTER_FORMULA[cls.id]
    if (!formula) continue
    isPreparedCaster = true
    const levelContribution = formula.halveLevel ? Math.floor(c.level / 2) : c.level
    total += Math.max(1, abilityModifier(abilityScores[formula.ability]) + levelContribution)
  }
  return isPreparedCaster ? total : null
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
