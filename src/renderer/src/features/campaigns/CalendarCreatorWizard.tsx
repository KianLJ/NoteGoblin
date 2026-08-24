import { useState, type ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { ConfirmButton } from '../../ui/ConfirmButton'
import {
  climateInUnit,
  defaultCalendarConfig,
  SEASON_CLIMATE_PRESETS,
  type CalendarClimate,
  type CalendarConfig,
  type CalendarEra,
  type CalendarEvent,
  type CalendarLocation,
  type CalendarMonth,
  type CalendarMoon,
  type CalendarSeason,
  type CalendarWeekday,
  type EventRepeat
} from '@shared/calendar'
import type { Note } from '@shared/ipc'

interface CalendarCreatorWizardProps {
  /** Editing an existing calendar starts the wizard pre-filled with it instead of the Gregorian-shaped default. */
  initial?: CalendarConfig
  /** For pairing an event with an existing note in the Events tab. */
  notes?: Note[]
  onSave: (config: CalendarConfig) => void
  onClose: () => void
}

type TabId = 'general' | 'dates' | 'eras' | 'seasons' | 'locations' | 'celestial' | 'events'

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'dates', label: 'Dates' },
  { id: 'eras', label: 'Eras' },
  { id: 'seasons', label: 'Seasons & Weather' },
  { id: 'locations', label: 'Locations' },
  { id: 'celestial', label: 'Celestial Bodies' },
  { id: 'events', label: 'Events' }
]

/**
 * DM-facing calendar builder — a left-hand tab list (General/Dates/Eras/
 * Seasons/Locations) the DM can freely jump between in any order, rather
 * than a linear wizard. Nothing here blocks switching tabs; the only
 * validation is at Save (a name and at least one weekday/month), same as
 * before. Assembles one CalendarConfig handed to onSave — everything it
 * produces stays editable afterward by reopening this same component with
 * `initial` set.
 */
export function CalendarCreatorWizard({ initial, notes = [], onSave, onClose }: CalendarCreatorWizardProps): JSX.Element {
  const [tab, setTab] = useState<TabId>('general')
  const [config, setConfig] = useState<CalendarConfig>(() => initial ?? defaultCalendarConfig())
  const [saveError, setSaveError] = useState<string | null>(null)

  function patch(fields: Partial<CalendarConfig>): void {
    setConfig((prev) => ({ ...prev, ...fields }))
  }

  function handleSave(): void {
    if (config.name.trim().length === 0) {
      setSaveError('Give the calendar a name (General tab).')
      setTab('general')
      return
    }
    if (config.weekdays.length === 0 || config.months.length === 0) {
      setSaveError('Define at least one weekday and one month (Dates tab).')
      setTab('dates')
      return
    }
    // The current date's monthIndex might now point past the end of a
    // shortened months list (e.g. deleting a month while editing) — clamp
    // rather than let it silently reference a month that no longer exists.
    const monthIndex = Math.min(config.currentDate.monthIndex, config.months.length - 1)
    const day = Math.min(config.currentDate.day, config.months[monthIndex]?.length ?? config.currentDate.day)
    onSave({ ...config, currentDate: { ...config.currentDate, monthIndex, day } })
  }

  return (
    <Modal onClose={onClose} width={760} dismissible={false}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22 }}>{initial ? 'Edit Calendar' : 'Create Calendar'}</h2>

        <div style={{ display: 'flex', gap: 'var(--space-3)', minHeight: 420 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 150, flexShrink: 0 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  textAlign: 'left',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 10px',
                  fontSize: 13,
                  cursor: 'pointer',
                  background: tab === t.id ? 'var(--accent-subtle)' : 'transparent',
                  color: tab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 0, maxHeight: '60vh', overflowY: 'auto' }}>
            {tab === 'general' && <GeneralStep config={config} onPatch={patch} />}
            {tab === 'dates' && <DatesStep config={config} onPatch={patch} />}
            {tab === 'eras' && <ErasStep config={config} onPatch={patch} />}
            {tab === 'seasons' && <SeasonsStep config={config} onPatch={patch} />}
            {tab === 'locations' && <LocationsStep config={config} onPatch={patch} />}
            {tab === 'celestial' && <CelestialStep config={config} onPatch={patch} />}
            {tab === 'events' && <EventsStep config={config} onPatch={patch} notes={notes} />}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {saveError && <span style={{ fontSize: 12, color: 'var(--danger, #e05555)' }}>{saveError}</span>}
            <Button variant="primary" onClick={handleSave}>
              {initial ? 'Save Changes' : 'Create Calendar'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

interface StepProps {
  config: CalendarConfig
  onPatch: (fields: Partial<CalendarConfig>) => void
}

/** A row of small column captions sitting above a list of same-shaped rows (weekdays, months, weather types, eras) — a placeholder alone disappears the moment you type into it, so once every row has real values there's nothing left saying which column is which. Widths must mirror the row below it exactly (same flex/width values) for the labels to actually line up over their fields. */
function ColumnCaptions({ columns }: { columns: { label: string; flex?: number; width?: number }[] }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
      {columns.map((col, i) => (
        <span
          key={i}
          style={{ flex: col.flex, width: col.width, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}
        >
          {col.label}
        </span>
      ))}
      <span style={{ width: 28, flexShrink: 0 }} />
    </div>
  )
}

/** Sits at the end of a list, in place of a "+ Add" button up in the section header — the next item always appears right where the user's mouse already is, instead of making them jump back up to a corner every time they add another row. */
function AddCard({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '8px',
        marginTop: 6,
        width: '100%',
        border: '1px dashed var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        background: 'transparent',
        color: 'var(--text-muted)',
        fontSize: 12,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1
      }}
    >
      + {label}
    </button>
  )
}

