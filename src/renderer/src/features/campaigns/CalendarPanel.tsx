import { useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useCalendar } from './useCalendar'
import { CalendarCreatorWizard } from './CalendarCreatorWizard'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { useLastTruthy } from '../../ui/useLastTruthy'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { getStoredFontScale } from '../../theme'
import {
  activeSeasonForDate,
  addDays,
  cloudinessLabel,
  dayNoteFor,
  eraForYear,
  eventsOnDate,
  formatCalendarDate,
  formatHour,
  isDaytime,
  monthLength,
  moonPhaseForDate,
  RAIN_LABELS,
  removeEvent,
  sameDate,
  setDayNote,
  sunHoursForDate,
  upsertEvent,
  weatherForDate,
  weekdayIndexForDate,
  type CalendarConfig,
  type CalendarDate,
  type CalendarEvent,
  type EventRepeat
} from '@shared/calendar'
import type { Note } from '@shared/ipc'

interface CalendarPanelProps {
  sessionId: string | null
  campaignId: string | null
  /** true for the player-facing view (PartySidebar) — read and click through months/days, but no create/edit/advance controls. Server-side saveCalendar also rejects non-DM callers regardless. */
  readOnly: boolean
  /** For pairing an event with an existing note — omitted (defaults to none) on the read-only player path, which never opens an editor anyway. */
  notes?: Note[]
}

type ViewMode = 'day' | 'week' | 'month'

/** Every day cell across every view (week row, month grid) is this exact size regardless of how many days are in the viewed month or how many rows that takes — a 28-day February and a 31-day January look identical, only the grid's overall height differs. */
const CELL_SIZE = 30

const MIN_DAY_PANEL_HEIGHT = 100
const DAY_PANEL_HEIGHT_KEY = 'gb-calendar-day-panel-height'

