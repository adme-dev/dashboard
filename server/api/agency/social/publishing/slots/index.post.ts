import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

/**
 * POST /api/agency/social/publishing/slots
 * Create a recurring posting slot for a client.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const b = await readBody(event)
  if (!b.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  if (b.dayOfWeek == null || !b.timeOfDay) throw createError({ statusCode: 400, statusMessage: 'dayOfWeek and timeOfDay required' })

  const row = await queryOne(
    `INSERT INTO social_slot_schedules
       (client_id, name, platforms, day_of_week, time_of_day, timezone, capacity, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      b.clientId,
      b.name ?? 'Posting slot',
      b.platforms ?? [],
      b.dayOfWeek,
      b.timeOfDay,
      b.timezone ?? 'Australia/Sydney',
      b.capacity ?? 1,
      b.enabled ?? true,
    ],
  )
  return row
})
