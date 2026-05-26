/**
 * PATCH /api/office/:officeId/meetings/:meetingId/artifacts/:artifactId
 * Update a meeting artifact title/content/metadata.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import type { OfficeMeetingArtifactRow, OfficeMemberRow } from '~~/app/types/office'

const Body = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  content: z.string().max(200_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})

function parseMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function isSystemMetadata(value: unknown) {
  const metadata = parseMetadata(value)
  return metadata.status === 'system' || typeof metadata.system_event === 'string'
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const meetingId = getRouterParam(event, 'meetingId')
  const artifactId = getRouterParam(event, 'artifactId')
  if (!officeId || !meetingId || !artifactId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId, meetingId, and artifactId are required' })
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
  if (body.metadata && isSystemMetadata(body.metadata)) {
    throw createError({ statusCode: 400, statusMessage: 'System artifact metadata cannot be set through this endpoint' })
  }

  const currentArtifact = await queryOne<Pick<OfficeMeetingArtifactRow, 'id' | 'metadata'>>(
    `SELECT oma.id, oma.metadata
     FROM office_meeting_artifacts oma
     JOIN office_meeting_sessions oms ON oms.id = oma.meeting_session_id
     WHERE oma.id = $1
       AND oma.meeting_session_id = $2
       AND oms.office_id = $3`,
    [artifactId, meetingId, officeId]
  )
  if (!currentArtifact) {
    throw createError({ statusCode: 404, statusMessage: 'Meeting artifact not found' })
  }
  if (isSystemMetadata(currentArtifact.metadata)) {
    throw createError({ statusCode: 409, statusMessage: 'System artifacts cannot be edited' })
  }

  const artifact = await queryOne<OfficeMeetingArtifactRow>(
    `UPDATE office_meeting_artifacts oma
     SET title = COALESCE($1, oma.title),
         content = COALESCE($2, oma.content),
         metadata = COALESCE($3, oma.metadata)
     FROM office_meeting_sessions oms
     WHERE oma.id = $4
       AND oma.meeting_session_id = $5
       AND oms.id = oma.meeting_session_id
       AND oms.office_id = $6
     RETURNING oma.*`,
    [
      body.title ?? null,
      body.content ?? null,
      body.metadata ? JSON.stringify(body.metadata) : null,
      artifactId,
      meetingId,
      officeId
    ]
  )

  if (!artifact) {
    throw createError({ statusCode: 404, statusMessage: 'Meeting artifact not found' })
  }

  return { artifact }
})
