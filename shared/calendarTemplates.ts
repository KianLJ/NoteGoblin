import { defaultCalendarConfig, type CalendarClimate, type CalendarConfig, type CalendarEvent, type CalendarLocation, type CalendarMoon, type CalendarSeason } from './calendar'

// Ready-made calendars to start from: every section filled in, all of it editable afterwards.
// The names are this app's own (not any published setting's).

export interface CalendarTemplate {
  id: string
  name: string
  blurb: string
  build: () => CalendarConfig
}

const climate = (tempMin: number, tempMax: number, rainChance: number, cloudiness: number, windMinMph: number, windMaxMph: number): CalendarClimate => ({
  tempMin,
  tempMax,
  rainChance,
  cloudiness,
  windMinMph,
  windMaxMph
})

/** A location whose climate differs from the season's in the given months. */
function place(id: string, name: string, description: string, months: number[], c: CalendarClimate): CalendarLocation {
  return { id, name, description, monthOverrides: months.map((monthIndex) => ({ monthIndex, climate: c })) }
}

function event(id: string, name: string, monthIndex: number, day: number, repeat: CalendarEvent['repeat'], category: string, color: string, description: string, year = 1): CalendarEvent {
  return { id, name, description, category, color, date: { year, monthIndex, day }, repeat, linkedNoteId: null }
}

function season(id: string, name: string, color: string, startMonthIndex: number, startDay: number, c: CalendarClimate, sunriseHour: number, sunsetHour: number): CalendarSeason {
  return { id, name, color, startMonthIndex, startDay, climate: c, sunriseHour, sunsetHour }
}

const moon = (id: string, name: string, color: string, cycleDays: number, offset: number): CalendarMoon => ({ id, name, color, cycleDays, offset })

function classicFantasy(): CalendarConfig {
  return {
    ...defaultCalendarConfig(),
    name: 'The Reckoning of Crowns',
    description: 'The common calendar of the kingdoms: twelve months of thirty days, a seven-day week, and a leap day at the turn of every fourth year.',
    dateFormat: '{weekday}, {day} {month}, {era}',
    weekdays: [
      { name: 'Dawnday', abbreviation: 'Daw' },
      { name: 'Hearthday', abbreviation: 'Hea' },
      { name: 'Marketday', abbreviation: 'Mar' },
      { name: 'Forgeday', abbreviation: 'For' },
      { name: 'Midweek', abbreviation: 'Mid' },
      { name: 'Feastday', abbreviation: 'Fea' },
      { name: 'Restday', abbreviation: 'Res' }
    ],
    months: [
      'Hearthfrost',
      'Thawing',
      'Seedtide',
      'Blossoming',
      'Greenhigh',
      'Sunsheight',
      'Highsummer',
      'Harvestmoon',
      'Reaping',
      'Leaffall',
      'Mistmonth',
      'Longnight'
    ].map((name) => ({ name, length: 30 })),
    leapRules: [{ monthIndex: 11, interval: 4, offset: 0 }],
    eras: [
      { id: 'cf-era-myth', name: 'Age of Myth', description: 'Before the crowns: the time of giants, dragons and the first gods.', displayFormat: '{year} AM', startYear: 1 },
      { id: 'cf-era-crowns', name: 'Age of Crowns', description: 'From the founding of the first kingdom to the present day.', displayFormat: '{year} AC', startYear: 1000 }
    ],
    currentDate: { year: 1247, monthIndex: 3, day: 12 },
    timeOfDay: '09:00',
    temperatureUnit: 'C',
    seasons: [
      season('cf-winter', 'Winter', '#7fa7c9', 11, 1, climate(-10, 3, 0.35, 0.65, 5, 25), 8, 16.5),
      season('cf-spring', 'Spring', '#8fc77a', 2, 1, climate(4, 16, 0.45, 0.5, 5, 18), 6.5, 19),
      season('cf-summer', 'Summer', '#e0b04a', 5, 1, climate(16, 30, 0.2, 0.3, 3, 14), 5, 21),
      season('cf-autumn', 'Autumn', '#c9773a', 8, 1, climate(5, 17, 0.4, 0.55, 6, 22), 7, 18)
    ],
    locations: [
      place('cf-capital', 'Crownhold', 'The capital, on the river plains. Weather follows the seasons.', [], climate(0, 0, 0, 0, 0, 0)),
      place('cf-north', 'Frostmarch', 'The northern border forts: colder and windier through the dark months.', [10, 11, 0, 1], climate(-22, -6, 0.3, 0.7, 12, 40)),
      place('cf-isles', 'Saltwind Isles', 'Warm southern islands: mild winters and wet summers.', [11, 0, 1, 5, 6, 7], climate(14, 27, 0.55, 0.5, 8, 26))
    ],
    selectedLocationId: null,
    moons: [moon('cf-moon-pale', 'The Pale Lady', '#dfe6f0', 30, 0), moon('cf-moon-ember', 'Ember', '#d0603c', 47, 11)],
    events: [
      event('cf-ev-newyear', 'Feast of the New Year', 0, 1, 'yearly', 'Festival', '#e0b04a', 'Bells at dawn, a feast at dusk, and debts forgiven in every market town.'),
      event('cf-ev-founding', 'Founding Day', 2, 1, 'yearly', 'Holiday', '#7a8fd1', 'The crowning of the first king, marked with parades and the swearing of oaths.'),
      event('cf-ev-midsummer', 'Midsummer Fair', 6, 15, 'yearly', 'Festival', '#e08a3c', 'A week of tourneys, travelling players and contests of skill.'),
      event('cf-ev-harvest', 'Harvest Home', 7, 20, 'yearly', 'Festival', '#c9773a', 'The last sheaf is brought in and the fields are blessed for next year.'),
      event('cf-ev-lanterns', 'Night of Lanterns', 11, 30, 'yearly', 'Holy day', '#b38bd6', 'The longest night: lanterns are set on every sill to guide lost spirits home.'),
      event('cf-ev-market', 'Market day', 0, 3, 'weekly', 'Market', '#8fc77a', 'Traders set up in every town square.')
    ]
  }
}

