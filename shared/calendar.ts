/**
 * Shared types + pure date math for a campaign's in-world calendar (one per
 * campaign, DM-defined — custom months/weekdays/eras rather than assuming a
 * real-world calendar). Everything here is pure and side-effect free so it
 * can run identically in the renderer (rendering the month grid) and, later,
 * anywhere else that needs to reason about a date without touching storage.
 */

export interface CalendarWeekday {
  name: string
  abbreviation: string
}

export interface CalendarMonth {
  name: string
  /** Days in this month in a non-leap year. */
  length: number
}

/** A recurring leap day — every `interval`th year (where `year % interval === offset`) gets one extra day appended to `monthIndex`. */
export interface CalendarLeapRule {
  monthIndex: number
  interval: number
  offset: number
}

/** A named span of years with its own display format — e.g. "1492 AC" vs a prior era's "203 SC". Eras are looked up by which one's `startYear` is the greatest that's still `<=` the date's year. */
export interface CalendarEra {
  id: string
  name: string
  description: string
  /** `{year}` is replaced with the absolute year — e.g. "{year} AC". */
  displayFormat: string
  startYear: number
}

export interface CalendarDate {
  year: number
  /** 0-based index into `months`. */
  monthIndex: number
  /** 1-based day of the month. */
  day: number
}

/** A season/location's climate profile — the range weather is generated within, not a specific day's weather itself. Temperatures are in whichever unit the calendar's `temperatureUnit` says (entered and displayed in that unit directly — nothing here converts between them); `rainChance`/`cloudiness` are 0-1 fractions; wind is mph. */
export interface CalendarClimate {
  tempMin: number
  tempMax: number
  rainChance: number
  cloudiness: number
  windMinMph: number
  windMaxMph: number
}

/** A recurring span of the year (year-agnostic — the same month/day range every year) with its own color and climate profile. Seasons don't need explicit end dates: whichever season's `startMonthIndex`/`startDay` is the latest one still at or before a given date is the active one, wrapping around the year boundary via whichever season starts latest in the year otherwise. */
export interface CalendarSeason {
  id: string
  name: string
  /** CSS color (hex) used to tint the season in the UI. */
  color: string
  startMonthIndex: number
  startDay: number
  climate: CalendarClimate
  /** Decimal hours (0-24, e.g. 6.5 = 6:30) the sun rises/sets during this season — drives isDaytime/sunHoursForDate. */
  sunriseHour: number
  sunsetHour: number
}

/** Replaces a season's climate with this location's own for one specific month — e.g. a coastal city might stay milder in winter than the region's default. Months without an override just fall back to whichever season is active. */
export interface CalendarLocationClimateOverride {
  monthIndex: number
  climate: CalendarClimate
}

export interface CalendarLocation {
  id: string
  name: string
  description: string
  monthOverrides: CalendarLocationClimateOverride[]
}

/** A DM-written freeform note for one specific date — a session recap, a reminder, "the well runs dry today," whatever's worth remembering happened (or should happen) on that day. */
export interface CalendarDayNote {
  date: CalendarDate
  text: string
}

/** A moon (or any other astronomical body whose phase matters) — its cycle is measured in whole days, deterministic (no seed involved, unlike weather): the same day always shows the same phase. */
export interface CalendarMoon {
  id: string
  name: string
  /** CSS color (hex) used for its phase icon in the UI. */
  color: string
  /** Days from new moon to new moon. */
  cycleDays: number
  /** Shifts which absolute day counts as the start of the cycle — lets two moons with the same cycleDays be out of phase with each other. */
  offset: number
}

export type MoonPhase =
  | 'New'
  | 'Waxing Crescent'
  | 'First Quarter'
  | 'Waxing Gibbous'
  | 'Full'
  | 'Waning Gibbous'
  | 'Last Quarter'
  | 'Waning Crescent'

export type EventRepeat = 'none' | 'yearly' | 'monthly' | 'weekly'

/** A DM-placed event — a festival, a deadline, an anniversary. `date` is its first/anchor occurrence; `repeat` decides which later dates it also occurs on (see eventOccursOnDate/eventsOnDate). `category` is free text, not an enum — the DM's own label ("Festival", "Deadline", whatever fits the campaign), paired with `color` for a quick visual read on the calendar grid. */
export interface CalendarEvent {
  id: string
  name: string
  description: string
  category: string
  /** CSS color (hex) for this event's dot/badge in the UI. */
  color: string
  date: CalendarDate
  repeat: EventRepeat
  /** An existing campaign note this event is tied to (a session recap, a quest writeup) — null if it isn't paired with one. Just an id reference; the note itself lives in the normal notes table/repo, this doesn't duplicate or own it. */
  linkedNoteId: string | null
}

