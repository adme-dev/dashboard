/**
 * GET /api/office/:officeId/meetings/:meetingId/action-items/:actionItemId/crm-candidates
 * Ranked CRM-target proposals for converting a meeting action item into a CRM task.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { findMeetingCrmCandidates, rankTargets, authorizeMeetingCandidatesForEvent } from '~~/server/utils/crm/meetingBridge'
import type { OfficeMemberRow, OfficeMeetingActionItemRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const meetingId = getRouterParam(event, 'meetingId')
  const actionItemId = getRouterParam(event, 'actionItemId')
  if (!officeId || !meetingId || !actionItemId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId, meetingId and actionItemId are required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id],
  )
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })

  await ensureOfficeMeetingArtifactsTables()
  const actionItem = await queryOne<OfficeMeetingActionItemRow>(
    `SELECT omai.* FROM office_meeting_action_items omai
     JOIN office_meeting_sessions oms ON oms.id = omai.meeting_session_id
     WHERE omai.id = $1 AND omai.office_id = $2 AND omai.meeting_session_id = $3 AND oms.office_id = $2`,
    [actionItemId, officeId, meetingId],
  )
  if (!actionItem) throw createError({ statusCode: 404, statusMessage: 'Action item not found' })

  const candidates = await authorizeMeetingCandidatesForEvent(event, await findMeetingCrmCandidates(meetingId))
  return { proposals: rankTargets(candidates), alreadyConverted: !!actionItem.crm_task_id }
})
