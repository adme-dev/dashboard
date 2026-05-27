/**
 * Client Portal - Meeting Artifacts
 * GET /api/portal/meetings/:id/artifacts
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import type { OfficeMeetingArtifactRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const meetingId = getRouterParam(event, 'id')

  if (!meetingId) {
    throw createError({ statusCode: 400, statusMessage: 'Meeting ID is required' })
  }

  await ensureOfficeMeetingArtifactsTables()

  try {
    const meeting = await queryOne<{ id: string }>(`
      SELECT oms.id
      FROM office_members om
      JOIN office_meeting_sessions oms ON oms.office_id = om.office_id
      WHERE om.client_user_id = $1
        AND oms.id = $2
        AND oms.status <> 'cancelled'
    `, [clientUser.id, meetingId])

    if (!meeting) {
      throw createError({ statusCode: 404, statusMessage: 'Meeting not found' })
    }

    const artifacts = await queryRows<OfficeMeetingArtifactRow>(`
      SELECT *
      FROM office_meeting_artifacts
      WHERE meeting_session_id = $1
        AND artifact_type IN ('summary', 'action_items', 'notes', 'transcript')
      ORDER BY
        CASE artifact_type
          WHEN 'summary' THEN 0
          WHEN 'action_items' THEN 1
          WHEN 'notes' THEN 2
          WHEN 'transcript' THEN 3
          ELSE 4
        END,
        created_at DESC
    `, [meetingId])

    return {
      artifacts: artifacts.map(artifact => ({
        id: artifact.id,
        type: artifact.artifact_type,
        title: artifact.title,
        content: artifact.content,
        metadata: artifact.metadata || {},
        createdAt: artifact.created_at
      }))
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to fetch portal meeting artifacts:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch meeting artifacts' })
  }
})
