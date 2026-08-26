/**
 * Procedural, race-flavored NPC name generator (see NpcPanel.tsx's "Random"
 * button). Deliberately not a flat name list — a handful of small syllable
 * pools per race gets recombined into thousands of distinct-sounding names
 * instead of cycling through the same few dozen entries. Keyed on `race`
 * matching RACES[].name from shared/dnd5e.ts; anything else falls back to
 * the Human profile rather than erroring.
 */

interface Syllables {
  onsets: string[]
  vowels: string[]
  /** Empty string included in the pool (by the caller) makes some syllables end open — a name that's all closed syllables (onset-vowel-coda) reads as clipped/mechanical. */
  codas: string[]
}

interface SurnameProfile {
  /** 'compound' joins one prefix + one suffix directly (Iron+forge) — for races whose surnames read as two mashed-together words. 'chain' builds the surname the same syllable-by-syllable way as a first name, just from its own pool (Ama+kiir) — for races whose surnames are closer to a single flowing word. */
  mode: 'compound' | 'chain'
  prefixes: string[]
  suffixes: string[]
}

interface RaceNameProfile {
  first: Syllables
  firstSyllableCount: [min: number, max: number]
  surname: SurnameProfile
}

const HUMAN: RaceNameProfile = {
  first: {
    onsets: ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w'],
    vowels: ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'io', 'ae'],
    codas: ['', '', 'n', 'r', 'l', 'd', 's', 'th', 'nd', 'rt']
  },
  firstSyllableCount: [2, 3],
  surname: {
    mode: 'compound',
    prefixes: ['Ash', 'Black', 'Iron', 'Storm', 'Wood', 'Fair', 'Night', 'Raven', 'Stone', 'Thorn', 'Grey', 'Silver'],
    suffixes: ['ford', 'wood', 'ridge', 'hollow', 'vale', 'crest', 'mere', 'wick', 'haven', 'fell', 'gate', 'moor']
  }
}

const ELF: RaceNameProfile = {
  first: {
    onsets: ['', '', 'l', 'r', 's', 'th', 'v', 'f', 'c', 'qu', 'n', 'm'],
    vowels: ['a', 'ae', 'ie', 'ia', 'ai', 'ea', 'y', 'e', 'i', 'o'],
    codas: ['', '', 'l', 'n', 'r', 'th', 's']
  },
  firstSyllableCount: [2, 3],
  surname: {
    mode: 'chain',
    prefixes: ['Ama', 'Gal', 'Hol', 'Lia', 'Mel', 'Sian', 'Xilo', 'Il', 'Nai', 'Sel', 'Star', 'Ther'],
    suffixes: ['kiir', 'anodel', 'imion', 'don', 'iamne', 'nodel', 'oscient', 'phukiir', 'lo', 'duun', 'ym', 'iel']
  }
}

const DWARF: RaceNameProfile = {
  first: {
    onsets: ['b', 'd', 'f', 'g', 'gr', 'h', 'k', 'kr', 'n', 'r', 'th', 'v', 'br', 'st'],
    vowels: ['a', 'o', 'u', 'i', 'a', 'o'],
    codas: ['n', 'r', 'k', 'rd', 'rg', 'nd', 'gr', 'th', 'll']
  },
  firstSyllableCount: [2, 2],
  surname: {
    mode: 'compound',
    prefixes: ['Iron', 'Stone', 'Battle', 'Fire', 'Gold', 'Brawn', 'Dank', 'Gor', 'Holder', 'Lut', 'Un', 'Rum'],
    suffixes: ['forge', 'hammer', 'fist', 'brew', 'anvil', 'kil', 'unn', 'hek', 'gehr', 'gart', 'derk', 'heim']
  }
}

const HALFLING: RaceNameProfile = {
  first: {
    onsets: ['b', 'c', 'd', 'f', 'g', 'l', 'm', 'p', 'r', 's', 't', 'w'],
    vowels: ['a', 'e', 'i', 'o', 'u', 'ie', 'ee'],
    codas: ['', '', 'n', 'l', 'd', 'y', 'ck']
  },
  firstSyllableCount: [2, 2],
  surname: {
    mode: 'compound',
    prefixes: ['Apple', 'Brush', 'Good', 'Green', 'High', 'Tea', 'Thorn', 'Under', 'Copper', 'Hill', 'Sand', 'Toss'],
    suffixes: ['brook', 'gather', 'barrel', 'bottle', 'hill', 'leaf', 'gage', 'bough', 'kettle', 'topple', 'bottom', 'cobble']
  }
}

const DRAGONBORN: RaceNameProfile = {
  first: {
    onsets: ['ar', 'ba', 'bha', 'don', 'ghe', 'ka', 'me', 'na', 'rho', 'so', 'tar', 'ua'],
    vowels: ['a', 'i', 'o', 'e'],
    codas: ['n', 'r', 'sh', 'z', 'th', 'k', 'x']
  },
  firstSyllableCount: [2, 2],
  surname: {
    mode: 'chain',
    prefixes: ['Cleth', 'Daar', 'Delmi', 'Kepesh', 'Nemmo', 'Turnu', 'Fenken', 'Linxa', 'Mya', 'Verthi'],
    suffixes: ['tinthiallor', 'dendrian', 'rev', 'kmolik', 'nis', 'roth', 'kabradon', 'kasendalor', 'stan', 'sathurgiesh']
  }
}

