/**
 * Quiet Hours / DND helper.
 *
 * Suppresses web push for low-signal notifications during the user's configured
 * window. In-app notification rows are still written — quiet hours mute the
 * push channel only. High-signal reasons (mentioned, assigned) always push.
 */

import { queryOne } from '~~/server/utils/db'

export interface QuietHoursConfig {
  enabled: boolean
  startMinute: number
  endMinute: number
  timezone: string
  daysOfWeek: number[]
}

/**
 * High-signal reasons that bypass quiet hours.
 * Mentions and assignments are user-directed; the user explicitly wants them.
 */
const ALWAYS_PUSH_REASONS = new Set(['mentioned', 'assigned'])

/**
 * Get the user-local minute-of-day and day-of-week for a given timezone.
 * Uses Intl.DateTimeFormat which handles DST and IANA TZs correctly.
 */
export function getLocalTime(date: Date, timezone: string): { minutesOfDay: number; dayOfWeek: number } {
  // Pull hour/minute/weekday in the target TZ.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dayOfWeek = weekdayMap[weekday] ?? 0
  // Intl can return "24" for midnight in some locales; normalise.
  const normalisedHour = hour === 24 ? 0 : hour
  return {
    minutesOfDay: normalisedHour * 60 + minute,
    dayOfWeek,
  }
}

/**
 * True if `minutes` falls within [start, end], handling midnight wrap when
 * end < start (e.g. start=20:00, end=08:00 means 20:00..08:00 next day).
 */
export function isWithinRange(minutes: number, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) return false // zero-length range = always disabled
  if (startMinute < endMinute) {
    return minutes >= startMinute && minutes < endMinute
  }
  // Wrap: e.g. 20:00..08:00 means [20:00..24:00) ∪ [00:00..08:00)
  return minutes >= startMinute || minutes < endMinute
}

/**
 * Returns true if the given user is currently in their quiet-hours window AND
 * the notification reason is suppressible.
 *
 * Returns false (i.e. allow push) when:
 *  - User has no quiet_hours configured
 *  - quiet_hours.enabled is false
 *  - Today is not in daysOfWeek
 *  - Current time is outside the window
 *  - Reason is mentioned/assigned (always push)
 *  - Reason is null/undefined (treat as direct, always push for safety)
 */
export async function isWithinQuietHours(
  userId: string,
  reason?: string | null,
  now: Date = new Date()
): Promise<boolean> {
  // High-signal reasons bypass quiet hours entirely.
  if (!reason || ALWAYS_PUSH_REASONS.has(reason)) return false

  let config: QuietHoursConfig | null = null
  try {
    const row = await queryOne(
      `SELECT quiet_hours FROM team_members WHERE id = $1`,
      [userId]
    )
    config = row?.quiet_hours || null
  } catch {
    return false // DB error — fail open (push goes through)
  }

  if (!config || !config.enabled) return false
  if (!config.timezone) return false
  if (typeof config.startMinute !== 'number' || typeof config.endMinute !== 'number') return false

  let local
  try {
    local = getLocalTime(now, config.timezone)
  } catch {
    // Invalid timezone string — fail open
    return false
  }

  const days = Array.isArray(config.daysOfWeek) && config.daysOfWeek.length > 0
    ? config.daysOfWeek
    : [0, 1, 2, 3, 4, 5, 6]
  if (!days.includes(local.dayOfWeek)) return false

  return isWithinRange(local.minutesOfDay, config.startMinute, config.endMinute)
}