function earthLike(): CalendarConfig {
  return {
    ...defaultCalendarConfig(),
    name: 'Earth calendar',
    description: 'The familiar calendar: twelve months, a seven-day week, and a leap day in February every fourth year.',
    dateFormat: '{weekday} {day} {month} {era}',
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((name) => ({ name, abbreviation: name.slice(0, 3) })),
    months: [
      ['January', 31],
      ['February', 28],
      ['March', 31],
      ['April', 30],
      ['May', 31],
      ['June', 30],
      ['July', 31],
      ['August', 31],
      ['September', 30],
      ['October', 31],
      ['November', 30],
      ['December', 31]
    ].map(([name, length]) => ({ name: name as string, length: length as number })),
    // shortcut: every fourth year only, without the 100/400-year exceptions; add them if a campaign spans centuries.
    leapRules: [{ monthIndex: 1, interval: 4, offset: 0 }],
    eras: [{ id: 'earth-ce', name: 'Common Era', description: '', displayFormat: '{year}', startYear: 1 }],
    currentDate: { year: 1350, monthIndex: 4, day: 1 },
    timeOfDay: '08:00',
    temperatureUnit: 'C',
    seasons: [
      season('earth-winter', 'Winter', '#7fa7c9', 11, 21, climate(-4, 6, 0.4, 0.65, 6, 24), 8, 16),
      season('earth-spring', 'Spring', '#8fc77a', 2, 20, climate(4, 15, 0.45, 0.55, 5, 18), 6, 18.5),
      season('earth-summer', 'Summer', '#e0b04a', 5, 21, climate(14, 26, 0.3, 0.4, 3, 13), 5, 21.5),
      season('earth-autumn', 'Autumn', '#c9773a', 8, 22, climate(6, 16, 0.45, 0.6, 6, 22), 7, 18)
    ],
    locations: [
      place('earth-coast', 'Coastal town', 'Milder winters and windier days by the sea.', [11, 0, 1], climate(2, 9, 0.5, 0.7, 10, 32)),
      place('earth-highlands', 'Highlands', 'Colder and snowier in the hills.', [10, 11, 0, 1, 2], climate(-12, 1, 0.45, 0.7, 10, 35))
    ],
    selectedLocationId: null,
    // shortcut: a 30-day lunar month (the real one is about 29.5 days), so phases drift from real ones over years.
    moons: [moon('earth-moon', 'The Moon', '#e4e7ee', 30, 6)],
    events: [
      event('earth-newyear', "New Year's Day", 0, 1, 'yearly', 'Holiday', '#e0b04a', 'The first day of the year.'),
      event('earth-equinox-spring', 'Spring equinox', 2, 20, 'yearly', 'Sky', '#8fc77a', 'Day and night of equal length.'),
      event('earth-solstice-summer', 'Midsummer', 5, 21, 'yearly', 'Sky', '#e0b04a', 'The longest day of the year.'),
      event('earth-equinox-autumn', 'Autumn equinox', 8, 22, 'yearly', 'Sky', '#c9773a', 'Day and night of equal length.'),
      event('earth-solstice-winter', 'Midwinter', 11, 21, 'yearly', 'Sky', '#7fa7c9', 'The longest night of the year.')
    ]
  }
}