function loadDayPanelHeight(): number | null {
  try {
    const raw = localStorage.getItem(DAY_PANEL_HEIGHT_KEY)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Shared between RightPanel (DM) and PartySidebar (player) via the readOnly prop, same convention as CharacterSheetEditor — one component, not a forked copy. */
export function CalendarPanel({ sessionId, campaignId, readOnly, notes = [] }: CalendarPanelProps): JSX.Element {
  const { calendar, loading, error, save, remove } = useCalendar(sessionId ?? undefined, campaignId)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [timeDraft, setTimeDraft] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  // Browsing a different date than the campaign's actual current one is
  // purely local view state — it never touches the saved calendar, so a
  // player can look ahead/back without needing (or having) any write access.
  const [viewedDate, setViewedDate] = useState<CalendarDate | null>(null)
  // The day inspected in the detail panel below — separate from the
  // campaign's actual "current day" (config.currentDate). Clicking a day
  // cell just selects it for viewing; promoting it to the real current day
  // is now its own explicit action (see "Set as Current Day" below) rather
  // than an implicit side effect of clicking around the grid.
  const [selectedDate, setSelectedDate] = useState<CalendarDate | null>(null)
  const persistedHeight = useRef(loadDayPanelHeight()).current
  const [dayPanelHeight, setDayPanelHeight] = useState(persistedHeight ?? 170)
  const [resizing, setResizing] = useState(false)
  const splitRef = useRef<HTMLDivElement>(null)
  // Tracks whether the split should stay pinned to half the available
  // height (see the ResizeObserver effect below), following the panel as it
  // resizes (window resize, sidebar drag) rather than sitting at a fixed
  // pixel height that would look proportionally tiny in a tall panel or
  // oversized in a short one. Only true until the DM actually drags it, or
  // from the very start if a previously-dragged height was restored from
  // localStorage — a restored height is exactly as "manual" as a fresh drag.
  const hasManuallyResizedRef = useRef(persistedHeight !== null)
  const dayPanelHeightRef = useRef(dayPanelHeight)
  dayPanelHeightRef.current = dayPanelHeight
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const lastEditingEvent = useLastTruthy(editingEvent)

  useEffect(() => {
    const el = splitRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      if (hasManuallyResizedRef.current) return
      const half = Math.round(el.getBoundingClientRect().height / 2)
      setDayPanelHeight(Math.max(MIN_DAY_PANEL_HEIGHT, half))
    })
    observer.observe(el)
    return () => observer.disconnect()
    // Re-attaches once the real split view actually mounts — early on,
    // while the calendar is still loading (or none exists yet), this effect
    // runs with splitRef.current still null (that div isn't in the tree
    // yet), and an empty dep array would mean it never gets another chance
    // to attach once the real UI appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!calendar])

  const config = calendar?.config ?? null
  const viewed = viewedDate ?? config?.currentDate ?? null
  const selected = selectedDate ?? config?.currentDate ?? null

  const monthCells = useMemo(() => {
    if (!config || !viewed) return []
    return buildMonthGrid(config, viewed.year, viewed.monthIndex)
  }, [config, viewed])

  const weekCells = useMemo(() => {
    if (!config || !viewed) return []
    return buildWeekGrid(config, viewed)
  }, [config, viewed])

  const selectedWeather = useMemo(() => {
    if (!config || !selected) return null
    return weatherForDate(config, selected, config.selectedLocationId)
  }, [config, selected])

  useEffect(() => {
    if (!resizing) return
    function handleMove(e: PointerEvent): void {
      if (!splitRef.current) return
      const rect = splitRef.current.getBoundingClientRect()
      const scale = getStoredFontScale()
      const fromBottom = (rect.bottom - e.clientY) / scale
      setDayPanelHeight(Math.max(MIN_DAY_PANEL_HEIGHT, fromBottom))
    }
    function handleUp(): void {
      setResizing(false)
      try {
        localStorage.setItem(DAY_PANEL_HEIGHT_KEY, String(dayPanelHeightRef.current))
      } catch {
        /* best-effort persistence only */
      }
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [resizing])

  if (!campaignId) {
    return <Empty text="Open a campaign to see its calendar." />
  }
  if (loading && !calendar) {
    return <Empty text="Loading…" />
  }

  if (!config) {
    return (
      <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          {readOnly ? "The DM hasn't set up a calendar for this campaign yet." : 'No calendar yet for this campaign.'}
        </p>
        {!readOnly && (
          <Button variant="primary" onClick={() => setWizardOpen(true)}>
            Create Calendar
          </Button>
        )}
        {!readOnly && wizardOpen && (
          <CalendarCreatorWizard
            notes={notes}
            onClose={() => setWizardOpen(false)}
            onSave={async (cfg) => {
              if (await save(cfg)) setWizardOpen(false)
            }}
          />
        )}
      </div>
    )
  }

  const month = config.months[viewed!.monthIndex]
  const era = eraForYear(config, viewed!.year)

  /** Steps the viewed date by one unit of whatever view is currently showing — a month in month view, a full week in week view, a single day in day view. */
  function shiftView(delta: number): void {
    if (!config || !viewed) return
    if (viewMode === 'day') {
      setViewedDate(addDays(config, viewed, delta))
      return
    }
    if (viewMode === 'week') {
      setViewedDate(addDays(config, viewed, delta * config.weekdays.length))
      return
    }
    let { year, monthIndex } = viewed
    monthIndex += delta
    while (monthIndex < 0) {
      year -= 1
      monthIndex += config.months.length
    }
    while (monthIndex >= config.months.length) {
      year += 1
      monthIndex -= config.months.length
    }
    setViewedDate({ year, monthIndex, day: Math.min(viewed.day, monthLength(config, year, monthIndex)) })
  }

  async function advanceDay(delta: number): Promise<void> {
    if (!config) return
    const next = addDays(config, config.currentDate, delta)
    await save({ ...config, currentDate: next })
    setViewedDate(null)
    setSelectedDate(null)
  }

  /** Re-centers the view (and selection) on the campaign's actual current day, without changing any data — for after browsing off to inspect some other day. */
  function goToToday(): void {
    setViewedDate(null)
    setSelectedDate(null)
  }

  async function setAsCurrentDay(date: CalendarDate): Promise<void> {
    if (!config || readOnly) return
    await save({ ...config, currentDate: date })
  }

  async function selectLocation(locationId: string | null): Promise<void> {
    if (!config || readOnly) return
    await save({ ...config, selectedLocationId: locationId })
  }

  async function commitTimeOfDay(): Promise<void> {
    if (!config || timeDraft === null) return
    if (timeDraft !== config.timeOfDay) await save({ ...config, timeOfDay: timeDraft })
    setTimeDraft(null)
  }

  async function commitDayNote(date: CalendarDate, text: string): Promise<void> {
    if (!config || readOnly) return
    await save({ ...config, dayNotes: setDayNote(config, date, text) })
  }

  async function commitEvent(event: CalendarEvent): Promise<void> {
    if (!config || readOnly) return
    if (await save({ ...config, events: upsertEvent(config, event) })) setEditingEvent(null)
  }

  async function deleteEvent(eventId: string): Promise<void> {
    if (!config || readOnly) return
    await save({ ...config, events: removeEvent(config, eventId) })
  }

  function headerLabel(): { title: string; subtitle: string } {
    if (viewMode === 'day') {
      return {
        title: `${month?.name} ${viewed!.day}`,
        subtitle: era ? era.displayFormat.replace('{year}', String(viewed!.year)) : String(viewed!.year)
      }
    }
    if (viewMode === 'week') {
      const first = weekCells[0]
      const last = weekCells[weekCells.length - 1]
      const sameMonth = first && last && first.monthIndex === last.monthIndex && first.year === last.year
      const title =
        first && last
          ? sameMonth
            ? `${config!.months[first.monthIndex]?.name} ${first.day}–${last.day}`
            : `${config!.months[first.monthIndex]?.name} ${first.day} – ${config!.months[last.monthIndex]?.name} ${last.day}`
          : ''
      return { title, subtitle: era ? era.displayFormat.replace('{year}', String(viewed!.year)) : String(viewed!.year) }
    }
    return { title: month?.name ?? '', subtitle: era ? era.displayFormat.replace('{year}', String(viewed!.year)) : String(viewed!.year) }
  }

  const label = headerLabel()
  const activeSeason = activeSeasonForDate(config, selected!)
  const sunHours = sunHoursForDate(config, selected!)
  const daytime = sameDate(selected!, config.currentDate) ? isDaytime(config, selected!, config.timeOfDay) : null
  const selectedEvents = eventsOnDate(config, selected!)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{config.name}</strong>
          {!readOnly && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                className="gb-btn gb-btn--ghost"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => setWizardOpen(true)}
              >
                Edit
              </button>
              <ConfirmButton
                label="Delete"
                confirmLabel="Confirm?"
                variant="ghost"
                danger
                style={{ fontSize: 11, padding: '2px 8px' }}
                title="Delete this campaign's calendar — this can't be undone"
                onConfirm={() => void remove()}
              />
            </div>
          )}
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{formatCalendarDate(config, config.currentDate)}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          <span>Time of day:</span>
          {readOnly ? (
            <span>{config.timeOfDay}</span>
          ) : (
            <input
              className="gb-input"
              style={{ width: 80, fontSize: 12, padding: '2px 6px' }}
              value={timeDraft ?? config.timeOfDay}
              onChange={(e) => setTimeDraft(e.target.value)}
              onBlur={commitTimeOfDay}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              placeholder="HH:MM"
            />
          )}
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              type="button"
              className="gb-btn gb-btn--secondary"
              style={{ fontSize: 12, padding: '4px 10px' }}
              title="Previous day"
              onClick={() => advanceDay(-1)}
            >
              ←
            </button>
            <button type="button" className="gb-btn gb-btn--secondary" style={{ fontSize: 12 }} onClick={goToToday}>
              Today
            </button>
            <button
              type="button"
              className="gb-btn gb-btn--secondary"
              style={{ fontSize: 12, padding: '4px 10px' }}
              title="Next day"
              onClick={() => advanceDay(1)}
            >
              →
            </button>
          </div>
        )}
        {config.locations.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {readOnly ? (
              config.selectedLocationId && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                  {config.locations.find((l) => l.id === config.selectedLocationId)?.name}
                </p>
              )
            ) : (
              <select
                className="gb-input"
                style={{ fontSize: 12, padding: '2px 6px' }}
                value={config.selectedLocationId ?? ''}
                onChange={(e) => selectLocation(e.target.value || null)}
              >
                <option value="">No location (season default)</option>
                {config.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <div ref={splitRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <div style={{ display: 'inline-flex', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
              {(['day', 'week', 'month'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  style={{
                    border: 'none',
                    padding: '3px 12px',
                    fontSize: 11,
                    textTransform: 'capitalize',
                    cursor: 'pointer',
                    background: viewMode === mode ? 'var(--accent-subtle)' : 'transparent',
                    color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-muted)'
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" className="gb-btn gb-btn--ghost" style={{ padding: '2px 8px' }} onClick={() => shiftView(-1)}>
              ‹
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{label.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label.subtitle}</div>
            </div>
            <button type="button" className="gb-btn gb-btn--ghost" style={{ padding: '2px 8px' }} onClick={() => shiftView(1)}>
              ›
            </button>
          </div>

          {viewMode === 'day' && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <DayCell
                label={String(viewed!.day)}
                big
                isSelected={sameDate(viewed!, selected!)}
                isToday={sameDate(viewed!, config.currentDate)}
                onClick={() => setSelectedDate(viewed)}
                onSetActive={readOnly ? undefined : () => setAsCurrentDay(viewed!)}
              />
            </div>
          )}

          {viewMode !== 'day' && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${config.weekdays.length}, ${CELL_SIZE}px)`, gap: 2 }}>
                {config.weekdays.map((w, i) => (
                  <div key={i} style={{ width: CELL_SIZE, fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', paddingBottom: 4 }}>
                    {w.abbreviation}
                  </div>
                ))}
                {viewMode === 'month'
                  ? monthCells.map((day, i) =>
                      day === null ? (
                        <div key={i} style={{ width: CELL_SIZE, height: CELL_SIZE }} />
                      ) : (
                        <DayCell
                          key={i}
                          label={String(day)}
                          isSelected={sameDate({ year: viewed!.year, monthIndex: viewed!.monthIndex, day }, selected!)}
                          isToday={
                            day === config.currentDate.day &&
                            viewed!.year === config.currentDate.year &&
                            viewed!.monthIndex === config.currentDate.monthIndex
                          }
                          eventColors={eventsOnDate(config, { year: viewed!.year, monthIndex: viewed!.monthIndex, day }).map((e) => e.color)}
                          onClick={() => setSelectedDate({ year: viewed!.year, monthIndex: viewed!.monthIndex, day })}
                          onSetActive={
                            readOnly ? undefined : () => setAsCurrentDay({ year: viewed!.year, monthIndex: viewed!.monthIndex, day })
                          }
                        />
                      )
                    )
                  : weekCells.map((date, i) => (
                      <DayCell
                        key={i}
                        label={String(date.day)}
                        isSelected={sameDate(date, selected!)}
                        isToday={sameDate(date, config.currentDate)}
                        eventColors={eventsOnDate(config, date).map((e) => e.color)}
                        onClick={() => setSelectedDate(date)}
                        onSetActive={readOnly ? undefined : () => setAsCurrentDay(date)}
                      />
                    ))}
              </div>
            </div>
          )}
        </div>

        <div
          onPointerDown={(e) => {
            e.preventDefault()
            hasManuallyResizedRef.current = true
            setResizing(true)
          }}
          title="Drag to resize"
          style={{
            height: 6,
            flexShrink: 0,
            cursor: 'row-resize',
            borderTop: '1px solid var(--border-subtle)',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface-raised)'
          }}
        />

        <div style={{ height: dayPanelHeight, flexShrink: 0, overflowY: 'auto', padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
            <strong style={{ fontSize: 13 }}>{formatCalendarDate(config, selected!)}</strong>
            {!readOnly && !sameDate(selected!, config.currentDate) && (
              <button
                type="button"
                className="gb-btn gb-btn--ghost"
                style={{ fontSize: 11, padding: '2px 8px' }}
                title="Also available by right-clicking any day"
                onClick={() => setAsCurrentDay(selected!)}
              >
                Set as Current Day
              </button>
            )}
          </div>

          {activeSeason && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: activeSeason.color, flexShrink: 0 }} />
              <span>{activeSeason.name}</span>
            </div>
          )}
          {selectedWeather ? (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              {selectedWeather.temperature}°{config.temperatureUnit} · {RAIN_LABELS[selectedWeather.rain]} ·{' '}
              {cloudinessLabel(selectedWeather.cloudiness)} · {selectedWeather.windMph} mph wind
            </p>
          ) : (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>No season covers this date yet.</p>
          )}
          {sunHours && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              ☀ {formatHour(sunHours.sunrise)}–{formatHour(sunHours.sunset)}
              {daytime !== null && <span style={{ color: 'var(--text-muted)' }}> · {daytime ? 'Daytime' : 'Night'} now</span>}
            </p>
          )}
          {config.moons.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
              {config.moons.map((moon) => {
                const { phase, illumination } = moonPhaseForDate(config, moon, selected!)
                return (
                  <div key={moon.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: moon.color, flexShrink: 0 }} />
                    <span>
                      {moon.name}: {phase} ({illumination}%)
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Events</span>
              {!readOnly && (
                <button
                  type="button"
                  className="gb-btn gb-btn--ghost"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() =>
                    setEditingEvent({
                      id: uuid(),
                      name: '',
                      description: '',
                      category: '',
                      color: '#7a8fd1',
                      date: selected!,
                      repeat: 'none',
                      linkedNoteId: null
                    })
                  }
                >
                  + Add Event
                </button>
              )}
            </div>
            {selectedEvents.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>None yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {selectedEvents.map((ev) => (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: ev.color, flexShrink: 0 }} />
                    <button
                      type="button"
                      onClick={() => !readOnly && setEditingEvent(ev)}
                      title={ev.description || undefined}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: readOnly ? 'default' : 'pointer',
                        color: 'var(--text-primary)',
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {ev.name}
                      {ev.category && <span style={{ color: 'var(--text-muted)' }}> · {ev.category}</span>}
                    </button>
                    {!readOnly && (
                      <ConfirmButton
                        label="✕"
                        confirmLabel="Sure?"
                        variant="ghost"
                        danger
                        style={{ fontSize: 11, padding: '2px 6px', flexShrink: 0 }}
                        onConfirm={() => deleteEvent(ev.id)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>
              Notes
            </div>
            <DayNoteEditor key={`${selected!.year}-${selected!.monthIndex}-${selected!.day}`} config={config} date={selected!} readOnly={readOnly} onCommit={commitDayNote} />
          </div>
        </div>
      </div>

      {error && (
        <p style={{ margin: 0, padding: 'var(--space-2) var(--space-3)', fontSize: 12, color: 'var(--danger, #e05555)' }}>{error}</p>
      )}

      {!readOnly && wizardOpen && (
        <CalendarCreatorWizard
          initial={config}
          notes={notes}
          onClose={() => setWizardOpen(false)}
          onSave={async (cfg) => {
            if (await save(cfg)) setWizardOpen(false)
          }}
        />
      )}

      {lastEditingEvent && (
        <EventEditorModal
          key={lastEditingEvent.id}
          open={!readOnly && editingEvent !== null}
          event={lastEditingEvent}
          isNew={!config.events.some((e) => e.id === lastEditingEvent.id)}
          notes={notes}
          onSave={commitEvent}
          onDelete={editingEvent && config.events.some((e) => e.id === editingEvent.id) ? () => deleteEvent(editingEvent.id).then(() => setEditingEvent(null)) : undefined}
          onClose={() => setEditingEvent(null)}
        />
      )}
    </div>
  )
}

function EventEditorModal({
  open,
  event,
  isNew,
  notes,
  onSave,
  onDelete,
  onClose
}: {
  open: boolean
  event: CalendarEvent
  isNew: boolean
  notes: Note[]
  onSave: (event: CalendarEvent) => void
  onDelete?: () => void
  onClose: () => void
}): JSX.Element {
  const [draft, setDraft] = useState(event)

  return (
    <Modal open={open} onClose={onClose} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18 }}>{isNew ? 'Add Event' : 'Edit Event'}</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="color"
            title="Event color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            style={{ width: 28, height: 32, padding: 0, border: 'none', background: 'none', flexShrink: 0 }}
          />
          <input
            className="gb-input"
            style={{ flex: 1 }}
            autoFocus
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Event name"
          />
        </div>
        <input
          className="gb-input"
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          placeholder="Category (optional) — Festival, Deadline, ..."
        />
        <textarea
          className="gb-input"
          rows={3}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Description (optional)"
        />
        <div>
          <label className="gb-label" style={{ margin: 0 }}>
            Repeats
          </label>
          <select
            className="gb-input"
            value={draft.repeat}
            onChange={(e) => setDraft({ ...draft, repeat: e.target.value as EventRepeat })}
          >
            <option value="none">Never (one-time)</option>
            <option value="yearly">Every year (same month/day)</option>
            <option value="monthly">Every month (same day)</option>
            <option value="weekly">Every week</option>
          </select>
        </div>
        {notes.length > 0 && (
          <div>
            <label className="gb-label" style={{ margin: 0 }}>
              Linked Note
            </label>
            <select
              className="gb-input"
              value={draft.linkedNoteId ?? ''}
              onChange={(e) => setDraft({ ...draft, linkedNoteId: e.target.value || null })}
            >
              <option value="">None</option>
              {notes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title || 'Untitled'}
                </option>
              ))}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {onDelete && (
              <ConfirmButton label="Delete" confirmLabel="Confirm?" variant="ghost" danger onConfirm={onDelete} />
            )}
            <Button variant="primary" disabled={draft.name.trim().length === 0} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/** Owns its own draft text locally, remounting (via the parent's `key`) whenever the selected date changes — simpler than syncing a shared draft-vs-saved state by hand. */
function DayNoteEditor({
  config,
  date,
  readOnly,
  onCommit
}: {
  config: CalendarConfig
  date: CalendarDate
  readOnly: boolean
  onCommit: (date: CalendarDate, text: string) => void
}): JSX.Element {
  const saved = dayNoteFor(config, date)
  const [draft, setDraft] = useState(saved)

  if (readOnly) {
    return <p style={{ margin: 0, fontSize: 12, color: saved ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{saved || 'No notes for this day.'}</p>
  }

  return (
    <textarea
      className="gb-input"
      rows={3}
      style={{ fontSize: 12, width: '100%' }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== saved) onCommit(date, draft)
      }}
      placeholder="Anything worth remembering about this day..."
    />
  )
}

function DayCell({
  label,
  isSelected,
  isToday,
  big,
  eventColors,
  onClick,
  onSetActive
}: {
  label: string
  isSelected: boolean
  isToday: boolean
  big?: boolean
  /** One dot per event occurring on this day (capped visually by how many fit) — the event's own color. */
  eventColors?: string[]
  onClick: () => void
  /** Right-click shortcut for "set as current day" — omitted (native context menu shows instead) for read-only viewers. */
  onSetActive?: () => void
}): JSX.Element {
  const size = big ? CELL_SIZE * 2.4 : CELL_SIZE
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={
        onSetActive &&
        ((e) => {
          e.preventDefault()
          onSetActive()
        })
      }
      title={onSetActive ? "View this day's details — right-click to set as the current day" : "View this day's details"}
      style={{
        position: 'relative',
        width: size,
        height: size,
        border: isToday ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
        borderRadius: 4,
        background: isSelected ? 'var(--accent-subtle)' : 'transparent',
        color: 'var(--text-primary)',
        fontSize: big ? 20 : 12,
        cursor: 'pointer'
      }}
    >
      {label}
      {eventColors && eventColors.length > 0 && (
        <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 1 }}>
          {eventColors.slice(0, 3).map((color, i) => (
            <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: color, display: 'inline-block' }} />
          ))}
        </div>
      )}
    </button>
  )
}

/** Hard ceiling on how many day cells a single month ever renders — regardless of what a month's configured length actually is (the wizard/server already clamp new input to a sane max, but this is the last line of defense against any already-bad stored data ever freezing the render again, the way a 999999-day month once did). */
const MAX_RENDERED_MONTH_DAYS = 500

/** One cell per weekday slot, `null` for the leading blanks before day 1 — a flat array so it drops straight into a CSS grid with `weekdays.length` columns. */
function buildMonthGrid(config: CalendarConfig, year: number, monthIndex: number): (number | null)[] {
  const leading = weekdayIndexForDate(config, { year, monthIndex, day: 1 })
  const total = Math.min(MAX_RENDERED_MONTH_DAYS, monthLength(config, year, monthIndex))
  const cells: (number | null)[] = Array.from({ length: leading }, () => null)
  for (let day = 1; day <= total; day++) cells.push(day)
  return cells
}

/** `weekdays.length` consecutive dates, starting from whichever day begins the week `anchor` falls in — may span two different months (or years). */
function buildWeekGrid(config: CalendarConfig, anchor: CalendarDate): CalendarDate[] {
  const start = addDays(config, anchor, -weekdayIndexForDate(config, anchor))
  return Array.from({ length: config.weekdays.length }, (_, i) => addDays(config, start, i))
}

function Empty({ text }: { text: string }): JSX.Element {
  return <p style={{ padding: 'var(--space-3)', fontSize: 13, color: 'var(--text-muted)' }}>{text}</p>
}