export interface CalendarConfig {
  name: string
  description: string
  /** `{weekday}`, `{weekdayAbbr}`, `{day}`, `{month}`, `{monthAbbr}`, `{year}`, `{era}` placeholders. */
  dateFormat: string
  weekdays: CalendarWeekday[]
  months: CalendarMonth[]
  leapRules: CalendarLeapRule[]
  eras: CalendarEra[]
  currentDate: CalendarDate
  /** 24h "HH:MM", DM-updatable independently of the date. */
  timeOfDay: string
  /** Which unit every climate/weather temperature in this calendar is entered and displayed in — 'C' by default. Purely a labeling choice: nothing converts between units, a climate's tempMin/tempMax are just plain numbers in whatever this says. */
  temperatureUnit: 'C' | 'F'
  seasons: CalendarSeason[]
  locations: CalendarLocation[]
  /** Which location's climate is currently shown — null means "just use the active season's climate, no location-specific override." */
  selectedLocationId: string | null
  /** Generated once when the calendar is created and never changed — weather for any date is derived deterministically from this seed plus the date, so the same day always has the same weather without needing to roll-and-store it. */
  weatherSeed: string
  dayNotes: CalendarDayNote[]
  moons: CalendarMoon[]
  events: CalendarEvent[]
}

export interface CampaignCalendar {
  id: string
  campaignId: string
  config: CalendarConfig
  createdAt: string
  updatedAt: string
}

/** A blank starting point — the DM builds their own weekdays/months/eras from scratch rather than renaming placeholder ones (the wizard's Dates step requires at least one weekday and month before it'll let you proceed past it). */
export function defaultCalendarConfig(): CalendarConfig {
  return {
    name: '',
    description: '',
    dateFormat: '{weekday}, {day} {month} {year}',
    weekdays: [],
    months: [],
    leapRules: [],
    eras: [],
    currentDate: { year: 1, monthIndex: 0, day: 1 },
    timeOfDay: '',
    temperatureUnit: 'C',
    seasons: [],
    locations: [],
    selectedLocationId: null,
    weatherSeed: generateWeatherSeed(),
    dayNotes: [],
    moons: [],
    events: []
  }
}

/** Not cryptographic — just needs to differ calendar to calendar so two campaigns don't get identical weather patterns. */
export function generateWeatherSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Four reasonable starting points for a new season, in Celsius (the default unit) — every field stays fully editable afterward, this just saves typing in plausible numbers from scratch. Use `climateInUnit` to get these translated into °F when a calendar uses Fahrenheit instead. */
export const SEASON_CLIMATE_PRESETS: Record<'winter' | 'spring' | 'summer' | 'autumn', CalendarClimate> = {
  winter: { tempMin: -12, tempMax: 4, rainChance: 0.35, cloudiness: 0.6, windMinMph: 5, windMaxMph: 25 },
  spring: { tempMin: 4, tempMax: 18, rainChance: 0.45, cloudiness: 0.5, windMinMph: 5, windMaxMph: 20 },
  summer: { tempMin: 18, tempMax: 32, rainChance: 0.25, cloudiness: 0.3, windMinMph: 3, windMaxMph: 15 },
  autumn: { tempMin: 4, tempMax: 18, rainChance: 0.4, cloudiness: 0.5, windMinMph: 5, windMaxMph: 20 }
}

/** The presets above, translated to Fahrenheit — only used when a calendar's `temperatureUnit` is 'F'; a preset button just needs *a* plausible starting range in whichever unit the DM is working in, this is a one-off convenience conversion, not part of the weather-generation pipeline (which never converts units at all). */
export function climateInUnit(climate: CalendarClimate, unit: 'C' | 'F'): CalendarClimate {
  if (unit === 'C') return climate
  return { ...climate, tempMin: Math.round((climate.tempMin * 9) / 5 + 32), tempMax: Math.round((climate.tempMax * 9) / 5 + 32) }
}

