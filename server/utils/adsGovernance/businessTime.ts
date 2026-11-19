// server/utils/adsGovernance/businessTime.ts
// Pure, dependency-free business-time helpers (default Australia/Melbourne, DST-correct via Intl).

export const GOVERNANCE_TIMEZONE = 'Australia/Melbourne'

export interface BusinessWindow {
  timezone: string
  /** Inclusive local start hour, 0–23. */
  startHour: number
  /** Exclusive local end hour, 1–24. */
  endHour: number
  /** ISO weekdays that are business days (1 = Monday … 7 = Sunday). */
  days: readonly number[]
}

export const DEFAULT_BUSINESS_WINDOW: BusinessWindow = {
  timezone: GOVERNANCE_TIMEZONE,
  startHour: 9,
  endHour: 17,
  days: [1, 2, 3, 4, 5]
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timezone: string): Intl.DateTimeFormat {
  let value = formatters.get(timezone)
  if (!value) {
    value = new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone,
      hourCycle: 'h23',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
    formatters.set(timezone, value)
  }
  return value
}

/** Local ISO weekday and wall-clock hour/minute of an instant in `timezone`. */
export function zonedClock(at: Date, timezone = GOVERNANCE_TIMEZONE): { weekday: number, hour: number, minute: number } {
  const parts = Object.fromEntries(formatter(timezone).formatToParts(at).map(part => [part.type, part.value]))
  const weekday = WEEKDAY[parts.weekday ?? '']
  if (!weekday) throw new Error(`Unable to resolve weekday in ${timezone}`)
  return { weekday, hour: Number(parts.hour) % 24, minute: Number(parts.minute) }
}

export function isWithinBusinessHours(at: Date, window: BusinessWindow = DEFAULT_BUSINESS_WINDOW): boolean {
  const { weekday, hour } = zonedClock(at, window.timezone)
  return window.days.includes(weekday) && hour >= window.startHour && hour < window.endHour
}

export function isBusinessDay(at: Date, timezone = GOVERNANCE_TIMEZONE, days: readonly number[] = DEFAULT_BUSINESS_WINDOW.days): boolean {
  return days.includes(zonedClock(at, timezone).weekday)
}

const STEP_MS = 5 * 60 * 1000

/**
 * `start` plus `hours` of elapsed time, where — when `skipNonBusinessDays` — time falling on a
 * non-business day (Sat/Sun in `timezone`) does not count. Resolution: 5 minutes.
 * A Friday 15:00 proposal with 72 h therefore expires Wednesday 15:00, never over a weekend.
 */
export function addBusinessAwareHours(
  start: Date,
  hours: number,
  options: { timezone?: string, skipNonBusinessDays?: boolean, days?: readonly number[] } = {}
): Date {
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('Expiry hours must be positive')
  const total = hours * 60 * 60 * 1000
  if (options.skipNonBusinessDays === false) return new Date(start.getTime() + total)
  const timezone = options.timezone ?? GOVERNANCE_TIMEZONE
  const days = options.days ?? DEFAULT_BUSINESS_WINDOW.days
  let remaining = total
  let cursor = start.getTime()
  // Bounded: at most `hours` of counted time plus 2 skipped days per counted week.
  const guard = Math.ceil(total / STEP_MS) * 4 + 10_000
  for (let step = 0; remaining > 0; step++) {
    if (step > guard) throw new Error('Business-hour expiry did not converge')
    if (isBusinessDay(new Date(cursor), timezone, days)) {
      const chunk = Math.min(STEP_MS, remaining)
      remaining -= chunk
      cursor += chunk
    } else {
      cursor += STEP_MS
    }
  }
  return new Date(cursor)
}
