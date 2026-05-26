/**
 * PATCH /api/office/:officeId/meetings/:meetingId/action-items/:actionItemId
 * Updates structured follow-up action lifecycle fields.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import type { OfficeMeetingActionItemRow, OfficeMemberRow } from '~~/app/types/office'

const Body = z.object({
  content: z.string().trim().min(1).max(2000).optional(),
  status: z.enum(['open', 'in_progress', 'done', 'dismissed']).optional(),
  assignee_user_id: z.string().uuid().nullable().optional(),
  due_at: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
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
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  await ensureOfficeMeetingArtifactsTables()
  const body = Body.parse(await readBody(event))
  const actionItem = await queryOne<OfficeMeetingActionItemRow>(
    `UPDATE office_meeting_action_items omai
     SET content = COALESCE($4, content),
         status = COALESCE($5, status),
         assignee_user_id = CASE WHEN $6::boolean THEN $7 ELSE assignee_user_id END,
         due_at = CASE WHEN $8::boolean THEN $9 ELSE due_at END,
         metadata = metadata || $10::jsonb,
         updated_at = now()
     WHERE omai.id = $1
       AND omai.office_id = $2
       AND omai.meeting_session_id = $3
       AND EXISTS (
         SELECT 1
         FROM office_meeting_sessions oms
         WHERE oms.id = omai.meeting_session_id
           AND oms.office_id = $2
       )
       AND (
         $7::uuid IS NULL
         OR EXISTS (
           SELECT 1
           FROM office_members om
           WHERE om.office_id = $2
             AND om.user_id = $7::uuid
         )
       )
     RETURNING *`,
    [
      actionItemId,
      officeId,
      meetingId,
      body.content ?? null,
      body.status ?? null,
      Object.hasOwn(body, 'assignee_user_id'),
      body.assignee_user_id ?? null,
      Object.hasOwn(body, 'due_at'),
      body.due_at ?? null,
      JSON.stringify(body.metadata ?? {})
    ]
  )

  if (!actionItem) {
    throw createError({ statusCode: 404, statusMessage: 'Action item not found or assignee is not in this office' })
  }

  return { actionItem }
})