export function isLeapYear(config: CalendarConfig, year: number, monthIndex: number): boolean {
  return config.leapRules.some((rule) => rule.monthIndex === monthIndex && mod(year, rule.interval) === rule.offset)
}

/** A negative-safe modulo — years can go negative (before an era's epoch) and JS's `%` returns negative remainders for negative operands, which would otherwise misalign leap-year checks. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

export function monthLength(config: CalendarConfig, year: number, monthIndex: number): number {
  const month = config.months[monthIndex]
  if (!month) return 0
  return month.length + (isLeapYear(config, year, monthIndex) ? 1 : 0)
}

function daysInYear(config: CalendarConfig, year: number): number {
  return config.months.reduce((sum, _m, i) => sum + monthLength(config, year, i), 0)
}

/** Days elapsed from year 1, month 0, day 1 (exclusive) up to the start of `date` — the common "day number" both weekday calculation and date arithmetic are built on. Assumes `config.months`/`weekdays` are non-empty (validated at save time). */
function dayNumber(config: CalendarConfig, date: CalendarDate): number {
  let total = 0
  if (date.year >= 1) {
    for (let y = 1; y < date.year; y++) total += daysInYear(config, y)
  } else {
    for (let y = date.year; y < 1; y++) total -= daysInYear(config, y)
  }
  for (let m = 0; m < date.monthIndex; m++) total += monthLength(config, date.year, m)
  return total + (date.day - 1)
}

export function weekdayIndexForDate(config: CalendarConfig, date: CalendarDate): number {
  if (config.weekdays.length === 0) return 0
  return mod(dayNumber(config, date), config.weekdays.length)
}

/** Public wrapper for dayNumber — a single incrementing day count from year 1/month 0/day 1, used anywhere that needs to measure the distance between two dates (moon phases, weekly-repeating events). */
export function absoluteDayNumber(config: CalendarConfig, date: CalendarDate): number {
  return dayNumber(config, date)
}

/** Normalizes an out-of-range {year, monthIndex, day} (e.g. day 32 of a 31-day month, or monthIndex -1) by rolling over into the next/previous month or year — used by addDays and by the wizard's "set current date" field so a raw day/month/year triple entered by the DM always resolves to something valid. */
export function normalizeDate(config: CalendarConfig, date: CalendarDate): CalendarDate {
  let { year, monthIndex, day } = date
  while (monthIndex < 0) {
    year -= 1
    monthIndex += config.months.length
  }
  while (monthIndex >= config.months.length) {
    year += 1
    monthIndex -= config.months.length
  }
  while (day < 1) {
    monthIndex -= 1
    if (monthIndex < 0) {
      year -= 1
      monthIndex += config.months.length
    }
    day += monthLength(config, year, monthIndex)
  }
  while (day > monthLength(config, year, monthIndex)) {
    day -= monthLength(config, year, monthIndex)
    monthIndex += 1
    if (monthIndex >= config.months.length) {
      year += 1
      monthIndex -= config.months.length
    }
  }
  return { year, monthIndex, day }
}

export function addDays(config: CalendarConfig, date: CalendarDate, delta: number): CalendarDate {
  return normalizeDate(config, { ...date, day: date.day + delta })
}

/** The era whose `startYear` is the greatest one still `<=` the date's year — null if the date predates every defined era. */
export function eraForYear(config: CalendarConfig, year: number): CalendarEra | null {
  let best: CalendarEra | null = null
  for (const era of config.eras) {
    if (era.startYear <= year && (!best || era.startYear > best.startYear)) best = era
  }
  return best
}

/** Day-of-year using each month's base (non-leap) length — season boundaries are a fixed point in the year regardless of whether this particular year happens to have a leap day, so leap-day fuzziness has no business bleeding into "which season is it." */
function dayOfYear(config: CalendarConfig, monthIndex: number, day: number): number {
  let total = 0
  for (let m = 0; m < monthIndex; m++) total += config.months[m]?.length ?? 0
  return total + day
}

/** Whichever season's start is the latest one still at or before `date` — wraps around the year boundary by falling back to the season with the latest start of all when `date` is earlier than every season's start (i.e. we're still in whatever season carried over from the end of last year). Null if no seasons are defined. */
export function activeSeasonForDate(config: CalendarConfig, date: CalendarDate): CalendarSeason | null {
  if (config.seasons.length === 0) return null
  const sorted = [...config.seasons].sort(
    (a, b) => dayOfYear(config, a.startMonthIndex, a.startDay) - dayOfYear(config, b.startMonthIndex, b.startDay)
  )
  const target = dayOfYear(config, date.monthIndex, date.day)
  let active = sorted[sorted.length - 1]
  for (const season of sorted) {
    if (dayOfYear(config, season.startMonthIndex, season.startDay) <= target) active = season
    else break
  }
  return active
}