const GNOME: RaceNameProfile = {
  first: {
    onsets: ['b', 'br', 'd', 'duv', 'f', 'g', 'l', 'n', 'or', 'sh', 'w', 'z'],
    vowels: ['i', 'o', 'e', 'a', 'u'],
    codas: ['', '', 'n', 'k', 'ry', 'nn', 'll']
  },
  firstSyllableCount: [2, 3],
  surname: {
    mode: 'chain',
    prefixes: ['Ber', 'Dae', 'Fol', 'Nack', 'Raul', 'Schep', 'Fnip', 'Nin', 'Tur', 'Wig'],
    suffixes: ['en', 'rgel', 'kor', 'le', 'nor', 'pen', 'per', 'gel', 'en', 'genbottom']
  }
}

const HALF_ELF: RaceNameProfile = {
  first: HUMAN.first,
  firstSyllableCount: [2, 3],
  surname: ELF.surname
}

const HALF_ORC: RaceNameProfile = {
  first: {
    onsets: ['d', 'f', 'g', 'gr', 'h', 'k', 'kr', 'm', 'n', 'r', 'sh', 'th'],
    vowels: ['a', 'o', 'u', 'i'],
    codas: ['', 'k', 'g', 'sh', 'z', 'rr', 'ng']
  },
  firstSyllableCount: [1, 2],
  surname: {
    mode: 'compound',
    prefixes: ['Blood', 'Bone', 'Grim', 'Iron', 'Skull', 'Stone', 'Black', 'Death', 'Fang', 'Rattle'],
    suffixes: ['fist', 'crusher', 'tusk', 'hide', 'splitter', 'jaw', 'scar', 'grip', 'rend', 'tusk']
  }
}

const TIEFLING: RaceNameProfile = {
  first: {
    onsets: ['ak', 'bar', 'dam', 'ek', 'kal', 'leu', 'mor', 'nem', 'ori', 'rie', 'ska', 'ze'],
    vowels: ['a', 'e', 'i', 'o'],
    codas: ['n', 's', 'th', 'r', 'x', 'z']
  },
  firstSyllableCount: [2, 2],
  surname: {
    mode: 'compound',
    prefixes: ['Ashen', 'Cinder', 'Dire', 'Ember', 'Night', 'Shadow', 'Black', 'Dusk', 'Hell', 'Soul'],
    suffixes: ['wing', 'fell', 'flame', 'fall', 'shade', 'born', 'flame', 'walker', 'warren', 'scar']
  }
}

const NAME_PROFILES: Record<string, RaceNameProfile> = {
  Human: HUMAN,
  Elf: ELF,
  Dwarf: DWARF,
  Halfling: HALFLING,
  Dragonborn: DRAGONBORN,
  Gnome: GNOME,
  'Half-Elf': HALF_ELF,
  'Half-Orc': HALF_ORC,
  Tiefling: TIEFLING
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function buildSyllable(s: Syllables): string {
  return pick(s.onsets) + pick(s.vowels) + pick(s.codas)
}

function buildFirstName(profile: RaceNameProfile): string {
  const count = randomInt(...profile.firstSyllableCount)
  let name = ''
  for (let i = 0; i < count; i++) name += buildSyllable(profile.first)
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function buildSurname(profile: RaceNameProfile): string {
  const { prefixes, suffixes } = profile.surname
  const raw = pick(prefixes) + pick(suffixes)
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/**
 * Last few first/surnames handed out per race, tracked separately, so
 * mashing "Random" a handful of times in a row doesn't keep resurfacing the
 * same one. Surnames need their own buffer — the first-name syllable space
 * is huge (onset × vowel × coda, twice over), but a surname is only ever one
 * prefix × one suffix, maybe 100-150 combos — checking only the full "First
 * Last" string for repeats let the *same surname* slip through paired with
 * a different first name every time, which is exactly what stood out.
 * Cleared implicitly as each buffer rolls over — not meant to prevent every
 * long-run repeat, just the immediately-noticeable ones.
 */
const RECENT_FIRST_BY_RACE = new Map<string, string[]>()
const RECENT_SURNAME_BY_RACE = new Map<string, string[]>()
const RECENT_FIRST_HISTORY_SIZE = 8
const RECENT_SURNAME_HISTORY_SIZE = 5

function pickAvoidingRecent(build: () => string, recent: string[]): string {
  let value = build()
  // Bounded retries, not a guarantee — with a pool this size (roughly 100-150
  // surname combos for most races) a repeat within the recent window is
  // avoidable most of the time, but a couple of races (Dragonborn, Half-Orc)
  // have a smaller pool, so this can't always succeed.
  for (let attempt = 0; attempt < 10 && recent.includes(value); attempt++) value = build()
  return value
}

/** Falls back to the Human profile for any race not in NAME_PROFILES (a custom/homebrew race name, or none picked yet). */
export function generateNpcName(race: string): string {
  const profile = NAME_PROFILES[race] ?? HUMAN

  const recentFirst = RECENT_FIRST_BY_RACE.get(race) ?? []
  const first = pickAvoidingRecent(() => buildFirstName(profile), recentFirst)
  RECENT_FIRST_BY_RACE.set(race, [...recentFirst, first].slice(-RECENT_FIRST_HISTORY_SIZE))

  const recentSurname = RECENT_SURNAME_BY_RACE.get(race) ?? []
  const surname = pickAvoidingRecent(() => buildSurname(profile), recentSurname)
  RECENT_SURNAME_BY_RACE.set(race, [...recentSurname, surname].slice(-RECENT_SURNAME_HISTORY_SIZE))

  return `${first} ${surname}`
}