/** A small caption above a single field — for anything that only had a placeholder (which disappears once filled) or a hover-only title before. */
function FieldLabel({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span>
      {children}
    </label>
  )
}

function GeneralStep({ config, onPatch }: StepProps): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div>
        <label className="gb-label" htmlFor="cal-name">
          Calendar Name
        </label>
        <input
          id="cal-name"
          className="gb-input"
          autoFocus
          value={config.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="The Harptos Calendar"
        />
      </div>
      <div>
        <label className="gb-label" htmlFor="cal-description">
          Description
        </label>
        <textarea
          id="cal-description"
          className="gb-input"
          rows={3}
          value={config.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          placeholder="A brief note about how this world reckons time..."
        />
      </div>
      <div>
        <label className="gb-label" htmlFor="cal-date-format">
          Date Format
        </label>
        <input
          id="cal-date-format"
          className="gb-input"
          value={config.dateFormat}
          onChange={(e) => onPatch({ dateFormat: e.target.value })}
          placeholder="{weekday}, {day} {month} {year}"
        />
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
          Placeholders: {'{weekday} {weekdayAbbr} {day} {month} {monthAbbr} {year} {era}'}
        </p>
      </div>
      <div>
        <label className="gb-label" style={{ margin: 0 }}>
          Temperature Unit
        </label>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {(['C', 'F'] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => onPatch({ temperatureUnit: unit })}
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 14px',
                fontSize: 13,
                cursor: 'pointer',
                background: config.temperatureUnit === unit ? 'var(--accent-subtle)' : 'transparent',
                color: config.temperatureUnit === unit ? 'var(--text-primary)' : 'var(--text-secondary)'
              }}
            >
              °{unit}
            </button>
          ))}
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
          Every season and location's temperature range is entered in this unit.
        </p>
      </div>
    </div>
  )
}

