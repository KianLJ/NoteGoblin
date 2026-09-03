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
  /**
   * Always empty under SRD 5.2.1 — species grant no ability score
   * increases; that choice moved to Background instead (2 points split
   * however you like, or +1/+1/+1). Kept on the type (rather than removed)
   * so a homebrew/houseruled species can still use it, and so
   * CharacterCreationWizard's ability-bonus math doesn't need a separate
   * code path for "no bonus" vs "some bonus".
   */
  abilityBonuses: Partial<AbilityScores>
  speed: number
  traits: string[]
}

/**
 * Full text for every trait name used in RACES below — the SRD 5.2.1
 * "Species Descriptions" section (Creative Commons Attribution 4.0 — see
 * the app's About/attribution notice), condensed to fit a hover tooltip
 * rather than quoted verbatim. Several species traits involve a choice
 * (Elf's Elven Lineage, Gnome's Gnomish Lineage, Dragonborn's Draconic
 * Ancestry, Goliath's Giant Ancestry, Tiefling's Fiendish Legacy) — the
 * options are summarized here rather than modeled as an actual in-wizard
 * chooser, the same level of detail the old 2014 data had for Draconic
 * Ancestry. Shown as a hover tooltip in FeaturesTab.tsx.
 */
export const RACE_TRAIT_DESCRIPTIONS: Record<string, string> = {
  Darkvision:
    'You can see in dim light within a specified range as if it were bright light, and in darkness within that range as if it were dim light. You can\'t discern color in darkness, only shades of gray.',
  'Draconic Ancestry':
    'Choose the kind of dragon you descend from (Black, Blue, Brass, Bronze, Copper, Gold, Green, Red, Silver, or White) — this determines the damage type of your Breath Weapon and Damage Resistance traits, and affects your appearance.',
  'Breath Weapon':
    'As part of the Attack action, you can replace one attack with an exhalation in a 15-foot Cone or a 30-foot Line (5 feet wide). Each creature in the area makes a Dexterity save (DC 8 + your Constitution modifier + Proficiency Bonus), taking 1d10 damage (of your Draconic Ancestry\'s type) on a failure, half as much on a success. The damage increases to 2d10 at level 5, 3d10 at level 11, and 4d10 at level 17. Usable a number of times equal to your Proficiency Bonus, regained on a Long Rest.',
  'Damage Resistance': 'You have Resistance to the damage type determined by your Draconic Ancestry trait.',
  'Draconic Flight':
    'Starting at level 5, as a Bonus Action you can sprout spectral wings for 10 minutes, granting a Fly Speed equal to your Speed. Usable once per Long Rest.',
  'Dwarven Resilience':
    'You have Resistance to Poison damage, and Advantage on saving throws you make to avoid or end the Poisoned condition.',
  'Dwarven Toughness': 'Your Hit Point maximum increases by 1, and increases by 1 again whenever you gain a level.',
  Stonecunning:
    'As a Bonus Action, you gain Tremorsense with a range of 60 feet for 10 minutes, provided you\'re on or touching a stone surface. Usable a number of times equal to your Proficiency Bonus, regained on a Long Rest.',
  'Elven Lineage':
    'Choose a lineage — Drow, High Elf, or Wood Elf — granting a cantrip and other benefits at level 1, plus a higher-level spell you always have prepared at levels 3 and 5 (castable once per Long Rest without a slot). Intelligence, Wisdom, or Charisma is your spellcasting ability for these, chosen when you pick the lineage.',
  'Fey Ancestry': "You have Advantage on saving throws you make to avoid or end the Charmed condition, and magic can't put you to sleep.",
  'Keen Senses': 'You have proficiency in the Insight, Perception, or Survival skill (your choice).',
  Trance:
    "You don't need to sleep, and magic can't put you to sleep. You can finish a Long Rest in 4 hours if you spend those hours in a trancelike meditation, during which you retain consciousness.",
  'Gnomish Cunning': 'You have Advantage on Intelligence, Wisdom, and Charisma saving throws.',
  'Gnomish Lineage':
    'Choose Forest Gnome (Minor Illusion cantrip, plus Speak with Animals castable without a slot a number of times equal to your Proficiency Bonus) or Rock Gnome (Mending and Prestidigitation cantrips, plus the ability to spend 10 minutes crafting a Tiny clockwork device). Intelligence, Wisdom, or Charisma is your spellcasting ability for these, chosen when you pick the lineage.',
  'Giant Ancestry':
    'Choose a supernatural boon from your giant ancestry — Cloud\'s Jaunt (teleport as a Bonus Action), Fire\'s Burn, Frost\'s Chill, Hill\'s Tumble, Stone\'s Endurance, or Storm\'s Thunder — usable a number of times equal to your Proficiency Bonus, regained on a Long Rest.',
  'Large Form':
    'Starting at level 5, as a Bonus Action you can grow to Large size for 10 minutes (if there\'s room), gaining Advantage on Strength checks and +10 feet of Speed. Usable once per Long Rest.',
  'Powerful Build': 'You have Advantage on any ability check you make to end the Grappled condition, and you count as one size larger when determining your carrying capacity.',
  Brave: 'You have Advantage on saving throws you make to avoid or end the Frightened condition.',
  'Halfling Nimbleness': "You can move through the space of any creature that is a size larger than you, but you can't stop there.",
  Luck: 'When you roll a 1 on the d20 of a D20 Test, you can reroll the die, and you must use the new roll.',
  'Naturally Stealthy': 'You can take the Hide action even when you are obscured only by a creature that is at least one size larger than you.',
  Resourceful: 'You gain Heroic Inspiration whenever you finish a Long Rest.',
  Skillful: 'You gain proficiency in one skill of your choice.',
  Versatile: 'You gain an Origin feat of your choice (Skilled is recommended).',
  'Adrenaline Rush':
    'You can take the Dash action as a Bonus Action, gaining Temporary Hit Points equal to your Proficiency Bonus when you do. Usable a number of times equal to your Proficiency Bonus, regained on a Short or Long Rest.',
  'Relentless Endurance':
    "When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. You can't use this trait again until you finish a Long Rest.",
  'Fiendish Legacy':
    'Choose a legacy — Abyssal, Chthonic, or Infernal — granting Resistance to a damage type and a cantrip at level 1, plus a higher-level spell you always have prepared at levels 3 and 5 (castable once per Long Rest without a slot). Intelligence, Wisdom, or Charisma is your spellcasting ability for these, chosen when you pick the legacy.',
  'Otherworldly Presence':
    'You know the Thaumaturgy cantrip, cast with the same spellcasting ability you use for your Fiendish Legacy trait.'
}

export const RACES: Race[] = [
  {
    id: 'human',
    name: 'Human',
    abilityBonuses: {},
    speed: 30,
    traits: ['Resourceful', 'Skillful', 'Versatile']
  },
  {
    id: 'elf',
    name: 'Elf',
    abilityBonuses: {},
    speed: 30,
    traits: ['Darkvision', 'Elven Lineage', 'Fey Ancestry', 'Keen Senses', 'Trance']
  },
  {
    id: 'dwarf',
    name: 'Dwarf',
    abilityBonuses: {},
    speed: 30,
    traits: ['Darkvision', 'Dwarven Resilience', 'Dwarven Toughness', 'Stonecunning']
  },
  {
    id: 'halfling',
    name: 'Halfling',
    abilityBonuses: {},
    speed: 30,
    traits: ['Brave', 'Halfling Nimbleness', 'Luck', 'Naturally Stealthy']
  },
  {
    id: 'dragonborn',
    name: 'Dragonborn',
    abilityBonuses: {},
    speed: 30,
    traits: ['Draconic Ancestry', 'Breath Weapon', 'Damage Resistance', 'Darkvision', 'Draconic Flight']
  },
  {
    id: 'gnome',
    name: 'Gnome',
    abilityBonuses: {},
    speed: 30,
    traits: ['Darkvision', 'Gnomish Cunning', 'Gnomish Lineage']
  },
  {
    id: 'goliath',
    name: 'Goliath',
    abilityBonuses: {},
    speed: 35,
    traits: ['Giant Ancestry', 'Large Form', 'Powerful Build']
  },
  {
    id: 'orc',
    name: 'Orc',
    abilityBonuses: {},
    speed: 30,
    traits: ['Adrenaline Rush', 'Darkvision', 'Relentless Endurance']
  },
  {
    id: 'tiefling',
    name: 'Tiefling',
    abilityBonuses: {},
    speed: 30,
    traits: ['Darkvision', 'Fiendish Legacy', 'Otherworldly Presence']
  }
]

