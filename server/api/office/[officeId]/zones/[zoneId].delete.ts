/**
 * DELETE /api/office/:officeId/zones/:zoneId
 * Admin-only: remove a zone. CASCADE on the FK cleans up zone_visits.
 * The matching chat_channels row is preserved for history; cleanup is
 * out of scope for Phase 1a.
 */

import { execute } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  const zoneId = getRouterParam(event, 'zoneId')!
  await requireOfficeAdmin(event, officeId)

  await execute(
    `DELETE FROM office_zones WHERE id = $1 AND office_id = $2`,
    [zoneId, officeId],
  )
  return { deleted: 1 }
})
