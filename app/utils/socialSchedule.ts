/**
 * Pure timezone-safe bridge between an ISO instant and the {date, time} controls
 * shown by the compose scheduler. Framework-free so the conversion is unit-tested
 * independently of PostComposer.vue.
 *
 * The calendar date AND the time-of-day are both derived in the post timezone, so
 * the ISO -> parts -> ISO round-trip is a stable fixed point. Deriving the date in
 * one zone (UTC) and the time in another (the post tz) — as the original composer
 * did — made the round-trip drift a day each cycle, which sent the compose date
 * watches into an infinite loop and blanked the page for any instant whose UTC
 * date differs from its local date (e.g. a calendar "+" local-midnight in AEST).
 */
import {
  CalendarDate,
  CalendarDateTime,
  parseAbsolute,
  toCalendarDate,
  toZoned,
  type DateValue,
} from '@internationalized/date'

export interface ScheduleParts {
  date: DateValue | null
  time: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Convert an ISO instant into the calendar date + HH:MM time shown to the user, both in `timeZone`. */
export function isoToScheduleParts(iso: string | null, timeZone: string): ScheduleParts {
  if (!iso) return { date: null, time: '09:00' }
  try {
    const zoned = parseAbsolute(iso, timeZone)
    return { date: toCalendarDate(zoned), time: `${pad(zoned.hour)}:${pad(zoned.minute)}` }
  } catch {
    return { date: null, time: '09:00' }
  }
}

/** Combine a calendar date + HH:MM (interpreted in `timeZone`) into a UTC ISO instant. */
export function partsToIso(date: DateValue | null, time: string, timeZone: string): string | null {
  if (!date) return null
  const d = date as CalendarDate
  const [h, m] = time.split(':').map(Number)
  const cdt = new CalendarDateTime(d.year, d.month, d.day, h || 0, m || 0)
  return toZoned(cdt, timeZone).toDate().toISOString()
}
