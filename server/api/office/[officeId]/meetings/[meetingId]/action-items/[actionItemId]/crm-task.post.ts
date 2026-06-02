/**
 * POST /api/office/:officeId/meetings/:meetingId/action-items/:actionItemId/crm-task
 * Converts a meeting action item into a CRM task against a chosen CRM target.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import {
  findMeetingCrmCandidates, rankTargets, convertActionItemToCrmTask, AlreadyConvertedError,
} from '~~/server/utils/crm/meetingBridge'
import type { OfficeMemberRow } from '~~/app/types/office'

const Body = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['opportunity', 'person', 'company']),
  target_id: z.string().uuid(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
})

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

  const body = Body.parse(await readBody(event))
  await ensureOfficeMeetingArtifactsTables()

  const actionItem = await queryOne<any>(
    `SELECT omai.*, oms.title AS meeting_title
     FROM office_meeting_action_items omai
     JOIN office_meeting_sessions oms ON oms.id = omai.meeting_session_id
     WHERE omai.id = $1 AND omai.office_id = $2 AND omai.meeting_session_id = $3 AND oms.office_id = $2`,
    [actionItemId, officeId, meetingId],
  )
  if (!actionItem) throw createError({ statusCode: 404, statusMessage: 'Action item not found' })

  // Guard: the chosen target must be one the resolver actually proposed (primary
  // OR an alternative) — blocks injecting an arbitrary cross-tenant target.
  const proposals = rankTargets(await findMeetingCrmCandidates(meetingId))
  const allTargets = proposals.flatMap(p => [
    { client_id: p.client_id, target_type: p.target_type, target_id: p.target_id },
    ...p.alternatives.map(a => ({ client_id: a.client_id, target_type: a.target_type, target_id: a.target_id })),
  ])
  const ok = allTargets.some(t =>
    t.client_id === body.client_id && t.target_type === body.target_type && t.target_id === body.target_id)
  if (!ok) throw createError({ statusCode: 400, statusMessage: 'Chosen target is not a valid candidate for this meeting' })

  try {
    return await convertActionItemToCrmTask(
      {
        id: actionItem.id, meeting_session_id: actionItem.meeting_session_id,
        meeting_title: actionItem.meeting_title, source_artifact_id: actionItem.source_artifact_id,
        content: actionItem.content, due_at: actionItem.due_at, crm_task_id: actionItem.crm_task_id,
      },
      { client_id: body.client_id, target_type: body.target_type, target_id: body.target_id },
      { actor: user.id, mode: 'manual_office', priority: body.priority },
    )
  } catch (e) {
    if (e instanceof AlreadyConvertedError) {
      throw createError({ statusCode: 409, statusMessage: 'Action item already converted to a CRM task' })
    }
    throw e
  }
})
