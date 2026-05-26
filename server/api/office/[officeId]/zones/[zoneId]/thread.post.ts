/**
 * POST /api/office/:officeId/zones/:zoneId/thread
 * Create or return the persistent chat thread for an office room.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeZoneThreadChannel } from '~~/server/utils/officeThreads'
import type { OfficeMemberRow, OfficeZoneRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const zoneId = getRouterParam(event, 'zoneId')

  if (!officeId || !zoneId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and zoneId are required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  const zone = await queryOne<OfficeZoneRow>(
    `SELECT * FROM office_zones WHERE id = $1 AND office_id = $2`,
    [zoneId, officeId]
  )
  if (!zone) {
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  }
  if (zone.zone_type === 'desk') {
    throw createError({ statusCode: 400, statusMessage: 'Desk threads use direct messages' })
  }

  const channel = await ensureOfficeZoneThreadChannel({
    officeId,
    zoneId,
    actorId: user.id
  })
  if (!channel) {
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  }

  return channel
})
