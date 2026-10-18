import { describe, expect, it } from 'vitest'
import { defaultCalendarConfig, eraForYear, latestEra, type CalendarConfig } from '@shared/calendar'

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
