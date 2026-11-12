import { describe, expect, it } from 'vitest'
import { advanceTime, defaultCalendarConfig, moveTime, travelTime, eraForYear, latestEra, partOfDay, type CalendarConfig } from '@shared/calendar'

function withEras(): CalendarConfig {
  return {
    ...defaultCalendarConfig(),
    eras: [
      { id: 'b', name: 'Age of Humanity', description: '', displayFormat: '{year} AH', startYear: 1000 },
      { id: 'a', name: 'Dalereckoning', description: '', displayFormat: '{year} DR', startYear: 1 }
    ]
  }
}

describe('calendar eras', () => {
  it('finds the era that starts last, whatever order they were added in', () => {
    expect(latestEra(withEras())?.id).toBe('b')
    expect(latestEra(defaultCalendarConfig())).toBeNull()
  })

  it('puts a year in the latest era that has started by then', () => {
    const config = withEras()
    expect(eraForYear(config, 999)?.id).toBe('a')
    expect(eraForYear(config, 1492)?.id).toBe('b')
    expect(eraForYear(config, 0)).toBeNull()
  })
})

describe('advanceTime', () => {
  const day = (timeOfDay: string): CalendarConfig => ({
    ...defaultCalendarConfig(),
    weekdays: [{ name: 'One', abbreviation: 'O' }],
    months: [
      { name: 'A', length: 30 },
      { name: 'B', length: 30 }
    ],
    currentDate: { year: 5, monthIndex: 0, day: 30 },
    timeOfDay
  })

  it('moves the time on within the day', () => {
    expect(advanceTime(day('08:15'), 1 / 6)).toEqual({ currentDate: { year: 5, monthIndex: 0, day: 30 }, timeOfDay: '08:25' })
  })

  it('rolls over midnight into the next day, and the next month', () => {
    expect(advanceTime(day('22:00'), 8)).toEqual({ currentDate: { year: 5, monthIndex: 1, day: 1 }, timeOfDay: '06:00' })
  })

  it('goes back past midnight into the day before', () => {
    expect(advanceTime(day('00:30'), -1)).toEqual({ currentDate: { year: 5, monthIndex: 0, day: 29 }, timeOfDay: '23:30' })
  })

  it('counts from midnight when no time is set', () => {
    expect(advanceTime(day(''), 1).timeOfDay).toBe('01:00')
  })
})

describe('partOfDay', () => {
  it('names the time of day', () => {
    expect([2, 6.5, 9, 12, 15, 18, 20, 23].map(partOfDay)).toEqual(['Dead of night', 'Dawn', 'Morning', 'Midday', 'Afternoon', 'Dusk', 'Evening', 'Night'])
  })
})

describe('moving time on, and travelling', () => {
  const cal = (date: CalendarConfig['currentDate'], timeOfDay = '09:00'): CalendarConfig => ({
    ...defaultCalendarConfig(),
    weekdays: [{ name: 'One', abbreviation: 'O' }, { name: 'Two', abbreviation: 'T' }, { name: 'Three', abbreviation: 'Th' }],
    months: [
      { name: 'A', length: 31 },
      { name: 'B', length: 30 },
      { name: 'C', length: 31 }
    ],
    currentDate: date,
    timeOfDay
  })

  it('moves by days, weeks, months and years, keeping the time of day', () => {
    const c = cal({ year: 10, monthIndex: 0, day: 31 })
    expect(moveTime(c, 2, 'days')).toEqual({ currentDate: { year: 10, monthIndex: 1, day: 2 }, timeOfDay: '09:00' })
    expect(moveTime(c, 1, 'weeks').currentDate).toEqual({ year: 10, monthIndex: 1, day: 3 })
    // The 31st into a 30-day month is its last day.
    expect(moveTime(c, 1, 'months').currentDate).toEqual({ year: 10, monthIndex: 1, day: 30 })
    expect(moveTime(c, -1, 'months').currentDate).toEqual({ year: 9, monthIndex: 2, day: 31 })
    expect(moveTime(c, 2, 'years').currentDate).toEqual({ year: 12, monthIndex: 0, day: 31 })
    expect(moveTime(c, 16, 'hours')).toEqual({ currentDate: { year: 10, monthIndex: 1, day: 1 }, timeOfDay: '01:00' })
  })

  it('works out a journey: whole days on the road, then the hours of the last', () => {
    expect(travelTime(60, 3, 8)).toEqual({ days: 2, hours: 4, travelHours: 20 })
    expect(travelTime(24, 3, 8)).toEqual({ days: 1, hours: 0, travelHours: 8 })
    expect(travelTime(100, 2, 24)).toEqual({ days: 2, hours: 2, travelHours: 50 })
  })
})
