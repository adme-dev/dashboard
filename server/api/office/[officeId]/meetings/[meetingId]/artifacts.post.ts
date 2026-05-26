/**
 * POST /api/office/:officeId/meetings/:meetingId/artifacts
 * Attach notes, summaries, transcripts, action items, or recording metadata.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { createMeetingActionItemsFromArtifact, ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { ensureOfficeMeetingThreadChannel } from '~~/server/utils/officeThreads'
import type { OfficeMeetingArtifactRow, OfficeMemberRow } from '~~/app/types/office'

const Body = z.object({
  artifact_type: z.enum(['transcript', 'summary', 'recording', 'action_items', 'notes']),
  title: z.string().trim().min(1).max(160),
  content: z.string().max(200_000).default(''),
  metadata: z.record(z.string(), z.unknown()).default({})
})

function isSystemMetadata(value: Record<string, unknown>) {
  return value.status === 'system' || typeof value.system_event === 'string'
}

function artifactThreadContent(artifact: Pick<OfficeMeetingArtifactRow, 'artifact_type' | 'title' | 'content'>) {
  const typeLabel = artifact.artifact_type.replace('_', ' ')
  const snippet = artifact.content.trim().slice(0, 1200)
  return [
    `Saved ${typeLabel}: ${artifact.title}`,
    snippet
  ].filter(Boolean).join('\n\n')
}

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
  const body = Body.parse(await readBody(event))
  if (isSystemMetadata(body.metadata)) {
    throw createError({ statusCode: 400, statusMessage: 'System artifacts cannot be created through this endpoint' })
  }

  const artifact = await queryOne<OfficeMeetingArtifactRow>(
    `INSERT INTO office_meeting_artifacts (
       meeting_session_id, artifact_type, title, content, metadata, created_by
     )
     SELECT $1, $2, $3, $4, $5, $6
     WHERE EXISTS (
       SELECT 1 FROM office_meeting_sessions WHERE id = $1 AND office_id = $7
     )
     RETURNING *`,
    [
      meetingId,
      body.artifact_type,
      body.title,
      body.content,
      JSON.stringify(body.metadata),
      user.id,
      officeId
    ]
  )

  if (!artifact) {
    throw createError({ statusCode: 404, statusMessage: 'Meeting session not found' })
  }

  const actionItems = await createMeetingActionItemsFromArtifact({
    officeId,
    artifact,
    actorId: user.id
  })

  const channel = await ensureOfficeMeetingThreadChannel({
    officeId,
    meetingId,
    actorId: user.id
  })
  if (channel) {
    await queryOne(
      `INSERT INTO chat_messages (channel_id, user_id, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        channel.id,
        user.id,
        artifactThreadContent(artifact),
        JSON.stringify({
          source: 'office_meeting_artifact',
          meeting_id: meetingId,
          artifact_id: artifact.id,
          artifact_type: artifact.artifact_type,
          action_item_count: actionItems.length
        })
      ]
    )
  }

  return { artifact }
})
