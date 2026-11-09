import { describe, expect, it } from 'vitest'
import { CALENDAR_TEMPLATES } from '../shared/calendarTemplates'
import { formatCalendarDate } from '../shared/calendar'
import { validateCalendarConfig } from '../src/server/services/campaignService'

describe('calendar templates', () => {
  for (const template of CALENDAR_TEMPLATES) {
    it(`${template.name} saves as built, with every section filled in`, () => {
      const config = template.build()
      const result = validateCalendarConfig(config)
      expect('error' in result ? result.error : null).toBeNull()
      // Nothing the template sets is dropped on the way through.
      expect('config' in result && result.config).toEqual(config)
      for (const part of ['weekdays', 'months', 'eras', 'seasons', 'locations', 'moons', 'events'] as const) expect(config[part].length).toBeGreaterThan(0)
      expect(formatCalendarDate(config, config.currentDate)).not.toMatch(/\{|undefined/)
    })
  }

  it('builds a fresh copy each time', () => {
    const a = CALENDAR_TEMPLATES[0].build()
    a.months[0].name = 'Changed'
    expect(CALENDAR_TEMPLATES[0].build().months[0].name).not.toBe('Changed')
  })
})