/**
 * One option within a species' lineage/legacy trait (Elf's Elven Lineage,
 * Gnome's Gnomish Lineage, Tiefling's Fiendish Legacy) — chosen once at
 * character creation, granting a cantrip known from level 1 plus (for Elf
 * and Tiefling) a spell that becomes always-prepared at character level 3
 * and another at level 5, each castable once per Long Rest without a slot.
 * Gated by total character level (see totalLevel), not any one class's
 * level, since the species itself doesn't belong to a class. Spell ids
 * reference the compendium (shared/compendium.ts's SPELLS) — resolved
 * there, not duplicated here, so the actual spell text/level/school comes
 * from one source. Gnome's two options have no level 3/5 spells at all
 * (just the cantrip(s)), matching the real SRD text for that trait.
 */
export interface LineageOption {
  name: string
  cantripId: string
  /** Rock Gnome is the one case with two fixed cantrips instead of one. */
  secondCantripId?: string
  /** Forest Gnome's Speak with Animals — granted immediately at level 1, unlike level3SpellId/level5SpellId which wait for the character to actually reach that level. */
  alwaysPreparedSpellId?: string
  level3SpellId?: string
  level5SpellId?: string
  /** Short SRD-derived summary for a hover tooltip on the option itself (see CharacterCreationWizard.tsx's lineage picker) — condensed, not verbatim rules text. */
  description: string
}

/**
 * Keyed by species id — only Elf, Gnome, and Tiefling have a lineage/legacy
 * trait under SRD 5.2.1. Abyssal Tiefling's real level 3 spell (Ray of
 * Sickness) isn't in the bundled spell compendium, so that slot is omitted
 * here rather than granting nothing when reached — a small, flagged gap
 * rather than a silent wrong grant.
 */
export const RACE_LINEAGES: Record<string, LineageOption[]> = {
  elf: [
    {
      name: 'Drow',
      cantripId: 'dancing-lights',
      level3SpellId: 'faerie-fire',
      level5SpellId: 'darkness',
      description: 'Darkvision increases to 120 ft. Know Dancing Lights; always have Faerie Fire prepared at level 3 and Darkness at level 5, each castable once per Long Rest without a slot.'
    },
    {
      name: 'High Elf',
      cantripId: 'prestidigitation',
      level3SpellId: 'detect-magic',
      level5SpellId: 'misty-step',
      description: 'Know Prestidigitation (swappable for another Wizard cantrip on a Long Rest). Always have Detect Magic prepared at level 3 and Misty Step at level 5, each castable once per Long Rest without a slot.'
    },
    {
      name: 'Wood Elf',
      cantripId: 'druidcraft',
      level3SpellId: 'longstrider',
      level5SpellId: 'pass-without-trace',
      description: 'Speed increases to 35 ft. Know Druidcraft; always have Longstrider prepared at level 3 and Pass without Trace at level 5, each castable once per Long Rest without a slot.'
    }
  ],
  gnome: [
    {
      name: 'Forest Gnome',
      cantripId: 'minor-illusion',
      alwaysPreparedSpellId: 'speak-with-animals',
      description: "Know Minor Illusion. Always have Speak with Animals prepared, castable without a slot a number of times equal to your Proficiency Bonus per Long Rest."
    },
    {
      name: 'Rock Gnome',
      cantripId: 'mending',
      secondCantripId: 'prestidigitation',
      description: 'Know Mending and Prestidigitation. Can spend 10 minutes casting Prestidigitation to create a Tiny clockwork device (up to 3 at a time).'
    }
  ],
  tiefling: [
    {
      name: 'Abyssal',
      cantripId: 'poison-spray',
      level5SpellId: 'hold-person',
      description: "Resistance to Poison damage. Know Poison Spray; always have Hold Person prepared at level 5, castable once per Long Rest without a slot. (Its real level 3 spell, Ray of Sickness, isn't in this app's spell compendium.)"
    },
    {
      name: 'Chthonic',
      cantripId: 'chill-touch',
      level3SpellId: 'false-life',
      level5SpellId: 'ray-of-enfeeblement',
      description: 'Resistance to Necrotic damage. Know Chill Touch; always have False Life prepared at level 3 and Ray of Enfeeblement at level 5, each castable once per Long Rest without a slot.'
    },
    {
      name: 'Infernal',
      cantripId: 'fire-bolt',
      level3SpellId: 'hellish-rebuke',
      level5SpellId: 'darkness',
      description: 'Resistance to Fire damage. Know Fire Bolt; always have Hellish Rebuke prepared at level 3 and Darkness at level 5, each castable once per Long Rest without a slot.'
    }
  ]
}

/** A resolved lineage/legacy pick — stored once per character (there's only ever one species). `cantripId`/`secondCantripId` are granted immediately at creation; `level3SpellId`/`level5SpellId` are granted later via a one-click prompt once totalLevel(classes) reaches that threshold (see FeaturesTab.tsx's LineageSpellGrant). */
export interface RaceLineageChoice {
  raceId: string
  lineageName: string
  spellcastingAbility: Ability
}

export function lineageOptionsForRace(raceId: string): LineageOption[] {
  return RACE_LINEAGES[raceId] ?? []
}

export interface Class {
  id: string
  name: string
  hitDie: number
  /** More than one entry means the SRD lists it as "X or Y" (Fighter) or "X and Y" (Monk/Paladin/Ranger) rather than a single ability. */
  primaryAbility: Ability[]
  savingThrowProficiencies: Ability[]
  skillChoice: { choose: number; from: SkillName[] }
  spellcastingAbility: Ability | null
  /** Every class picks its subclass at level 3 under SRD 5.2.1 — 2014's staggered levels (1 for Cleric/Sorcerer/Warlock, 2 for Druid/Wizard) are gone. This is the sole gate the level-up prompt and OverviewTab's subclass field key off (see LevelUpPopup.tsx/FeaturesTab.tsx) — CLASS_LEVEL_FEATURES' flavor-text row for "choose your subclass" still shows at its old 2014 level for a few classes pending a fuller rewrite of that table, so it can look inconsistent with the actual (correct) level-3 chooser for now. */
  subclassLevel: number
}

