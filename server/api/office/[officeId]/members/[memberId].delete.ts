/**
 * DELETE /api/office/:officeId/members/:memberId
 * Admin-only: remove a member from the office.
 */

import { execute } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  const memberId = getRouterParam(event, 'memberId')!
  await requireOfficeAdmin(event, officeId)
  await execute(
    `DELETE FROM office_members WHERE id = $1 AND office_id = $2`,
    [memberId, officeId]
  )
  return { deleted: 1 }
})