/** The climate a given date/location should generate weather from — a location's override for that month if one's set and selected, otherwise the active season's own climate. Null if no season covers the date at all. */
export function climateForDate(config: CalendarConfig, date: CalendarDate, locationId: string | null): CalendarClimate | null {
  const location = locationId ? config.locations.find((l) => l.id === locationId) : undefined
  const override = location?.monthOverrides.find((o) => o.monthIndex === date.monthIndex)
  if (override) return override.climate
  return activeSeasonForDate(config, date)?.climate ?? null
}

export type RainLevel = 'none' | 'light' | 'moderate' | 'heavy'

export interface DailyWeather {
  /** In whichever unit the calendar's `temperatureUnit` says. */
  temperature: number
  rain: RainLevel
  /** 0-100. */
  cloudiness: number
  windMph: number
}

/** Weather-report style phrasing rather than a raw percentage or enum name — "grey, overcast" reads like something a DM would actually say out loud at the table. */
export const RAIN_LABELS: Record<RainLevel, string> = {
  none: 'Clear',
  light: 'Light drizzle',
  moderate: 'Steady rain',
  heavy: 'Heavy downpour'
}

/** Buckets a 0-100 cloudiness value into a plain-language sky description. */
export function cloudinessLabel(cloudiness: number): string {
  if (cloudiness < 20) return 'Clear skies'
  if (cloudiness < 45) return 'Partly cloudy'
  if (cloudiness < 75) return 'Mostly cloudy'
  return 'Grey, overcast'
}