export const CLASSES: Class[] = [
  {
    id: 'barbarian',
    name: 'Barbarian',
    hitDie: 12,
    primaryAbility: ['str'],
    savingThrowProficiencies: ['str', 'con'],
    skillChoice: { choose: 2, from: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'] },
    spellcastingAbility: null,
    subclassLevel: 3
  },
  {
    id: 'bard',
    name: 'Bard',
    hitDie: 8,
    primaryAbility: ['cha'],
    savingThrowProficiencies: ['dex', 'cha'],
    skillChoice: { choose: 3, from: SKILLS.map((s) => s.id) },
    spellcastingAbility: 'cha',
    subclassLevel: 3
  },
  {
    id: 'cleric',
    name: 'Cleric',
    hitDie: 8,
    primaryAbility: ['wis'],
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoice: { choose: 2, from: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'] },
    spellcastingAbility: 'wis',
    subclassLevel: 3
  },
  {
    id: 'druid',
    name: 'Druid',
    hitDie: 8,
    primaryAbility: ['wis'],
    savingThrowProficiencies: ['int', 'wis'],
    skillChoice: { choose: 2, from: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'] },
    spellcastingAbility: 'wis',
    subclassLevel: 3
  },
  {
    id: 'fighter',
    name: 'Fighter',
    hitDie: 10,
    primaryAbility: ['str', 'dex'],
    savingThrowProficiencies: ['str', 'con'],
    skillChoice: {
      choose: 2,
      from: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Persuasion', 'Perception', 'Survival']
    },
    spellcastingAbility: null,
    subclassLevel: 3
  },
  {
    id: 'monk',
    name: 'Monk',
    hitDie: 8,
    primaryAbility: ['dex', 'wis'],
    savingThrowProficiencies: ['str', 'dex'],
    skillChoice: { choose: 2, from: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'] },
    spellcastingAbility: null,
    subclassLevel: 3
  },
  {
    id: 'paladin',
    name: 'Paladin',
    hitDie: 10,
    primaryAbility: ['str', 'cha'],
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoice: { choose: 2, from: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'] },
    spellcastingAbility: 'cha',
    subclassLevel: 3
  },
  {
    id: 'ranger',
    name: 'Ranger',
    hitDie: 10,
    primaryAbility: ['dex', 'wis'],
    savingThrowProficiencies: ['str', 'dex'],
    skillChoice: { choose: 3, from: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'] },
    spellcastingAbility: 'wis',
    subclassLevel: 3
  },
  {
    id: 'rogue',
    name: 'Rogue',
    hitDie: 8,
    primaryAbility: ['dex'],
    savingThrowProficiencies: ['dex', 'int'],
    skillChoice: {
      choose: 4,
      from: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Persuasion', 'Sleight of Hand', 'Stealth']
    },
    spellcastingAbility: null,
    subclassLevel: 3
  },
  {
    id: 'sorcerer',
    name: 'Sorcerer',
    hitDie: 6,
    primaryAbility: ['cha'],
    savingThrowProficiencies: ['con', 'cha'],
    skillChoice: { choose: 2, from: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'] },
    spellcastingAbility: 'cha',
    subclassLevel: 3
  },
  {
    id: 'warlock',
    name: 'Warlock',
    hitDie: 8,
    primaryAbility: ['cha'],
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoice: { choose: 2, from: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'] },
    spellcastingAbility: 'cha',
    subclassLevel: 3
  },
  {
    id: 'wizard',
    name: 'Wizard',
    hitDie: 6,
    primaryAbility: ['int'],
    savingThrowProficiencies: ['int', 'wis'],
    skillChoice: { choose: 2, from: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Nature', 'Religion'] },
    spellcastingAbility: 'int',
    subclassLevel: 3
  }
]

/**
 * Under 2014 rules each class named its subclass category ("Primal Path",
 * "Divine Domain", etc.) and CLASS_LEVEL_FEATURES had a matching named row
 * FeaturesTab.tsx needed to exclude from the plain curated-feature list.
 * SRD 5.2.1 dropped the per-class naming — every class just calls it
 * "Subclass" — and CLASS_LEVEL_FEATURES no longer has a subclass-choice row
 * at all (the interactive picker is gated purely on Class.subclassLevel).
 * Kept as an empty map (rather than removed) so FeaturesTab.tsx's existing
 * `SUBCLASS_CHOICE_FEATURE_NAME[cls.id] ?? 'Subclass'` lookups keep working
 * unchanged, always falling through to the generic label now.
 */
export const SUBCLASS_CHOICE_FEATURE_NAME: Record<string, string> = {}

/**
 * SRD 5.2.1 dropped the 2014-style unique background feature (Shelter of
 * the Faithful, Criminal Contact, etc.) — a background instead grants three
 * named ability scores (increase one by 2 and another by 1, or all three by
 * 1 — see CharacterCreationWizard.tsx's background-bonus step), a specific
 * Origin feat (looked up by id from compendium.ts's FEATS, not stored here
 * to avoid a circular import back into this lower-level module), two skill
 * proficiencies, and one tool proficiency.
 */
export interface Background {
  id: string
  name: string
  abilityScores: Ability[]
  featId: string
  skillProficiencies: SkillName[]
  toolProficiency: string
}

/**
 * Only the 4 backgrounds SRD 5.2.1 actually includes (Creative Commons
 * Attribution 4.0 — see the app's About/attribution notice) — 2014's Folk
 * Hero, Noble, Charlatan, and Hermit aren't part of this document and were
 * dropped rather than left as stale 2014 data or guessed at.
 */
export const BACKGROUNDS: Background[] = [
  {
    id: 'acolyte',
    name: 'Acolyte',
    abilityScores: ['int', 'wis', 'cha'],
    featId: 'magic-initiate',
    skillProficiencies: ['Insight', 'Religion'],
    toolProficiency: "Calligrapher's Supplies"
  },
  {
    id: 'criminal',
    name: 'Criminal',
    abilityScores: ['dex', 'con', 'int'],
    featId: 'alert',
    skillProficiencies: ['Sleight of Hand', 'Stealth'],
    toolProficiency: "Thieves' Tools"
  },
  {
    id: 'sage',
    name: 'Sage',
    abilityScores: ['con', 'int', 'wis'],
    featId: 'magic-initiate',
    skillProficiencies: ['Arcana', 'History'],
    toolProficiency: "Calligrapher's Supplies"
  },
  {
    id: 'soldier',
    name: 'Soldier',
    abilityScores: ['str', 'dex', 'con'],
    featId: 'savage-attacker',
    skillProficiencies: ['Athletics', 'Intimidation'],
    toolProficiency: 'One kind of Gaming Set'
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

const EPIC_BOON: ClassLevelFeature = {
  level: 19,
  name: 'Epic Boon',
  description: 'Take an Epic Boon feat (see "Feats"), or another feat of your choice for which you qualify.'
}

/** Every class gains an Epic Boon feat at 19th level under SRD 5.2.1 — a new capstone-adjacent feature category 2014 didn't have (2014 gave most classes a second ASI at 19th instead; see the asi() calls this replaces throughout CLASS_LEVEL_FEATURES below). */
function epicBoon(): ClassLevelFeature {
  return { ...EPIC_BOON }
}

/**
 * Curated headline progression by class id, levels 1-20 — rewritten for
 * SRD 5.2.1 (Creative Commons Attribution 4.0, see the app's
 * About/attribution notice). Not exhaustive rules text — enough to tell you
 * what you got, and to drive the level-up prompt. Every class now picks its
 * subclass at level 3 (see Class.subclassLevel's doc comment) — there's no
 * "choose your subclass" row here at all, since FeaturesTab.tsx's
 * interactive subclass picker is gated on that field directly, not on a
 * named row in this table. A few named rows below (Metamagic, Eldritch
 * Invocations, Paladin's Smite, Spell Mastery, Signature Spells, Magical
 * Secrets) are load-bearing: FeaturesTab.tsx matches on these exact names
 * to swap in a dedicated interactive chooser in place of the plain
 * description — renaming them requires updating that matching logic too.
 */
export const CLASS_LEVEL_FEATURES: Record<string, ClassLevelFeature[]> = {
  barbarian: [
    { level: 1, name: 'Rage', description: 'Bonus Action to gain resistance to bludgeoning/piercing/slashing and a damage bonus on Strength attacks, for as long as you keep fighting.' },
    { level: 1, name: 'Unarmored Defense', description: 'AC = 10 + Dex mod + Con mod while not wearing armor; a shield is still fine.' },
    { level: 1, name: 'Weapon Mastery', description: 'Use the mastery property of two kinds of Simple or Martial Melee weapons; swap one after a Long Rest.' },
    { level: 2, name: 'Danger Sense', description: 'Advantage on Dexterity saving throws against effects you can see.' },
    { level: 2, name: 'Reckless Attack', description: 'Attack with advantage at the cost of attacks against you also having advantage until your next turn.' },
    { level: 3, name: 'Primal Knowledge', description: 'Gain proficiency in one skill from the barbarian skill list, or expend a Rage use for temporary expertise in a skill using Strength or Constitution.' },
    asi(4),
    { level: 5, name: 'Extra Attack', description: 'Attack twice, instead of once, whenever you take the Attack action.' },
    { level: 5, name: 'Fast Movement', description: '+10 ft speed while not wearing Heavy armor.' },
    { level: 7, name: 'Feral Instinct', description: 'Advantage on Initiative rolls; act normally on a surprised first turn if you enter Rage first.' },
    { level: 7, name: 'Instinctive Pounce', description: 'Move up to half your Speed as part of entering Rage.' },
    asi(8),
    { level: 9, name: 'Brutal Strike', description: 'While Reckless Attack is active, replace one Rage-damage hit with a Brutal Strike option (Forceful Blow, Hamstring Blow, or Staggering Blow) for extra effects.' },
    { level: 11, name: 'Relentless Rage', description: 'Drop to 1 HP instead of 0 once per Rage, on a Constitution save (DC rises each time you succeed since your last rest).' },
    asi(12),
    { level: 13, name: 'Improved Brutal Strike', description: 'Your Brutal Strike options grow more powerful.' },
    { level: 15, name: 'Persistent Rage', description: 'Your Rage only ends early if you choose to end it or fall unconscious.' },
    asi(16),
    { level: 17, name: 'Improved Brutal Strike', description: 'Your Brutal Strike options grow more powerful still.' },
    { level: 18, name: 'Indomitable Might', description: 'Use your Strength score in place of a lower total on a Strength check or saving throw.' },
    epicBoon(),
    { level: 20, name: 'Primal Champion', description: 'Strength and Constitution scores increase by 4, to a maximum of 24.' }
  ],
  bard: [
    { level: 1, name: 'Bardic Inspiration', description: 'Bonus Action to give an ally a d6 (growing at higher levels) to add to one D20 Test within the next hour.' },
    { level: 1, name: 'Spellcasting', description: 'Cast bard spells using Charisma, with a Musical Instrument as your focus.' },
    { level: 2, name: 'Expertise', description: 'Double your proficiency bonus for two skill proficiencies of your choice.' },
    { level: 2, name: 'Jack of All Trades', description: 'Add half your proficiency bonus (round down) to any ability check that uses a skill you lack.' },
    asi(4),
    { level: 5, name: 'Font of Inspiration', description: 'Regain all expended Bardic Inspiration uses on a Short or Long Rest; your inspiration die improves to a d8.' },
    { level: 7, name: 'Countercharm', description: 'Bonus Action to give yourself and nearby allies advantage on saves against being Frightened or Charmed for 1 minute.' },
    asi(8),
    { level: 9, name: 'Expertise', description: 'Double your proficiency bonus for two more skill proficiencies of your choice.' },
    { level: 10, name: 'Magical Secrets', description: 'Learn two spells of your choice from any class\'s spell list; your inspiration die improves to a d10.' },
    asi(12),
    { level: 14, name: 'Subclass feature', description: 'Gain a feature from your Bard College.' },
    asi(16),
    { level: 18, name: 'Superior Inspiration', description: 'Regain one expended use of Bardic Inspiration whenever you roll Initiative with none left; your inspiration die improves to a d12.' },
    epicBoon(),
    { level: 20, name: 'Words of Creation', description: 'Cast Power Word Heal and Power Word Kill each once, without a spell slot, regaining the ability on a Long Rest.' }
  ],
  cleric: [
    { level: 1, name: 'Spellcasting', description: 'Cast cleric spells using Wisdom, with a Holy Symbol as your focus.' },
    { level: 1, name: 'Divine Order', description: 'Choose Protector (Martial weapon and Heavy armor training) or Thaumaturge (an extra cantrip and a bonus to Arcana/Religion checks).' },
    { level: 2, name: 'Channel Divinity', description: 'Twice per rest, fuel Divine Spark (ranged heal-or-harm) or Turn Undead — more uses at higher levels.' },
    asi(4),
    { level: 5, name: 'Sear Undead', description: 'Whenever you use Turn Undead, deal Radiant damage (based on your Wisdom modifier) to each Undead that fails its save.' },
    { level: 7, name: 'Blessed Strikes', description: 'Choose Divine Strike (extra necrotic/radiant damage on a weapon hit) or Potent Spellcasting (add Wisdom to cantrip damage).' },
    asi(8),
    { level: 10, name: 'Divine Intervention', description: 'Cast any cleric spell of 5th level or lower without a slot or material components, once per Long Rest.' },
    asi(12),
    { level: 14, name: 'Improved Blessed Strikes', description: 'Your Blessed Strikes option grows more powerful.' },
    asi(16),
    { level: 17, name: 'Subclass feature', description: 'Gain a feature from your Divine Domain.' },
    epicBoon(),
    { level: 20, name: 'Greater Divine Intervention', description: 'Your Divine Intervention can call on Wish, though doing so locks the feature for 2d4 Long Rests.' }
  ],
  druid: [
    { level: 1, name: 'Spellcasting', description: 'Cast druid spells using Wisdom, with a Druidic Focus.' },
    { level: 1, name: 'Druidic', description: 'You know Druidic, the secret language of druids, and always have Speak with Animals prepared.' },
    { level: 1, name: 'Primal Order', description: 'Choose Magician (an extra cantrip and a bonus to Arcana/Nature checks) or Warden (Martial weapon and Medium armor training).' },
    { level: 2, name: 'Wild Shape', description: 'Bonus Action to shape-shift into a known Beast form, twice per rest — more known forms and higher CR at higher levels.' },
    { level: 2, name: 'Wild Companion', description: 'Expend a spell slot or Wild Shape use to cast Find Familiar (Fey, gone after a Long Rest) without material components.' },
    asi(4),
    { level: 5, name: 'Wild Resurgence', description: 'Once per turn, spend a spell slot for a Wild Shape use, or vice versa (the spell-slot conversion once per Long Rest).' },
    { level: 7, name: 'Elemental Fury', description: 'Choose Potent Spellcasting (add Wisdom to cantrip damage) or Primal Strike (extra elemental damage on a hit, including in Wild Shape).' },
    asi(8),
    { level: 15, name: 'Improved Elemental Fury', description: 'Your Elemental Fury option grows more powerful.' },
    asi(12),
    { level: 14, name: 'Subclass feature', description: 'Gain a feature from your Druid Circle.' },
    asi(16),
    { level: 18, name: 'Beast Spells', description: 'Cast spells while Wild Shaped, other than ones with a costly or consumed material component.' },
    epicBoon(),
    { level: 20, name: 'Archdruid', description: 'Regain a Wild Shape use on rolling Initiative with none left, convert unused Wild Shapes into a spell slot once per Long Rest, and age more slowly.' }
  ],
  fighter: [
    { level: 1, name: 'Fighting Style', description: 'Gain a Fighting Style feat; swap it for a different one whenever you gain a Fighter level.' },
    { level: 1, name: 'Second Wind', description: 'Bonus Action to regain 1d10 + Fighter level HP, twice per rest.' },
    { level: 1, name: 'Weapon Mastery', description: 'Use the mastery property of three kinds of Simple or Martial weapons; swap one after a Long Rest.' },
    { level: 2, name: 'Action Surge', description: 'Take one additional action on your turn (not the Magic action), once per rest.' },
    { level: 2, name: 'Tactical Mind', description: 'Expend a Second Wind use to add 1d10 to a failed ability check instead of healing.' },
    asi(4),
    { level: 5, name: 'Extra Attack', description: 'Attack twice, instead of once, whenever you take the Attack action.' },
    { level: 5, name: 'Tactical Shift', description: 'Move up to half your Speed without provoking Opportunity Attacks whenever you use Second Wind as a Bonus Action.' },
    asi(6),
    { level: 7, name: 'Subclass feature', description: 'Gain a feature from your Fighter subclass.' },
    asi(8),
    { level: 9, name: 'Indomitable', description: 'Reroll a failed saving throw (adding your Fighter level), once per Long Rest — more uses at higher levels.' },
    { level: 9, name: 'Tactical Master', description: 'Replace a weapon\'s mastery property with Push, Sap, or Slow for one attack.' },
    { level: 10, name: 'Subclass feature', description: 'Gain a feature from your Fighter subclass.' },
    { level: 11, name: 'Two Extra Attacks', description: 'Attack three times, instead of once, whenever you take the Attack action.' },
    asi(12),
    { level: 13, name: 'Studied Attacks', description: 'Advantage on your next attack roll against a creature you missed with your last attack.' },
    asi(14),
    { level: 15, name: 'Subclass feature', description: 'Gain a feature from your Fighter subclass.' },
    asi(16),
    { level: 17, name: 'Action Surge (two uses)', description: 'Use Action Surge twice per rest (but only once on a single turn); Indomitable improves to three uses.' },
    { level: 18, name: 'Subclass feature', description: 'Gain a feature from your Fighter subclass.' },
    epicBoon(),
    { level: 20, name: 'Three Extra Attacks', description: 'Attack four times, instead of once, whenever you take the Attack action.' }
  ],
  monk: [
    { level: 1, name: 'Martial Arts', description: 'Bonus Action unarmed strike, Dexterity for unarmed/Monk weapon attacks, and a Martial Arts die in place of normal damage.' },
    { level: 1, name: 'Unarmored Defense', description: 'AC = 10 + Dex mod + Wis mod while unarmored and shieldless.' },
    { level: 2, name: 'Monk\'s Focus', description: 'Spend Focus Points to fuel Flurry of Blows, Patient Defense, and Step of the Wind.' },
    { level: 2, name: 'Unarmored Movement', description: '+10 ft speed while unarmored and shieldless — the bonus grows at higher levels.' },
    { level: 2, name: 'Uncanny Metabolism', description: 'Regain all Focus Points and some HP when you roll Initiative, once per Long Rest.' },
    { level: 3, name: 'Deflect Attacks', description: 'Reaction to reduce physical damage from a hit, potentially redirecting some of it back at an attacker.' },
    asi(4),
    { level: 4, name: 'Slow Fall', description: 'Reaction to reduce falling damage by five times your Monk level.' },
    { level: 5, name: 'Extra Attack', description: 'Attack twice, instead of once, whenever you take the Attack action.' },
    { level: 5, name: 'Stunning Strike', description: 'Spend a Focus Point on a hit to force a Constitution save or Stun the target.' },
    { level: 6, name: 'Empowered Strikes', description: 'Your Unarmed Strikes can deal Force damage instead of their normal type.' },
    { level: 7, name: 'Evasion', description: 'Take no damage on a successful Dexterity save against a half-damage effect, half on a failure.' },
    asi(8),
    { level: 9, name: 'Acrobatic Movement', description: 'Move along vertical surfaces and across liquids without falling, while unarmored and shieldless.' },
    { level: 10, name: 'Heightened Focus', description: 'Flurry of Blows, Patient Defense, and Step of the Wind gain stronger effects when fueled with a Focus Point.' },
    { level: 10, name: 'Self-Restoration', description: 'End Charmed, Frightened, or Poisoned on yourself at the end of your turn; forgoing food/drink no longer causes Exhaustion.' },
    { level: 11, name: 'Subclass feature', description: 'Gain a feature from your Monk subclass.' },
    asi(12),
    { level: 13, name: 'Deflect Energy', description: 'Deflect Attacks now works against any damage type, not just physical.' },
    { level: 14, name: 'Disciplined Survivor', description: 'Proficiency in all saving throws; spend a Focus Point to reroll a failed one.' },
    { level: 15, name: 'Perfect Focus', description: 'Regain Focus Points up to 4 whenever you roll Initiative with 3 or fewer and don\'t use Uncanny Metabolism.' },
    asi(16),
    { level: 17, name: 'Subclass feature', description: 'Gain a feature from your Monk subclass.' },
    { level: 18, name: 'Superior Defense', description: 'Spend 3 Focus Points for Resistance to all but Force damage for 1 minute.' },
    epicBoon(),
    { level: 20, name: 'Body and Mind', description: 'Dexterity and Wisdom scores increase by 4, to a maximum of 25.' }
  ],
  paladin: [
    { level: 1, name: 'Lay on Hands', description: 'A healing pool (5 × Paladin level HP) you can distribute by touch, or spend to cure Poisoned.' },
    { level: 1, name: 'Spellcasting', description: 'Cast paladin spells using Charisma, with a Holy Symbol as your focus.' },
    { level: 1, name: 'Weapon Mastery', description: 'Use the mastery property of two kinds of weapons you\'re proficient with; swap them after a Long Rest.' },
    { level: 2, name: 'Fighting Style', description: 'Gain a Fighting Style feat, or the Blessed Warrior option (two Cleric cantrips castable as Paladin spells).' },
    { level: 2, name: 'Paladin\'s Smite', description: 'Always have Divine Smite prepared; cast it once per Long Rest without expending a spell slot.' },
    { level: 3, name: 'Channel Divinity', description: 'Twice per rest, fuel Divine Sense (detect celestials/fiends/undead) or a subclass option.' },
    asi(4),
    { level: 5, name: 'Extra Attack', description: 'Attack twice, instead of once, whenever you take the Attack action.' },
    { level: 5, name: 'Faithful Steed', description: 'Always have Find Steed prepared; cast it once per Long Rest without expending a spell slot.' },
    { level: 6, name: 'Aura of Protection', description: 'You and allies within 10 feet add your Charisma modifier to saving throws.' },
    { level: 7, name: 'Subclass feature', description: 'Gain a feature from your Paladin subclass.' },
    asi(8),
    { level: 9, name: 'Abjure Foes', description: 'Expend a Channel Divinity use to Frighten several nearby creatures with a Wisdom save.' },
    { level: 10, name: 'Aura of Courage', description: 'You and allies in your Aura of Protection are immune to the Frightened condition.' },
    { level: 11, name: 'Radiant Strikes', description: 'Your melee weapon and Unarmed Strike hits deal extra Radiant damage.' },
    asi(12),
    { level: 14, name: 'Restoring Touch', description: 'Lay on Hands can also remove Blinded, Charmed, Deafened, Frightened, Paralyzed, or Stunned.' },
    { level: 15, name: 'Subclass feature', description: 'Gain a feature from your Paladin subclass.' },
    asi(16),
    { level: 18, name: 'Aura Expansion', description: 'Your Aura of Protection\'s range increases to 30 feet.' },
    epicBoon(),
    { level: 20, name: 'Subclass feature', description: 'Gain your Paladin subclass\'s capstone feature.' }
  ],
  ranger: [
    { level: 1, name: 'Spellcasting', description: 'Cast ranger spells using Wisdom, with a Druidic Focus.' },
    { level: 1, name: 'Favored Enemy', description: 'Always have Hunter\'s Mark prepared; cast it without a spell slot a number of times per Long Rest that grows with level.' },
    { level: 1, name: 'Weapon Mastery', description: 'Use the mastery property of two kinds of weapons you\'re proficient with; swap them after a Long Rest.' },
    { level: 2, name: 'Deft Explorer', description: 'Gain Expertise in one skill proficiency, plus two languages of your choice.' },
    { level: 2, name: 'Fighting Style', description: 'Gain a Fighting Style feat, or the Druidic Warrior option (two Druid cantrips castable as Ranger spells).' },
    asi(4),
    { level: 5, name: 'Extra Attack', description: 'Attack twice, instead of once, whenever you take the Attack action.' },
    { level: 6, name: 'Roving', description: '+10 ft Speed while not wearing Heavy armor, plus a Climb Speed and Swim Speed equal to your Speed.' },
    { level: 7, name: 'Subclass feature', description: 'Gain a feature from your Ranger subclass.' },
    asi(8),
    { level: 9, name: 'Expertise', description: 'Double your proficiency bonus for two skill proficiencies of your choice.' },
    { level: 10, name: 'Tireless', description: 'Grant yourself Temporary Hit Points a few times per Long Rest, and shed a level of Exhaustion on a Short Rest.' },
    { level: 11, name: 'Subclass feature', description: 'Gain a feature from your Ranger subclass.' },
    asi(12),
    { level: 13, name: 'Relentless Hunter', description: 'Taking damage can\'t break your Concentration on Hunter\'s Mark.' },
    { level: 14, name: 'Nature\'s Veil', description: 'Bonus Action to turn Invisible until the end of your next turn, a few times per Long Rest.' },
    { level: 15, name: 'Subclass feature', description: 'Gain a feature from your Ranger subclass.' },
    asi(16),
    { level: 17, name: 'Precise Hunter', description: 'Advantage on attack rolls against the creature marked by your Hunter\'s Mark.' },
    { level: 18, name: 'Feral Senses', description: 'Gain Blindsight with a range of 30 feet.' },
    epicBoon(),
    { level: 20, name: 'Foe Slayer', description: 'Hunter\'s Mark\'s damage die becomes a d10 instead of a d6.' }
  ],
  rogue: [
    { level: 1, name: 'Expertise', description: 'Double your proficiency bonus for two skill proficiencies of your choice.' },
    {
      level: 1,
      name: 'Sneak Attack',
      description:
        'Once per turn, deal extra damage (see the Combat tab for your current total, which grows every two Rogue levels) to a creature you hit with a Finesse or Ranged weapon while you have advantage — or, without advantage, if an ally is adjacent to the target and neither of you has disadvantage.'
    },
    { level: 1, name: 'Thieves\' Cant', description: 'You know Thieves\' Cant and one other language of your choice.' },
    { level: 1, name: 'Weapon Mastery', description: 'Use the mastery property of two kinds of weapons you\'re proficient with; swap them after a Long Rest.' },
    { level: 2, name: 'Cunning Action', description: 'Bonus Action to Dash, Disengage, or Hide.' },
    { level: 3, name: 'Steady Aim', description: 'Bonus Action for advantage on your next attack this turn, if you haven\'t moved (your Speed becomes 0 afterward).' },
    asi(4),
    { level: 5, name: 'Cunning Strike', description: 'Forgo Sneak Attack dice for an extra effect (Poison, Trip, or Withdraw) when you deal Sneak Attack damage.' },
    { level: 5, name: 'Uncanny Dodge', description: 'Reaction to halve the damage of an attack that hits you.' },
    { level: 6, name: 'Expertise', description: 'Double your proficiency bonus for two more skill proficiencies of your choice.' },
    { level: 7, name: 'Evasion', description: 'Take no damage on a successful Dexterity save against a half-damage effect, half on a failure.' },
    { level: 7, name: 'Reliable Talent', description: 'Treat a d20 roll of 9 or lower as a 10 for checks using a skill or tool proficiency.' },
    asi(8),
    { level: 9, name: 'Subclass feature', description: 'Gain a feature from your Rogue subclass.' },
    asi(10),
    { level: 11, name: 'Improved Cunning Strike', description: 'Use up to two Cunning Strike effects on the same Sneak Attack, paying each die cost.' },
    asi(12),
    { level: 13, name: 'Subclass feature', description: 'Gain a feature from your Rogue subclass.' },
    { level: 14, name: 'Devious Strikes', description: 'Gain the Daze, Knock Out, and Obscure Cunning Strike options.' },
    { level: 15, name: 'Slippery Mind', description: 'Gain proficiency in Wisdom and Charisma saving throws.' },
    asi(16),
    { level: 17, name: 'Subclass feature', description: 'Gain a feature from your Rogue subclass.' },
    { level: 18, name: 'Elusive', description: 'No attack roll can have advantage against you unless you\'re Incapacitated.' },
    epicBoon(),
    { level: 20, name: 'Stroke of Luck', description: 'Turn a failed D20 Test into a 20, once per Short or Long Rest.' }
  ],
  sorcerer: [
    { level: 1, name: 'Spellcasting', description: 'Cast sorcerer spells using Charisma, with an Arcane Focus.' },
    { level: 1, name: 'Innate Sorcery', description: 'Bonus Action for advantage on your spell attack rolls and +1 to your spell save DC, for 1 minute, twice per Long Rest.' },
    { level: 2, name: 'Font of Magic', description: 'Gain Sorcery Points, convertible to and from spell slots.' },
    { level: 2, name: 'Metamagic', description: 'Learn two ways to twist your spells to suit your needs.' },
    asi(4),
    { level: 5, name: 'Sorcerous Restoration', description: 'Regain some Sorcery Points on a Short Rest, once per Long Rest.' },
    { level: 6, name: 'Subclass feature', description: 'Gain a feature from your Sorcerer subclass.' },
    { level: 7, name: 'Sorcery Incarnate', description: 'Reactivate Innate Sorcery for Sorcery Points; use two Metamagic options per spell while it\'s active.' },
    asi(8),
    { level: 10, name: 'Metamagic', description: 'Learn two additional Metamagic options.' },
    asi(12),
    { level: 14, name: 'Subclass feature', description: 'Gain a feature from your Sorcerer subclass.' },
    asi(16),
    { level: 17, name: 'Metamagic', description: 'Learn two additional Metamagic options.' },
    { level: 18, name: 'Subclass feature', description: 'Gain a feature from your Sorcerer subclass.' },
    epicBoon(),
    { level: 20, name: 'Arcane Apotheosis', description: 'Use one Metamagic option per turn for free while Innate Sorcery is active.' }
  ],
  warlock: [
    { level: 1, name: 'Eldritch Invocations', description: 'Learn eldritch secrets that grant magical benefits — more at higher levels.' },
    { level: 1, name: 'Pact Magic', description: 'Cast warlock spells using Charisma, all at the same (highest available) slot level; slots recharge on a Short or Long Rest.' },
    { level: 2, name: 'Magical Cunning', description: 'Spend 1 minute to regain some Pact Magic slots, once per Long Rest.' },
    asi(4),
    { level: 6, name: 'Subclass feature', description: 'Gain a feature from your Otherworldly Patron.' },
    asi(8),
    { level: 9, name: 'Contact Patron', description: 'Always have Contact Other Plane prepared; cast it without a slot (auto-succeeding its save) once per Long Rest.' },
    { level: 10, name: 'Subclass feature', description: 'Gain a feature from your Otherworldly Patron.' },
    { level: 11, name: 'Mystic Arcanum (6th level)', description: 'Learn a 6th-level spell you can cast once per long rest without a slot.' },
    asi(12),
    { level: 13, name: 'Mystic Arcanum (7th level)', description: 'Learn a 7th-level spell you can cast once per long rest without a slot.' },
    { level: 14, name: 'Subclass feature', description: 'Gain a feature from your Otherworldly Patron.' },
    { level: 15, name: 'Mystic Arcanum (8th level)', description: 'Learn an 8th-level spell you can cast once per long rest without a slot.' },
    asi(16),
    { level: 17, name: 'Mystic Arcanum (9th level)', description: 'Learn a 9th-level spell you can cast once per long rest without a slot.' },
    epicBoon(),
    { level: 20, name: 'Eldritch Master', description: 'Regain all expended Pact Magic slots whenever you use Magical Cunning.' }
  ],
  wizard: [
    { level: 1, name: 'Spellcasting', description: 'Cast wizard spells using Intelligence, prepared from your spellbook, with an Arcane Focus or the spellbook itself.' },
    { level: 1, name: 'Ritual Adept', description: 'Cast any Ritual-tagged spell in your spellbook as a Ritual, even if it isn\'t prepared, by reading from the book.' },
    { level: 1, name: 'Arcane Recovery', description: 'Recover spell slots (combined level up to half your Wizard level, none 6th or higher) on a Short Rest, once per Long Rest.' },
    { level: 2, name: 'Scholar', description: 'Gain Expertise in one of Arcana, History, Investigation, Medicine, Nature, or Religion.' },
    asi(4),
    { level: 5, name: 'Memorize Spell', description: 'Swap one prepared spell for another from your spellbook on a Short Rest.' },
    { level: 6, name: 'Subclass feature', description: 'Gain a feature from your Arcane Tradition.' },
    asi(8),
    { level: 10, name: 'Subclass feature', description: 'Gain a feature from your Arcane Tradition.' },
    asi(12),
    { level: 14, name: 'Subclass feature', description: 'Gain a feature from your Arcane Tradition.' },
    asi(16),
    { level: 18, name: 'Spell Mastery', description: 'Cast a chosen 1st- and 2nd-level spell at will without a slot.' },
    epicBoon(),
    { level: 20, name: 'Signature Spells', description: 'Always have two 3rd-level spells prepared, castable once each without a slot per rest.' }
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

/** Subclass-granted extra Fighting Style picks, on top of the base-class one above — the only case under SRD 5.2.1 is the Fighter's Champion subclass, which gets a second pick (Additional Fighting Style) at 7th level (2014's version of this was also a Champion feature, but at 10th). Keyed off the class's chosen subclass id (see shared/compendium.ts's CompendiumSubclass), not the class table, since this is subclass-specific rather than universal to the class. */
export function subclassFightingStyleSlotLevelsUpToLevel(classId: string, subclassId: string | undefined, level: number): number[] {
  if (classId === 'fighter' && subclassId === 'champion' && level >= 7) return [7]
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

/** Metamagic options known grows at 2nd, 10th, and 17th level under SRD 5.2.1 — 2 → 4 → 6 total (two more each time), never fewer, never a re-pick of ones already known. */
export function metamagicSlotCountAtLevel(level: number): number {
  if (level >= 17) return 6
  if (level >= 10) return 4
  if (level >= 2) return 2
  return 0
}

/** Which class level unlocked the Nth Metamagic pick (0-indexed) — the first two both unlock at 2nd level, so this is purely for display ("Metamagic — Sorcerer 2"), not a dedup key the way an ASI slot's level is. */
export function metamagicSlotUnlockLevel(pickIndex: number): number {
  return pickIndex < 2 ? 2 : pickIndex < 4 ? 10 : 17
}

export interface EldritchInvocationOption extends NamedOption {
  /** Minimum warlock level required — 1, 2, 5, 7, 9, 12, or 15 under SRD 5.2.1. */
  level: number
  /** Requires already having taken the named invocation (Pact of the Blade/Chain/Tome are themselves ordinary invocations now, not a separate Pact Boon choice — see this file's dnd5e.ts doc history) — undefined if this invocation has no such prerequisite. */
  prereqInvocation?: string
  /** Requires knowing this spell (compendium id) — every case in the SRD is eldritch-blast. */
  prereqSpell?: string
}

/**
 * SRD 5.2.1 warlock Eldritch Invocations. 2024 folded the 2014 "Pact Boon"
 * choice (Blade/Chain/Tome) directly into this list as three more
 * invocations with no level prerequisite — there's no separate Pact Boon
 * feature or chooser anymore, and several other invocations below require
 * one of those three by name via `prereqInvocation` instead of a distinct
 * pact-tracking field.
 */
export const ELDRITCH_INVOCATIONS: EldritchInvocationOption[] = [
  { name: 'Agonizing Blast', level: 2, prereqSpell: 'eldritch-blast', description: 'Choose a known damage-dealing cantrip; add your Charisma modifier to its damage rolls. Repeatable for a different eligible cantrip.' },
  { name: 'Armor of Shadows', level: 1, description: 'Cast Mage Armor on yourself without expending a spell slot.' },
  { name: 'Ascendant Step', level: 5, description: 'Cast Levitate on yourself without expending a spell slot.' },
  { name: "Devil's Sight", level: 2, description: 'See normally in Dim Light and Darkness — both magical and nonmagical — within 120 feet of yourself.' },
  { name: 'Devouring Blade', level: 12, prereqInvocation: 'Thirsting Blade', description: "Thirsting Blade's Extra Attack now confers two extra attacks instead of one." },
  { name: 'Eldritch Mind', level: 1, description: 'Advantage on Constitution saving throws to maintain Concentration.' },
  {
    name: 'Eldritch Smite',
    level: 5,
    prereqInvocation: 'Pact of the Blade',
    description:
      'Once per turn on a hit with your pact weapon, expend a Pact Magic spell slot to deal an extra 1d8 Force damage (plus another 1d8 per slot level) and potentially knock the target Prone.'
  },
  { name: 'Eldritch Spear', level: 2, prereqSpell: 'eldritch-blast', description: "Choose a known damage-dealing cantrip with a range of 10+ feet; its range increases by 30 feet per Warlock level. Repeatable for a different eligible cantrip." },
  {
    name: 'Fiendish Vigor',
    level: 2,
    description: 'Cast False Life on yourself without expending a spell slot, always getting the maximum Temporary Hit Points.'
  },
  {
    name: 'Gaze of Two Minds',
    level: 5,
    description:
      "Bonus Action to touch a willing creature and perceive through its senses until the end of your next turn, extendable each turn with another Bonus Action; you can cast spells as if in either your space or theirs while within 60 feet of each other."
  },
  { name: 'Gift of the Depths', level: 5, description: 'Breathe underwater and gain a Swim Speed equal to your Speed; also cast Water Breathing once per Long Rest without a spell slot.' },
  {
    name: 'Gift of the Protectors',
    level: 9,
    prereqInvocation: 'Pact of the Tome',
    description:
      "Your Book of Shadows gains a page that can hold a few creatures' names; a named creature reduced to 0 HP drops to 1 HP instead, once per Long Rest across all named creatures."
  },
  {
    name: 'Investment of the Chain Master',
    level: 5,
    prereqInvocation: 'Pact of the Chain',
    description: 'Your Find Familiar summon gains a Fly or Swim Speed, a Bonus Action attack, a damage-type swap, your spell save DC, and Resistance you can grant it as a Reaction.'
  },
  { name: 'Lessons of the First Ones', level: 2, description: 'Gain an Origin feat of your choice. Repeatable for a different Origin feat.' },
  {
    name: 'Lifedrinker',
    level: 9,
    prereqInvocation: 'Pact of the Blade',
    description: 'Once per turn on a hit with your pact weapon, deal extra Necrotic, Psychic, or Radiant damage and can expend a Hit Point Die to heal.'
  },
  { name: 'Mask of Many Faces', level: 2, description: 'Cast Disguise Self without expending a spell slot.' },
  { name: 'Master of Myriad Forms', level: 5, description: 'Cast Alter Self without expending a spell slot.' },
  { name: 'Misty Visions', level: 2, description: 'Cast Silent Image without expending a spell slot.' },
  { name: 'One with Shadows', level: 5, description: 'While in Dim Light or Darkness, cast Invisibility on yourself without expending a spell slot.' },
  { name: 'Otherworldly Leap', level: 2, description: 'Cast Jump on yourself without expending a spell slot.' },
  {
    name: 'Pact of the Blade',
    level: 1,
    description:
      'Bonus Action to conjure (or bond with) a melee weapon, gaining proficiency with it, using it as a Spellcasting Focus, and using Charisma for its attack/damage rolls; it can deal Necrotic, Psychic, or Radiant damage instead of its normal type.'
  },
  {
    name: 'Pact of the Chain',
    level: 1,
    description: 'Learn Find Familiar, castable as a Magic action without a spell slot, with access to several extra familiar forms; forgo an attack to let your familiar attack with its Reaction.'
  },
  {
    name: 'Pact of the Tome',
    level: 1,
    description: 'Conjure a Book of Shadows granting three cantrips and two Ritual-tagged level 1 spells from any class list, always prepared as warlock spells while the book is on your person.'
  },
  { name: 'Repelling Blast', level: 2, prereqSpell: 'eldritch-blast', description: "Choose a known damage-dealing attack-roll cantrip; on a hit against a Large or smaller creature, push it up to 10 feet away. Repeatable for a different eligible cantrip." },
  { name: 'Thirsting Blade', level: 5, prereqInvocation: 'Pact of the Blade', description: 'Attack twice with your pact weapon, instead of once, whenever you take the Attack action.' },
  { name: 'Visions of Distant Realms', level: 9, description: 'Cast Arcane Eye without expending a spell slot.' },
  { name: 'Whispers of the Grave', level: 7, description: 'Cast Speak with Dead without expending a spell slot.' },
  { name: 'Witch Sight', level: 15, description: 'Gain Truesight with a range of 30 feet.' }
]

/** Invocations known grows steadily from 2nd through 20th level under SRD 5.2.1 — a much finer-grained table than 2014's, reflecting Pact of the Blade/Chain/Tome now costing an invocation slot each instead of being a separate free choice. */
export function eldritchInvocationSlotCountAtLevel(level: number): number {
  if (level >= 18) return 10
  if (level >= 15) return 9
  if (level >= 12) return 8
  if (level >= 9) return 7
  if (level >= 7) return 6
  if (level >= 5) return 5
  if (level >= 2) return 3
  return 1
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

/** Derives a spell's action-economy bucket from its SRD casting time string ("1 bonus action", "1 reaction", "1 action", "1 minute", …) so the character sheet doesn't need the player to set it by hand — it's a fixed rules fact, not a choice. Anything that isn't cast as a bonus action or reaction (including longer casting times like "10 minutes") falls back to 'action', matching how those spells are already grouped everywhere they're compared against actions/turn economy. */
export function actionTypeFromCastingTime(castingTime: string | undefined): ActionType {
  const t = (castingTime ?? '').toLowerCase()
  if (t.includes('bonus')) return 'bonus'
  if (t.includes('reaction')) return 'reaction'
  return 'action'
}

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
  /** The chosen lineage/legacy for a species whose trait grants one (Elf's Elven Lineage, Gnome's Gnomish Lineage, Tiefling's Fiendish Legacy) — null for every other species, or before the player has picked. See RACE_LINEAGES/raceLineageOptions. */
  raceLineageChoice: RaceLineageChoice | null

  abilityScores: AbilityScores
  savingThrowProficiencies: Ability[]
  skillProficiencies: Partial<Record<SkillName, 'proficient' | 'expertise'>>
  otherProficiencies: string

  currentHp: number
  tempHp: number
  /** The DM-awarded kind (advantage on one roll, spent to use it) — a simple on/off flag, not the Bard's Bardic Inspiration die pool. */
  inspiration: boolean
  deathSaves: DeathSaves
  /** SRD exhaustion, 0 (none) to 6 (death) — each level's mechanical effects stack with the ones below it (see EXHAUSTION_EFFECTS). */
  exhaustionLevel: number
  /** A small portrait image, stored as a data URL directly in the sheet — no separate asset pipeline, so it round-trips with the rest of the sheet (export, sync, snapshots) for free. Kept small (see the wizard's downscale-on-upload) so it doesn't bloat every sheet read/write. */
  portraitDataUrl: string | null
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
    raceLineageChoice: null,
    abilityScores: { ...DEFAULT_ABILITY_SCORES },
    savingThrowProficiencies: [],
    skillProficiencies: {},
    otherProficiencies: '',
    currentHp: 1,
    tempHp: 0,
    inspiration: false,
    deathSaves: { successes: 0, failures: 0 },
    exhaustionLevel: 0,
    portraitDataUrl: null,
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

/** SRD exhaustion table — index matches CharacterSheetData.exhaustionLevel (0-6), each level's text describing only what that level adds on top of every level below it. */
export const EXHAUSTION_EFFECTS: string[] = [
  'None.',
  'Disadvantage on ability checks.',
  'Speed halved.',
  'Disadvantage on attack rolls and saving throws.',
  'Hit point maximum halved.',
  'Speed reduced to 0.',
  'Death.'
]

/** The full, cumulative rundown of everything active at a given exhaustion level — every level's own effect stacks with the ones below it (per EXHAUSTION_EFFECTS' doc comment), so level 3 is disadvantage on ability checks AND speed halved AND disadvantage on attacks/saves, not just the level-3 line alone. Shown in OverviewTab.tsx's Exhaustion hover card. */
export function exhaustionEffectsDescription(level: number): string {
  if (level <= 0) return EXHAUSTION_EFFECTS[0]
  return EXHAUSTION_EFFECTS.slice(1, level + 1)
    .map((effect, i) => `Level ${i + 1}: ${effect}`)
    .join('\n')
}

/** Exhaustion level 2 halves Speed, level 5 drops it to 0 — applied on top of whatever computeSpeed/speed bonuses already produced. Rounds down to the nearest 5 feet, matching how every other Speed value in 5e is always a multiple of 5. */
export function applyExhaustionToSpeed(speed: number, exhaustionLevel: number): number {
  if (exhaustionLevel >= 5) return 0
  if (exhaustionLevel >= 2) return Math.floor(speed / 2 / 5) * 5
  return speed
}

/** Exhaustion level 4 halves Hit Point maximum (round down) — applied on top of computeMaxHp's result. */
export function applyExhaustionToMaxHp(maxHp: number, exhaustionLevel: number): number {
  return exhaustionLevel >= 4 ? Math.floor(maxHp / 2) : maxHp
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
