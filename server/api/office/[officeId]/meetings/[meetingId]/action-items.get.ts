/**
 * GET /api/office/:officeId/meetings/:meetingId/action-items
 * Lists structured follow-up actions captured from meeting artifacts.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import type { OfficeMeetingActionItemRow, OfficeMemberRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const meetingId = getRouterParam(event, 'meetingId')

  if (!officeId || !meetingId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and meetingId are required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  await ensureOfficeMeetingArtifactsTables()
  const actionItems = await queryRows<OfficeMeetingActionItemRow>(
    `SELECT omai.*
     FROM office_meeting_action_items omai
     WHERE omai.office_id = $1
       AND omai.meeting_session_id = $2
       AND EXISTS (
         SELECT 1
         FROM office_meeting_sessions oms
         WHERE oms.id = omai.meeting_session_id
           AND oms.office_id = $1
       )
     ORDER BY
       CASE omai.status
         WHEN 'open' THEN 0
         WHEN 'in_progress' THEN 1
         WHEN 'done' THEN 2
         ELSE 3
       END,
       omai.created_at ASC,
       omai.line_index ASC`,
    [officeId, meetingId]
  )

  return { actionItems }
})
