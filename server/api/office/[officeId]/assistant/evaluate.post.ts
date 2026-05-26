/**
 * POST /api/office/:officeId/assistant/evaluate
 * Evaluates the current member's active office assistant watches and emits notifications.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { evaluateOfficeAssistantWatches } from '~~/server/utils/officeAssistantEvaluator'
import type { OfficeMemberRow } from '~~/app/types/office'

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

  return evaluateOfficeAssistantWatches({
    officeId,
    userId: user.id,
    limit: 50
  })
})