function DatesStep({ config, onPatch }: StepProps): JSX.Element {
  function updateWeekday(index: number, fields: Partial<CalendarWeekday>): void {
    onPatch({ weekdays: config.weekdays.map((w, i) => (i === index ? { ...w, ...fields } : w)) })
  }
  function addWeekday(): void {
    onPatch({ weekdays: [...config.weekdays, { name: 'New Day', abbreviation: 'New' }] })
  }
  function removeWeekday(index: number): void {
    onPatch({ weekdays: config.weekdays.filter((_, i) => i !== index) })
  }

  function updateMonth(index: number, fields: Partial<CalendarMonth>): void {
    onPatch({ months: config.months.map((m, i) => (i === index ? { ...m, ...fields } : m)) })
  }
  function addMonth(): void {
    onPatch({ months: [...config.months, { name: 'New Month', length: 30 }] })
  }
  function removeMonth(index: number): void {
    onPatch({
      months: config.months.filter((_, i) => i !== index),
      leapRules: config.leapRules
        .filter((r) => r.monthIndex !== index)
        .map((r) => (r.monthIndex > index ? { ...r, monthIndex: r.monthIndex - 1 } : r))
    })
  }

  function addLeapRule(): void {
    if (config.months.length === 0) return
    onPatch({ leapRules: [...config.leapRules, { monthIndex: 0, interval: 4, offset: 0 }] })
  }
  function updateLeapRule(index: number, fields: Partial<(typeof config.leapRules)[number]>): void {
    onPatch({ leapRules: config.leapRules.map((r, i) => (i === index ? { ...r, ...fields } : r)) })
  }
  function removeLeapRule(index: number): void {
    onPatch({ leapRules: config.leapRules.filter((_, i) => i !== index) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div>
        <label className="gb-label" style={{ margin: 0 }}>
          Weekdays
        </label>
        {config.weekdays.length > 0 && <ColumnCaptions columns={[{ label: 'Name', flex: 2 }, { label: 'Abbreviation', flex: 1 }]} />}
        {config.weekdays.map((w, i) => (
          <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 6 }}>
            <input
              className="gb-input"
              style={{ flex: 2 }}
              value={w.name}
              onChange={(e) => updateWeekday(i, { name: e.target.value })}
              placeholder="Name"
            />
            <input
              className="gb-input"
              style={{ flex: 1 }}
              value={w.abbreviation}
              onChange={(e) => updateWeekday(i, { abbreviation: e.target.value })}
              placeholder="Abbr"
            />
            <Button variant="ghost" onClick={() => removeWeekday(i)}>
              ✕
            </Button>
          </div>
        ))}
        <AddCard label="Add Weekday" onClick={addWeekday} />
      </div>

      <div>
        <label className="gb-label" style={{ margin: 0 }}>
          Months
        </label>
        {config.months.length > 0 && <ColumnCaptions columns={[{ label: 'Name', flex: 2 }, { label: 'Days', flex: 1 }]} />}
        {config.months.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 6 }}>
            <input
              className="gb-input"
              style={{ flex: 2 }}
              value={m.name}
              onChange={(e) => updateMonth(i, { name: e.target.value })}
              placeholder="Name"
            />
            <input
              className="gb-input"
              type="number"
              min={1}
              style={{ flex: 1 }}
              value={m.length}
              onChange={(e) => updateMonth(i, { length: Math.max(1, Number(e.target.value) || 1) })}
              placeholder="Days"
            />
            <Button variant="ghost" onClick={() => removeMonth(i)}>
              ✕
            </Button>
          </div>
        ))}
        <AddCard label="Add Month" onClick={addMonth} />
      </div>

      <div>
        <label className="gb-label" style={{ margin: 0 }}>
          Leap Days
        </label>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
          E.g. "every 4 years, offset 0" adds a day in year 4, 8, 12... — offset shifts which years count (offset 1 would be
          years 1, 5, 9 instead).
        </p>
        {config.leapRules.length === 0 && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>None — every year is the same length.</p>
        )}
        {config.leapRules.map((rule, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Add a day to</span>
            <select
              className="gb-input"
              style={{ flex: 1 }}
              value={rule.monthIndex}
              onChange={(e) => updateLeapRule(i, { monthIndex: Number(e.target.value) })}
            >
              {config.months.map((m, mi) => (
                <option key={mi} value={mi}>
                  {m.name}
                </option>
              ))}
            </select>
            <span style={{ color: 'var(--text-muted)' }}>every</span>
            <input
              className="gb-input"
              type="number"
              min={1}
              style={{ width: 60 }}
              value={rule.interval}
              onChange={(e) => updateLeapRule(i, { interval: Math.max(1, Number(e.target.value) || 1) })}
            />
            <span style={{ color: 'var(--text-muted)' }}>years, offset</span>
            <input
              className="gb-input"
              type="number"
              min={0}
              style={{ width: 60 }}
              value={rule.offset}
              onChange={(e) => updateLeapRule(i, { offset: Math.max(0, Number(e.target.value) || 0) })}
            />
            <Button variant="ghost" onClick={() => removeLeapRule(i)}>
              ✕
            </Button>
          </div>
        ))}
        <AddCard label="Add Leap Day Rule" disabled={config.months.length === 0} onClick={addLeapRule} />
      </div>
    </div>
  )
}