function frozenFrontier(): CalendarConfig {
  return {
    ...defaultCalendarConfig(),
    name: 'The Frontier Count',
    description: 'How the hold-folk of the far north reckon time: a six-day week, ten long months, and a winter that takes half the year.',
    dateFormat: '{day} {month} ({weekday}), {era}',
    weekdays: [
      { name: 'Firstfire', abbreviation: 'Fir' },
      { name: 'Hunt', abbreviation: 'Hun' },
      { name: 'Mending', abbreviation: 'Men' },
      { name: 'Watch', abbreviation: 'Wat' },
      { name: 'Trade', abbreviation: 'Tra' },
      { name: 'Embers', abbreviation: 'Emb' }
    ],
    months: ['Icewake', 'Meltwater', 'Greening', 'Brightsun', 'Shortsummer', 'Gathering', 'Firstsnow', 'Deepfrost', 'Darkmonth', 'Wolfmoon'].map((name) => ({ name, length: 36 })),
    leapRules: [],
    eras: [{ id: 'ff-holds', name: 'Count of the Holds', description: 'Years since the first hold was raised against the ice.', displayFormat: 'Year {year} of the Holds', startYear: 1 }],
    currentDate: { year: 312, monthIndex: 2, day: 4 },
    timeOfDay: '07:00',
    temperatureUnit: 'C',
    seasons: [
      season('ff-thaw', 'Thaw', '#8fb7c9', 1, 1, climate(-6, 6, 0.45, 0.6, 8, 28), 6, 18.5),
      season('ff-summer', 'Short summer', '#d8c060', 3, 1, climate(6, 19, 0.3, 0.4, 4, 16), 3.5, 22.5),
      season('ff-turning', 'Turning', '#b07a4a', 5, 1, climate(-4, 8, 0.45, 0.65, 8, 30), 7, 17),
      season('ff-winter', 'The Long Winter', '#6f8fb8', 6, 19, climate(-34, -12, 0.3, 0.75, 12, 45), 10, 14)
    ],
    locations: [
      place('ff-hold', 'Greyhold', 'The great hold in the valley, sheltered from the worst of the wind.', [7, 8, 9], climate(-26, -8, 0.3, 0.7, 6, 25)),
      place('ff-pass', 'The Teeth', 'The high pass: the coldest place anyone lives.', [6, 7, 8, 9, 0], climate(-45, -22, 0.35, 0.8, 25, 70))
    ],
    selectedLocationId: null,
    moons: [moon('ff-moon-white', 'The White Eye', '#e8eef5', 24, 0), moon('ff-moon-blue', 'The Hunter', '#6aa0d8', 36, 9)],
    events: [
      event('ff-first-light', 'First Light', 0, 1, 'yearly', 'Holy day', '#e0b04a', 'The sun returns over the ridge after the dark weeks; every fire in the hold is relit from one flame.'),
      event('ff-moot', 'The Thawing Moot', 1, 18, 'yearly', 'Gathering', '#7a8fd1', 'Chiefs of every hold meet to settle the year’s quarrels.'),
      event('ff-hunt', 'The Great Hunt', 5, 10, 'yearly', 'Hunt', '#c9773a', 'Every able hand goes out for the last hunt before the snow.'),
      event('ff-shutting', 'The Shutting of the Gates', 6, 30, 'yearly', 'Holiday', '#6f8fb8', 'The hold gates close for winter; nobody leaves until the thaw.'),
      event('ff-trade', 'Trade day', 0, 5, 'weekly', 'Market', '#8fc77a', 'Furs, iron and salt change hands in the hold’s hall.')
    ]
  }
}

export const CALENDAR_TEMPLATES: CalendarTemplate[] = [
  { id: 'classic', name: 'Classic fantasy', blurb: '7-day weeks, 12 months of 30 days, four seasons, two moons, festivals and a weekly market day.', build: classicFantasy },
  { id: 'earth', name: 'Earth-like', blurb: 'Real months, weekdays and leap years, with solstices, equinoxes and one moon.', build: earthLike },
  { id: 'frontier', name: 'Frozen frontier', blurb: 'A harsh northern land: 6-day weeks, 10 long months, a brutal winter and two moons.', build: frozenFrontier }
]