/** FNV-1a — fast, deterministic, good enough distribution for seeding a PRNG (not cryptographic, doesn't need to be). */
function hashToSeed(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32 — a small, fast, deterministic PRNG. Given the same seed it always produces the same sequence, which is the whole point here: the same day always rolls the same weather. */
function mulberry32(seed: number): () => number {
  let a = seed
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic, not random-and-persisted — the same seed/date/location
 * always produces the same weather, so "what was the weather like three
 * days ago" or "what will it be like next week" are both just a function
 * call away, no need to have visited that day before or stored anything.
 * Null if the date isn't covered by any season (no seasons defined at all).
 */
export function weatherForDate(config: CalendarConfig, date: CalendarDate, locationId: string | null): DailyWeather | null {
  const climate = climateForDate(config, date, locationId)
  if (!climate) return null
  const rand = mulberry32(hashToSeed(`${config.weatherSeed}|${date.year}|${date.monthIndex}|${date.day}|${locationId ?? ''}`))

  const temperature = Math.round(climate.tempMin + rand() * (climate.tempMax - climate.tempMin))

  const rainRoll = rand()
  let rain: RainLevel = 'none'
  if (rainRoll < climate.rainChance) {
    const intensity = rand()
    rain = intensity < 0.5 ? 'light' : intensity < 0.85 ? 'moderate' : 'heavy'
  }

  const cloudDrift = (rand() - 0.5) * 0.4
  const cloudiness = Math.round(Math.min(1, Math.max(0, climate.cloudiness + cloudDrift)) * 100)

  const windMph = Math.round(climate.windMinMph + rand() * (climate.windMaxMph - climate.windMinMph))

  return { temperature, rain, cloudiness, windMph }
}

export function sameDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.monthIndex === b.monthIndex && a.day === b.day
}

/** The DM's freeform note for this exact date, or '' if none has been written yet. */
export function dayNoteFor(config: CalendarConfig, date: CalendarDate): string {
  return config.dayNotes.find((n) => sameDate(n.date, date))?.text ?? ''
}

/** Replaces (or removes, if `text` is blank) the note for one date — `dayNotes` only ever holds one entry per date. */
export function setDayNote(config: CalendarConfig, date: CalendarDate, text: string): CalendarDayNote[] {
  const withoutExisting = config.dayNotes.filter((n) => !sameDate(n.date, date))
  return text.trim().length === 0 ? withoutExisting : [...withoutExisting, { date, text }]
}

const MOON_PHASE_ORDER: MoonPhase[] = [
  'New',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent'
]

/** Deterministic — no seed, just where `date` falls in the moon's fixed-length cycle. `illumination` is 0 (new) to 100 (full), following a smooth cosine curve rather than jumping between the 8 named phases. */
export function moonPhaseForDate(config: CalendarConfig, moon: CalendarMoon, date: CalendarDate): { phase: MoonPhase; illumination: number } {
  if (moon.cycleDays <= 0) return { phase: 'New', illumination: 0 }
  const fraction = mod(absoluteDayNumber(config, date) + moon.offset, moon.cycleDays) / moon.cycleDays
  const illumination = Math.round(((1 - Math.cos(fraction * 2 * Math.PI)) / 2) * 100)
  const index = Math.round(fraction * 8) % 8
  return { phase: MOON_PHASE_ORDER[index], illumination }
}

/** The active season's sunrise/sunset for `date` — null if no season covers it. */
export function sunHoursForDate(config: CalendarConfig, date: CalendarDate): { sunrise: number; sunset: number } | null {
  const season = activeSeasonForDate(config, date)
  if (!season) return null
  return { sunrise: season.sunriseHour, sunset: season.sunsetHour }
}

/** Parses a "HH:MM" string into decimal hours — null if it doesn't match (an empty/partially-typed timeOfDay field, most commonly). */
export function parseTimeOfDay(timeOfDay: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours + minutes / 60
}

export function formatHour(hour: number): string {
  const normalized = mod(hour, 24)
  const h = Math.floor(normalized)
  const m = Math.round((normalized - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Whether `timeOfDay` falls between the active season's sunrise and sunset for `date` — null if either the date has no season or timeOfDay isn't a valid "HH:MM". */
export function isDaytime(config: CalendarConfig, date: CalendarDate, timeOfDay: string): boolean | null {
  const hours = sunHoursForDate(config, date)
  const t = parseTimeOfDay(timeOfDay)
  if (!hours || t === null) return null
  return t >= hours.sunrise && t < hours.sunset
}

/** Whether `event` occurs on `date` — 'weekly' uses the calendar's own week length (config.weekdays.length), not a hardcoded 7, so a custom-length week repeats correctly. */
export function eventOccursOnDate(config: CalendarConfig, event: CalendarEvent, date: CalendarDate): boolean {
  switch (event.repeat) {
    case 'none':
      return sameDate(event.date, date)
    case 'yearly':
      return event.date.monthIndex === date.monthIndex && event.date.day === date.day
    case 'monthly':
      return event.date.day === date.day
    case 'weekly': {
      if (config.weekdays.length === 0) return sameDate(event.date, date)
      const diff = absoluteDayNumber(config, date) - absoluteDayNumber(config, event.date)
      return mod(diff, config.weekdays.length) === 0
    }
  }
}

export function eventsOnDate(config: CalendarConfig, date: CalendarDate): CalendarEvent[] {
  return config.events.filter((e) => eventOccursOnDate(config, e, date))
}

/** Replaces (by id) or appends an event — the wizard/day-panel editor always hands back a whole event, never a partial patch, so this is a straight upsert. */
export function upsertEvent(config: CalendarConfig, event: CalendarEvent): CalendarEvent[] {
  const exists = config.events.some((e) => e.id === event.id)
  return exists ? config.events.map((e) => (e.id === event.id ? event : e)) : [...config.events, event]
}

export function removeEvent(config: CalendarConfig, eventId: string): CalendarEvent[] {
  return config.events.filter((e) => e.id !== eventId)
}

export function formatCalendarDate(config: CalendarConfig, date: CalendarDate): string {
  const month = config.months[date.monthIndex]
  const weekday = config.weekdays[weekdayIndexForDate(config, date)]
  const era = eraForYear(config, date.year)
  const eraText = era ? era.displayFormat.replace('{year}', String(date.year)) : String(date.year)
  return config.dateFormat
    .replace('{weekday}', weekday?.name ?? '')
    .replace('{weekdayAbbr}', weekday?.abbreviation ?? '')
    .replace('{day}', String(date.day))
    .replace('{month}', month?.name ?? '')
    .replace('{monthAbbr}', (month?.name ?? '').slice(0, 3))
    .replace('{year}', String(date.year))
    .replace('{era}', eraText)
}