const CLIMATE_PRESET_LABELS: { key: keyof typeof SEASON_CLIMATE_PRESETS; label: string }[] = [
  { key: 'winter', label: 'Winter' },
  { key: 'spring', label: 'Spring' },
  { key: 'summer', label: 'Summer' },
  { key: 'autumn', label: 'Autumn' }
]

/** Shared by a season's own climate and a location's per-month climate override — the numeric ranges weather is generated within, plus one-click presets for the four basic seasons (still fully editable afterward). `unit` is just for labeling the temp fields and translating presets — the climate object itself is unit-agnostic. */
function ClimateEditor({
  climate,
  unit,
  onChange
}: {
  climate: CalendarClimate
  unit: 'C' | 'F'
  onChange: (next: CalendarClimate) => void
}): JSX.Element {
  function patch(fields: Partial<CalendarClimate>): void {
    onChange({ ...climate, ...fields })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {CLIMATE_PRESET_LABELS.map(({ key, label }) => (
          <Button
            key={key}
            variant="ghost"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => onChange(climateInUnit(SEASON_CLIMATE_PRESETS[key], unit))}
          >
            {label}
          </Button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <ClimateField label={`Min Temp (°${unit})`} value={climate.tempMin} onChange={(v) => patch({ tempMin: v })} />
        <ClimateField label={`Max Temp (°${unit})`} value={climate.tempMax} onChange={(v) => patch({ tempMax: v })} />
        <ClimateField label="Rain Chance (%)" value={Math.round(climate.rainChance * 100)} onChange={(v) => patch({ rainChance: v / 100 })} min={0} max={100} />
        <ClimateField label="Cloudiness (%)" value={Math.round(climate.cloudiness * 100)} onChange={(v) => patch({ cloudiness: v / 100 })} min={0} max={100} />
        <ClimateField label="Min Wind (mph)" value={climate.windMinMph} onChange={(v) => patch({ windMinMph: v })} min={0} />
        <ClimateField label="Max Wind (mph)" value={climate.windMaxMph} onChange={(v) => patch({ windMaxMph: v })} min={0} />
      </div>
    </div>
  )
}

function ClimateField({
  label,
  value,
  onChange,
  min,
  max
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}): JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span>
      <input
        className="gb-input"
        type="number"
        min={min}
        max={max}
        style={{ fontSize: 12, padding: '2px 6px' }}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  )
}

