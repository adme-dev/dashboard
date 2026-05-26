/**
 * DELETE /api/office/:officeId/zones/:zoneId
 * Admin-only: remove a zone. CASCADE on the FK cleans up zone_visits.
 * The matching chat_channels row is preserved for history; cleanup is
 * out of scope for Phase 1a.
 */

import { execute, queryOne } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import { notifyOfficeZoneDeleted } from '~~/server/utils/officeRoomControl'
import type { OfficeZoneRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  const zoneId = getRouterParam(event, 'zoneId')!
  const { user } = await requireOfficeAdmin(event, officeId)

  const zone = await queryOne<OfficeZoneRow>(
    `SELECT *
     FROM office_zones
     WHERE id = $1 AND office_id = $2`,
    [zoneId, officeId]
  )
  if (!zone) {
    throw createError({ statusCode: 404, statusMessage: 'Zone not found' })
  }

  const deleted = await execute(
    `DELETE FROM office_zones WHERE id = $1 AND office_id = $2`,
    [zoneId, officeId]
  )
  if (deleted === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Zone not found' })
  }
  await notifyOfficeZoneDeleted(event, officeId, zoneId)
  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: 'zone.deleted',
    targetType: 'office_zone',
    targetId: zoneId,
    metadata: {
      slug: zone.slug,
      name: zone.name,
      zone_type: zone.zone_type,
      capacity: zone.capacity,
      is_private: zone.is_private,
      acl: zone.acl,
      position: zone.position
    }
  })
  return { deleted: 1 }
})
