/**
 * GET /api/office/:officeId/meetings/:meetingId/artifacts
 * List artifacts for a meeting session.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import type { OfficeMeetingArtifactRow, OfficeMemberRow } from '~~/app/types/office'

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
  const meeting = await queryOne<{ id: string }>(
    `SELECT id FROM office_meeting_sessions WHERE id = $1 AND office_id = $2`,
    [meetingId, officeId]
  )
  if (!meeting) {
    throw createError({ statusCode: 404, statusMessage: 'Meeting session not found' })
  }

  const artifacts = await queryRows<OfficeMeetingArtifactRow>(
    `SELECT *
     FROM office_meeting_artifacts
     WHERE meeting_session_id = $1
     ORDER BY
       CASE metadata->>'system_event'
         WHEN 'guest_intake' THEN 0
         WHEN 'meeting_closeout' THEN 7
         ELSE 1
       END,
       CASE artifact_type
         WHEN 'notes' THEN 1
         WHEN 'summary' THEN 2
         WHEN 'action_items' THEN 3
         WHEN 'transcript' THEN 4
         WHEN 'recording' THEN 5
         ELSE 6
       END,
       created_at DESC`,
    [meetingId]
  )

  return { artifacts }
})