function SeasonsStep({ config, onPatch }: StepProps): JSX.Element {
  function updateSeason(index: number, fields: Partial<CalendarSeason>): void {
    onPatch({ seasons: config.seasons.map((s, i) => (i === index ? { ...s, ...fields } : s)) })
  }
  function addSeason(): void {
    if (config.months.length === 0) return
    onPatch({
      seasons: [
        ...config.seasons,
        {
          id: uuid(),
          name: 'New Season',
          color: '#6b8f71',
          startMonthIndex: 0,
          startDay: 1,
          climate: climateInUnit(SEASON_CLIMATE_PRESETS.spring, config.temperatureUnit),
          sunriseHour: 6,
          sunsetHour: 18
        }
      ]
    })
  }
  function removeSeason(index: number): void {
    onPatch({ seasons: config.seasons.filter((_, i) => i !== index) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <label className="gb-label" style={{ margin: 0 }}>
        Seasons
      </label>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
        Each season starts on a month/day and runs until the next season's start — whichever one's start is latest and still
        at or before a given date is active, wrapping around the year for whatever carries over from December.
      </p>
      {config.seasons.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>None — no season or weather will be shown.</p>
      )}
      {config.seasons.map((season, i) => (
        <div
          key={season.id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 'var(--space-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)'
          }}
        >
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Color</span>
              <input
                type="color"
                title="Season color"
                value={season.color}
                onChange={(e) => updateSeason(i, { color: e.target.value })}
                style={{ width: 28, height: 22, padding: 0, border: 'none', background: 'none' }}
              />
            </label>
            <FieldLabel label="Name">
              <input
                className="gb-input"
                value={season.name}
                onChange={(e) => updateSeason(i, { name: e.target.value })}
                placeholder="Season name"
              />
            </FieldLabel>
            <FieldLabel label="Starts Month">
              <select
                className="gb-input"
                value={season.startMonthIndex}
                onChange={(e) => updateSeason(i, { startMonthIndex: Number(e.target.value) })}
              >
                {config.months.map((m, mi) => (
                  <option key={mi} value={mi}>
                    {m.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel label="Starts Day">
              <input
                className="gb-input"
                type="number"
                min={1}
                max={config.months[season.startMonthIndex]?.length ?? 31}
                style={{ width: 56 }}
                value={season.startDay}
                onChange={(e) => updateSeason(i, { startDay: Math.max(1, Number(e.target.value) || 1) })}
              />
            </FieldLabel>
            <Button variant="ghost" onClick={() => removeSeason(i)}>
              ✕
            </Button>
          </div>
          <ClimateEditor climate={season.climate} unit={config.temperatureUnit} onChange={(climate) => updateSeason(i, { climate })} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FieldLabel label="Sunrise">
              <input
                className="gb-input"
                type="time"
                style={{ fontSize: 12, padding: '2px 6px' }}
                value={hourToTimeInput(season.sunriseHour)}
                onChange={(e) => updateSeason(i, { sunriseHour: timeInputToHour(e.target.value) })}
              />
            </FieldLabel>
            <FieldLabel label="Sunset">
              <input
                className="gb-input"
                type="time"
                style={{ fontSize: 12, padding: '2px 6px' }}
                value={hourToTimeInput(season.sunsetHour)}
                onChange={(e) => updateSeason(i, { sunsetHour: timeInputToHour(e.target.value) })}
              />
            </FieldLabel>
          </div>
        </div>
      ))}
      <AddCard label="Add Season" disabled={config.months.length === 0} onClick={addSeason} />
    </div>
  )
}

/** `<input type="time">` wants/gives "HH:MM"; the season stores decimal hours (so e.g. 6.5 = 6:30) — these two just convert between the two representations. */
function hourToTimeInput(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function timeInputToHour(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return (h || 0) + (m || 0) / 60
}

function LocationsStep({ config, onPatch }: StepProps): JSX.Element {
  function updateLocation(index: number, fields: Partial<CalendarLocation>): void {
    onPatch({ locations: config.locations.map((l, i) => (i === index ? { ...l, ...fields } : l)) })
  }
  function addLocation(): void {
    onPatch({ locations: [...config.locations, { id: uuid(), name: 'New Location', description: '', monthOverrides: [] }] })
  }
  function removeLocation(index: number): void {
    const removedId = config.locations[index]?.id
    onPatch({
      locations: config.locations.filter((_, i) => i !== index),
      selectedLocationId: config.selectedLocationId === removedId ? null : config.selectedLocationId
    })
  }

  function addOverride(locIndex: number): void {
    if (config.months.length === 0) return
    // Prefill from the first defined season (or the flat default) so the DM is nudging existing numbers rather
    // than typing a whole climate from scratch for what's usually a small regional tweak.
    const baseClimate = config.seasons[0]?.climate ?? climateInUnit(SEASON_CLIMATE_PRESETS.spring, config.temperatureUnit)
    onPatch({
      locations: config.locations.map((l, i) =>
        i === locIndex ? { ...l, monthOverrides: [...l.monthOverrides, { monthIndex: 0, climate: baseClimate }] } : l
      )
    })
  }
  function updateOverride(locIndex: number, overrideIndex: number, monthIndex: number): void {
    onPatch({
      locations: config.locations.map((l, i) =>
        i === locIndex
          ? { ...l, monthOverrides: l.monthOverrides.map((o, oi) => (oi === overrideIndex ? { ...o, monthIndex } : o)) }
          : l
      )
    })
  }
  function updateOverrideClimate(locIndex: number, overrideIndex: number, climate: CalendarClimate): void {
    onPatch({
      locations: config.locations.map((l, i) =>
        i === locIndex
          ? { ...l, monthOverrides: l.monthOverrides.map((o, oi) => (oi === overrideIndex ? { ...o, climate } : o)) }
          : l
      )
    })
  }
  function removeOverride(locIndex: number, overrideIndex: number): void {
    onPatch({
      locations: config.locations.map((l, i) =>
        i === locIndex ? { ...l, monthOverrides: l.monthOverrides.filter((_, oi) => oi !== overrideIndex) } : l
      )
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <label className="gb-label" style={{ margin: 0 }}>
        Locations
      </label>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
        Optional — give a location its own climate for specific months, overriding the season's default there. A month
        with no override just uses the active season's climate as normal.
      </p>
      {config.locations.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>None — weather always follows the season only.</p>
      )}
      {config.locations.map((location, li) => (
        <div
          key={location.id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 'var(--space-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)'
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <FieldLabel label="Name">
              <input
                className="gb-input"
                value={location.name}
                onChange={(e) => updateLocation(li, { name: e.target.value })}
                placeholder="Location name"
              />
            </FieldLabel>
            <Button variant="ghost" onClick={() => removeLocation(li)}>
              ✕
            </Button>
          </div>
          <FieldLabel label="Description">
            <input
              className="gb-input"
              value={location.description}
              onChange={(e) => updateLocation(li, { description: e.target.value })}
              placeholder="Description (optional)"
            />
          </FieldLabel>

          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Month climate overrides</span>
          {location.monthOverrides.map((override, oi) => (
            <div
              key={oi}
              style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8, borderLeft: '2px solid var(--border-subtle)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FieldLabel label="Month">
                  <select
                    className="gb-input"
                    style={{ fontSize: 12, padding: '2px 6px' }}
                    value={override.monthIndex}
                    onChange={(e) => updateOverride(li, oi, Number(e.target.value))}
                  >
                    {config.months.map((m, mi) => (
                      <option key={mi} value={mi}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
                <Button variant="ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => removeOverride(li, oi)}>
                  ✕
                </Button>
              </div>
              <ClimateEditor
                climate={override.climate}
                unit={config.temperatureUnit}
                onChange={(climate) => updateOverrideClimate(li, oi, climate)}
              />
            </div>
          ))}
          <AddCard label="Add Month Override" disabled={config.months.length === 0} onClick={() => addOverride(li)} />
        </div>
      ))}
      <AddCard label="Add Location" onClick={addLocation} />
    </div>
  )
}

function ErasStep({ config, onPatch }: StepProps): JSX.Element {
  function updateEra(index: number, fields: Partial<CalendarEra>): void {
    onPatch({ eras: config.eras.map((e, i) => (i === index ? { ...e, ...fields } : e)) })
  }
  function addEra(): void {
    onPatch({
      eras: [...config.eras, { id: uuid(), name: 'New Era', description: '', displayFormat: '{year} NE', startYear: 1 }]
    })
  }
  function removeEra(index: number): void {
    onPatch({ eras: config.eras.filter((_, i) => i !== index) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <label className="gb-label" style={{ margin: 0 }}>
        Eras
      </label>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
        A date's era is whichever one's start year is the latest that's still at or before that year — use this for a setting
        with more than one historical age (e.g. "203 SC" before a cataclysm, "1 AC" after it).
      </p>
      {config.eras.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
          None — dates will just show the plain year number.
        </p>
      )}
      {config.eras.length > 0 && (
        <ColumnCaptions
          columns={[{ label: 'Name', flex: 2 }, { label: 'Display Format (use {year})', flex: 2 }, { label: 'Start Year', flex: 1 }]}
        />
      )}
      {config.eras.map((era, i) => (
        <div
          key={era.id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 'var(--space-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)'
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              className="gb-input"
              style={{ flex: 2 }}
              value={era.name}
              onChange={(e) => updateEra(i, { name: e.target.value })}
              placeholder="Era name"
            />
            <input
              className="gb-input"
              style={{ flex: 2 }}
              value={era.displayFormat}
              onChange={(e) => updateEra(i, { displayFormat: e.target.value })}
              placeholder="{year} AC"
              title="How the year displays during this era — {year} is replaced with the actual number"
            />
            <input
              className="gb-input"
              type="number"
              style={{ flex: 1 }}
              value={era.startYear}
              onChange={(e) => updateEra(i, { startYear: Number(e.target.value) || 0 })}
              placeholder="Start year"
              title="The year this era begins"
            />
            <Button variant="ghost" onClick={() => removeEra(i)}>
              ✕
            </Button>
          </div>
          <FieldLabel label="Description">
            <input
              className="gb-input"
              value={era.description}
              onChange={(e) => updateEra(i, { description: e.target.value })}
              placeholder="Description (optional)"
            />
          </FieldLabel>
        </div>
      ))}
      <AddCard label="Add Era" onClick={addEra} />
    </div>
  )
}

function CelestialStep({ config, onPatch }: StepProps): JSX.Element {
  function updateMoon(index: number, fields: Partial<CalendarMoon>): void {
    onPatch({ moons: config.moons.map((m, i) => (i === index ? { ...m, ...fields } : m)) })
  }
  function addMoon(): void {
    onPatch({ moons: [...config.moons, { id: uuid(), name: 'New Moon', color: '#c9c9d6', cycleDays: 28, offset: 0 }] })
  }
  function removeMoon(index: number): void {
    onPatch({ moons: config.moons.filter((_, i) => i !== index) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <label className="gb-label" style={{ margin: 0 }}>
        Moons
      </label>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
        Each moon cycles through its 8 phases deterministically — the same day always shows the same phase, no rolling
        involved. Two moons with different cycle lengths (or an offset) drift in and out of sync with each other.
      </p>
      {config.moons.length === 0 && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>None — no moon phases will be shown.</p>}
      {config.moons.length > 0 && (
        <ColumnCaptions
          columns={[
            { label: 'Color', width: 28 },
            { label: 'Name', flex: 2 },
            { label: 'Cycle (days)', flex: 1 },
            { label: 'Offset', flex: 1 }
          ]}
        />
      )}
      {config.moons.map((moon, i) => (
        <div key={moon.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="color"
            title="Moon color"
            value={moon.color}
            onChange={(e) => updateMoon(i, { color: e.target.value })}
            style={{ width: 28, height: 28, padding: 0, border: 'none', background: 'none', flexShrink: 0 }}
          />
          <input
            className="gb-input"
            style={{ flex: 2 }}
            value={moon.name}
            onChange={(e) => updateMoon(i, { name: e.target.value })}
            placeholder="Moon name"
          />
          <input
            className="gb-input"
            type="number"
            min={1}
            style={{ flex: 1 }}
            value={moon.cycleDays}
            title="Days from new moon to new moon"
            onChange={(e) => updateMoon(i, { cycleDays: Math.max(1, Number(e.target.value) || 1) })}
          />
          <input
            className="gb-input"
            type="number"
            style={{ flex: 1 }}
            value={moon.offset}
            title="Shifts which day starts the cycle — use this to desync two moons that share a cycle length"
            onChange={(e) => updateMoon(i, { offset: Number(e.target.value) || 0 })}
          />
          <Button variant="ghost" onClick={() => removeMoon(i)}>
            ✕
          </Button>
        </div>
      ))}
      <AddCard label="Add Moon" onClick={addMoon} />
    </div>
  )
}

function EventsStep({ config, onPatch, notes }: StepProps & { notes: Note[] }): JSX.Element {
  function updateEvent(index: number, fields: Partial<CalendarEvent>): void {
    onPatch({ events: config.events.map((e, i) => (i === index ? { ...e, ...fields } : e)) })
  }
  function addEvent(): void {
    if (config.months.length === 0) return
    onPatch({
      events: [
        ...config.events,
        {
          id: uuid(),
          name: 'New Event',
          description: '',
          category: '',
          color: '#7a8fd1',
          date: { year: config.currentDate.year, monthIndex: 0, day: 1 },
          repeat: 'none',
          linkedNoteId: null
        }
      ]
    })
  }
  function removeEvent(index: number): void {
    onPatch({ events: config.events.filter((_, i) => i !== index) })
  }

  // Existing categories the DM has already used, offered as a datalist so
  // typing the same category twice actually matches instead of silently
  // forking into "Festival" vs "festival" vs "Festivals".
  const existingCategories = [...new Set(config.events.map((e) => e.category).filter(Boolean))]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <label className="gb-label" style={{ margin: 0 }}>
        Events
      </label>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
        Festivals, deadlines, anniversaries — anything worth marking on the calendar. Group related events under the same
        category for a quick visual read, and optionally pair one with an existing note (a session recap, a quest writeup).
        Events can also be added day-by-day from the calendar itself, next to whichever day is selected.
      </p>
      <datalist id="cal-event-categories">
        {existingCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {config.events.length === 0 && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>None yet.</p>}
      {config.events.map((event, i) => (
        <div
          key={event.id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 'var(--space-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)'
          }}
        >
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Color</span>
              <input
                type="color"
                title="Event color"
                value={event.color}
                onChange={(e) => updateEvent(i, { color: e.target.value })}
                style={{ width: 28, height: 22, padding: 0, border: 'none', background: 'none' }}
              />
            </label>
            <FieldLabel label="Name">
              <input
                className="gb-input"
                value={event.name}
                onChange={(e) => updateEvent(i, { name: e.target.value })}
                placeholder="Event name"
              />
            </FieldLabel>
            <FieldLabel label="Category">
              <input
                className="gb-input"
                list="cal-event-categories"
                value={event.category}
                onChange={(e) => updateEvent(i, { category: e.target.value })}
                placeholder="Category"
              />
            </FieldLabel>
            <ConfirmButton label="✕" confirmLabel="Sure?" variant="ghost" danger onConfirm={() => removeEvent(i)} />
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <FieldLabel label="Month">
              <select
                className="gb-input"
                style={{ fontSize: 12 }}
                value={event.date.monthIndex}
                onChange={(e) => updateEvent(i, { date: { ...event.date, monthIndex: Number(e.target.value) } })}
              >
                {config.months.map((m, mi) => (
                  <option key={mi} value={mi}>
                    {m.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel label="Day">
              <input
                className="gb-input"
                type="number"
                min={1}
                max={config.months[event.date.monthIndex]?.length ?? 31}
                style={{ width: 56, fontSize: 12 }}
                value={event.date.day}
                onChange={(e) => updateEvent(i, { date: { ...event.date, day: Math.max(1, Number(e.target.value) || 1) } })}
              />
            </FieldLabel>
            <FieldLabel label="Year">
              <input
                className="gb-input"
                type="number"
                style={{ width: 64, fontSize: 12 }}
                value={event.date.year}
                onChange={(e) => updateEvent(i, { date: { ...event.date, year: Number(e.target.value) || 0 } })}
              />
            </FieldLabel>
            <FieldLabel label="Repeats">
              <select
                className="gb-input"
                style={{ fontSize: 12 }}
                value={event.repeat}
                onChange={(e) => updateEvent(i, { repeat: e.target.value as EventRepeat })}
              >
                <option value="none">Never</option>
                <option value="yearly">Yearly</option>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </FieldLabel>
          </div>

          <FieldLabel label="Description">
            <textarea
              className="gb-input"
              rows={2}
              style={{ fontSize: 12 }}
              value={event.description}
              onChange={(e) => updateEvent(i, { description: e.target.value })}
              placeholder="Description (optional)"
            />
          </FieldLabel>

          {notes.length > 0 && (
            <FieldLabel label="Linked Note">
              <select
                className="gb-input"
                style={{ fontSize: 12, padding: '2px 6px' }}
                value={event.linkedNoteId ?? ''}
                onChange={(e) => updateEvent(i, { linkedNoteId: e.target.value || null })}
              >
                <option value="">None</option>
                {notes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title || 'Untitled'}
                  </option>
                ))}
              </select>
            </FieldLabel>
          )}
        </div>
      ))}
      <AddCard label="Add Event" disabled={config.months.length === 0} onClick={addEvent} />
    </div>
  )
}
