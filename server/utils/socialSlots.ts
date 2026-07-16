/**
 * Posting-slot helpers — compute the next free optimal posting times for a client
 * from their recurring social_slot_schedules, timezone-correct via @internationalized/date.
 */
import { CalendarDateTime, toZoned, getDayOfWeek, fromDate } from '@internationalized/date'
import { queryRows } from '~~/server/utils/db'

interface SlotRow {
  day_of_week: number // 0=Sun..6=Sat
  time_of_day: string // 'HH:MM[:SS]'
  timezone: string
  capacity: number
  platforms?: string[] | null
}

/**
 * Return the next `count` posting-slot instants (UTC Date objects) after `fromInstant`,
 * walking forward through the client's enabled recurring slots. Empty if no slots.
 */
export async function nextOptimalSlots(
  clientId: string,
  count: number,
  fromInstant: Date = new Date(),
  platforms: string[] = [],
): Promise<Date[]> {
  if (count <= 0) return []
  const slots = await queryRows<SlotRow>(
    `SELECT day_of_week, time_of_day, timezone, capacity, platforms
       FROM social_slot_schedules
      WHERE client_id = $1 AND enabled = TRUE`,
    [clientId]
  )
  if (!slots.length) return []

  const baseTz = slots[0]!.timezone || 'Australia/Sydney'
  const start = fromDate(fromInstant, baseTz)
  const out: Date[] = []
  const maxDays = count * 7 + 14

  for (let d = 0; d <= maxDays && out.length < count; d++) {
    const day = start.add({ days: d })
    const dow = getDayOfWeek(day, 'en-US') // 0=Sun..6=Sat
    for (const slot of slots) {
      if (slot.day_of_week !== dow) continue
      if (platforms.length && slot.platforms?.length && !slot.platforms.some(platform => platforms.includes(platform))) continue
      const [h, m] = slot.time_of_day.split(':').map(Number)
      const cdt = new CalendarDateTime(day.year, day.month, day.day, h || 0, m || 0)
      const inst = toZoned(cdt, slot.timezone || baseTz).toDate()
      if (inst.getTime() <= fromInstant.getTime()) continue
      for (let c = 0; c < Math.max(1, slot.capacity || 1) && out.length < count; c++) {
        out.push(inst)
      }
    }
  }

  out.sort((a, b) => a.getTime() - b.getTime())
  return out.slice(0, count)
}
