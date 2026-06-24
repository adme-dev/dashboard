/**
 * Pure helpers for the Social Publishing calendar drag-and-drop (Slice 2).
 * Kept framework-free so the reschedule rules are unit-tested independently of
 * the calendar component.
 */

/**
 * Statuses whose posts can be dragged to a new day. A post that is already
 * publishing/published/failed/cancelled is history — never reschedulable.
 */
export const RESCHEDULABLE_STATUSES = ['draft', 'approved', 'scheduled'] as const

export function canReschedule(status: string): boolean {
  return (RESCHEDULABLE_STATUSES as readonly string[]).includes(status)
}

/**
 * New scheduled_at ISO for a post dropped onto `targetDay`: keep the post's
 * existing local time-of-day (or 09:00 when it has none) and move it to the
 * target day. The calendar renders times in the browser's local zone, so the
 * time-of-day is preserved in local terms and serialized back to UTC ISO.
 */
export function computeRescheduledAt(currentIso: string | null, targetDay: Date): string {
  const time = currentIso ? new Date(currentIso) : null
  const hours = time ? time.getHours() : 9
  const minutes = time ? time.getMinutes() : 0
  const seconds = time ? time.getSeconds() : 0

  const d = new Date(
    targetDay.getFullYear(),
    targetDay.getMonth(),
    targetDay.getDate(),
    hours,
    minutes,
    seconds,
    0
  )
  return d.toISOString()
}
