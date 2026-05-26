/**
 * GET /api/office/:officeId/assistant/jobs
 * List visible office assistant execution jobs.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { ensureOfficeAssistantTables } from '~~/server/utils/officeAssistant'
import type { OfficeAssistantJobRow, OfficeMemberRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  await ensureOfficeAssistantTables()
  const jobs = await queryRows<OfficeAssistantJobRow>(
    `SELECT *
     FROM office_assistant_jobs
     WHERE office_id = $1
       AND (user_id = $2 OR $3 = 'admin')
     ORDER BY created_at DESC
     LIMIT 40`,
    [officeId, user.id, membership.role]
  )

  return { jobs }
})
