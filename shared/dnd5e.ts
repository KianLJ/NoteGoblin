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

export type AbilityScores = Record<Ability, number>

export const DEFAULT_ABILITY_SCORES: AbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10
}

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
}

export const CLASSES: Class[] = [
  {
    id: 'barbarian',
    name: 'Barbarian',
    hitDie: 12,
    primaryAbility: 'str',
    savingThrowProficiencies: ['str', 'con'],
    skillChoice: { choose: 2, from: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'] },
    spellcastingAbility: null
  },
  {
    id: 'bard',
    name: 'Bard',
    hitDie: 8,
    primaryAbility: 'cha',
    savingThrowProficiencies: ['dex', 'cha'],
    skillChoice: { choose: 3, from: SKILLS.map((s) => s.id) },
    spellcastingAbility: 'cha'
  },
  {
    id: 'cleric',
    name: 'Cleric',
    hitDie: 8,
    primaryAbility: 'wis',
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoice: { choose: 2, from: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'] },
    spellcastingAbility: 'wis'
  },
  {
    id: 'druid',
    name: 'Druid',
    hitDie: 8,
    primaryAbility: 'wis',
    savingThrowProficiencies: ['int', 'wis'],
    skillChoice: { choose: 2, from: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'] },
    spellcastingAbility: 'wis'
  },
  {
    id: 'fighter',
    name: 'Fighter',
    hitDie: 10,
    primaryAbility: 'str',
    savingThrowProficiencies: ['str', 'con'],
    skillChoice: { choose: 2, from: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'] },
    spellcastingAbility: null
  },
  {
    id: 'monk',
    name: 'Monk',
    hitDie: 8,
    primaryAbility: 'dex',
    savingThrowProficiencies: ['str', 'dex'],
    skillChoice: { choose: 2, from: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'] },
    spellcastingAbility: null
  },
  {
    id: 'paladin',
    name: 'Paladin',
    hitDie: 10,
    primaryAbility: 'str',
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoice: { choose: 2, from: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'] },
    spellcastingAbility: 'cha'
  },
  {
    id: 'ranger',
    name: 'Ranger',
    hitDie: 10,
    primaryAbility: 'dex',
    savingThrowProficiencies: ['str', 'dex'],
    skillChoice: { choose: 3, from: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'] },
    spellcastingAbility: 'wis'
  },
  {
    id: 'rogue',
    name: 'Rogue',
    hitDie: 8,
    primaryAbility: 'dex',
    savingThrowProficiencies: ['dex', 'int'],
    skillChoice: { choose: 4, from: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'] },
    spellcastingAbility: null
  },
  {
    id: 'sorcerer',
    name: 'Sorcerer',
    hitDie: 6,
    primaryAbility: 'cha',
    savingThrowProficiencies: ['con', 'cha'],
    skillChoice: { choose: 2, from: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'] },
    spellcastingAbility: 'cha'
  },
  {
    id: 'warlock',
    name: 'Warlock',
    hitDie: 8,
    primaryAbility: 'cha',
    savingThrowProficiencies: ['wis', 'cha'],
    skillChoice: { choose: 2, from: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'] },
    spellcastingAbility: 'cha'
  },
  {
    id: 'wizard',
    name: 'Wizard',
    hitDie: 6,
    primaryAbility: 'int',
    savingThrowProficiencies: ['int', 'wis'],
    skillChoice: { choose: 2, from: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'] },
    spellcastingAbility: 'int'
  }
]

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
    { level: 2, name: 'Wild Shape', description: 'Transform into a beast you’ve seen, twice per short rest.' },
    { level: 2, name: 'Druid Circle', description: 'Choose a druid subclass.' },
    { level: 4, name: 'Wild Shape Improvement', description: 'Wild Shape into new beast forms; also an Ability Score Improvement.' },
    { level: 6, name: 'Circle Feature', description: 'Gain a feature from your Druid Circle.' },
    { level: 8, name: 'Wild Shape Improvement', description: 'Wild Shape into new beast forms; also an Ability Score Improvement.' },
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
    { level: 4, name: 'Slow Fall', description: 'Reduce falling damage with a reaction; also an Ability Score Improvement.' },
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
    { level: 8, name: 'Land’s Stride', description: 'Move through nonmagical difficult terrain without cost; also an Ability Score Improvement.' },
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
    { level: 1, name: 'Sneak Attack', description: 'Extra damage once per turn when you have advantage or a nearby ally.' },
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

export type ActionType = 'action' | 'bonus' | 'reaction'

export interface Attack {
  id: string
  name: string
  /** Which ability governs the attack roll (proficiency bonus + this ability's modifier — computed, never hand-typed; see shared/compendium.ts's suggestedAttackAbility/weaponAttackBonus). Defaults to 'str' when unset. */
  attackAbility?: 'str' | 'dex'
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
  /** Only meaningful for Armor-category items — an equipped armor/shield feeds into computeArmorClassFromEquipment (shared/compendium.ts) instead of the default unarmored AC formula. */
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
  subrace: string
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
  deathSaves: DeathSaves
  /** Hit dice spent (not yet recovered), keyed by class name — one pool per class since each contributes `level` dice of its own hit die size. Spent on a Short Rest to heal, recovered (half the total, minimum one) on a Long Rest. */
  hitDiceUsed: Record<string, number>
  attacks: Attack[]

  currency: Currency
  equipment: EquipmentItem[]

  features: Feature[]
  customClassFeatures: CustomClassFeature[]

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
    subrace: '',
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
    deathSaves: { successes: 0, failures: 0 },
    hitDiceUsed: {},
    attacks: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    equipment: [],
    features: [],
    customClassFeatures: [],
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
