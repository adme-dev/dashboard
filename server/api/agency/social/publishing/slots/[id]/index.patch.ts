import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

/**
 * PATCH /api/agency/social/publishing/slots/:id
 * Partial update of a posting slot (enable/disable, name, capacity, schedule).
 */
const FIELDS: Record<string, string> = {
  name: 'name',
  platforms: 'platforms',
  dayOfWeek: 'day_of_week',
  timeOfDay: 'time_of_day',
  timezone: 'timezone',
  capacity: 'capacity',
  enabled: 'enabled',
}

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const b = await readBody(event)

  const sets: string[] = []
  const params: any[] = []
  for (const [key, col] of Object.entries(FIELDS)) {
    if (!(key in b)) continue
    params.push(b[key])
    sets.push(`${col} = $${params.length}`)
  }
  if (sets.length === 0) throw createError({ statusCode: 400, statusMessage: 'No updatable fields provided' })

  sets.push('updated_at = NOW()')
  params.push(id)
  const row = await queryOne(
    `UPDATE social_slot_schedules SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
  return row
})
