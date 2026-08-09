// server/api/crm/meeting-actions/[actionItemId]/convert.post.ts
// Convert a meeting action item into a CRM task against an in-context CRM target
// (the record the operator is viewing). Validates the chosen target is one the
// resolver actually proposed for this meeting (no cross-tenant injection).
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  findMeetingCrmCandidates, rankTargets, isTargetInCandidates, convertActionItemToCrmTask, AlreadyConvertedError,
  authorizeMeetingCandidatesForEvent,
} from '~~/server/utils/crm/meetingBridge'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['opportunity', 'person', 'company']),
  target_id: z.string().uuid(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
})

interface ActionItemWithMeetingTitle {
  id: string
  meeting_session_id: string
  meeting_title: string
  source_artifact_id: string | null
  content: string
  due_at: string | null
  crm_task_id: string | null
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const actionItemId = getRouterParam(event, 'actionItemId')
  if (!actionItemId) throw createError({ statusCode: 400, statusMessage: 'actionItemId required' })
  const body = Body.parse(await readBody(event))

  // Office-membership scoped: meeting action-item content is office-private, so a
  // non-member resolves to 404 (same as not-found — doesn't leak existence).
  const actionItem = await queryOne<ActionItemWithMeetingTitle>(
    `SELECT omai.id, omai.meeting_session_id, omai.source_artifact_id, omai.content,
            omai.due_at, omai.crm_task_id, oms.title AS meeting_title
     FROM office_meeting_action_items omai
     JOIN office_meeting_sessions oms ON oms.id = omai.meeting_session_id
     WHERE omai.id = $1
       AND omai.office_id IN (SELECT office_id FROM office_members WHERE user_id = $2)`,
    [actionItemId, user.id],
  )
  if (!actionItem) throw createError({ statusCode: 404, statusMessage: 'Action item not found' })

  // Guard: the chosen target must be one the resolver proposed for this meeting.
  const candidates = await authorizeMeetingCandidatesForEvent(event, await findMeetingCrmCandidates(actionItem.meeting_session_id))
  const proposals = rankTargets(candidates)
  if (!isTargetInCandidates(proposals, body)) {
    throw createError({ statusCode: 400, statusMessage: 'Chosen target is not a valid candidate for this meeting' })
  }
  const context = await resolveAgencyCrmSearchContext(event, { clientId: body.client_id, surface: 'agency_global' })

  try {
    return await convertActionItemToCrmTask(
      {
        id: actionItem.id, meeting_session_id: actionItem.meeting_session_id,
        meeting_title: actionItem.meeting_title, source_artifact_id: actionItem.source_artifact_id,
        content: actionItem.content, due_at: actionItem.due_at, crm_task_id: actionItem.crm_task_id,
      },
      { client_id: body.client_id, target_type: body.target_type, target_id: body.target_id },
      { actor: context.actorId, mode: 'manual_crm', priority: body.priority, accessContext: context },
    )
  } catch (e) {
    if (e instanceof AlreadyConvertedError) {
      throw createError({ statusCode: 409, statusMessage: 'Action item already converted to a CRM task' })
    }
    throw e
  }
})
