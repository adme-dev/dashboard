// server/api/crm/meeting-actions/[actionItemId]/convert.post.ts
// Convert a meeting action item into a CRM task against an in-context CRM target
// (the record the operator is viewing). Validates the chosen target is one the
// resolver actually proposed for this meeting (no cross-tenant injection).
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  findMeetingCrmCandidates, rankTargets, convertActionItemToCrmTask, AlreadyConvertedError,
} from '~~/server/utils/crm/meetingBridge'

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

  const actionItem = await queryOne<ActionItemWithMeetingTitle>(
    `SELECT omai.id, omai.meeting_session_id, omai.source_artifact_id, omai.content,
            omai.due_at, omai.crm_task_id, oms.title AS meeting_title
     FROM office_meeting_action_items omai
     JOIN office_meeting_sessions oms ON oms.id = omai.meeting_session_id
     WHERE omai.id = $1`,
    [actionItemId],
  )
  if (!actionItem) throw createError({ statusCode: 404, statusMessage: 'Action item not found' })

  // Guard: the chosen target must be one the resolver proposed for this meeting.
  const proposals = rankTargets(await findMeetingCrmCandidates(actionItem.meeting_session_id))
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
      { actor: user.id, mode: 'manual_crm', priority: body.priority },
    )
  } catch (e) {
    if (e instanceof AlreadyConvertedError) {
      throw createError({ statusCode: 409, statusMessage: 'Action item already converted to a CRM task' })
    }
    throw e
  }
})
