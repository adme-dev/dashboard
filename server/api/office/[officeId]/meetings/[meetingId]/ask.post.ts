/**
 * POST /api/office/:officeId/meetings/:meetingId/ask
 * Answers a question using only artifacts saved against one meeting session.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import type { OfficeMeetingArtifactRow, OfficeMemberRow } from '~~/app/types/office'

const Body = z.object({
  question: z.string().trim().min(3).max(800)
})

type MeetingQuestionSource = {
  id: string
  title: string
  artifact_type: OfficeMeetingArtifactRow['artifact_type']
  excerpt: string
}

function artifactPriority(type: OfficeMeetingArtifactRow['artifact_type']) {
  if (type === 'summary') return 0
  if (type === 'action_items') return 1
  if (type === 'notes') return 2
  if (type === 'transcript') return 3
  return 4
}

function excerpt(value: string, limit = 420) {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length <= limit ? cleaned : `${cleaned.slice(0, limit).trim()}...`
}

function contextBlock(artifact: OfficeMeetingArtifactRow, index: number) {
  return [
    `[${index + 1}] ${artifact.title} (${artifact.artifact_type})`,
    artifact.content.trim().slice(0, artifact.artifact_type === 'transcript' ? 14_000 : 6_000)
  ].join('\n')
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const meetingId = getRouterParam(event, 'meetingId')
  if (!officeId || !meetingId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and meetingId are required' })
  }

  const body = Body.parse(await readBody(event))
  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  await ensureOfficeMeetingArtifactsTables()
  const meeting = await queryOne<{ id: string, title: string }>(
    `SELECT id, title
     FROM office_meeting_sessions
     WHERE id = $1 AND office_id = $2`,
    [meetingId, officeId]
  )
  if (!meeting) {
    throw createError({ statusCode: 404, statusMessage: 'Meeting session not found' })
  }

  const artifacts = await queryRows<OfficeMeetingArtifactRow>(
    `SELECT *
     FROM office_meeting_artifacts
     WHERE meeting_session_id = $1
       AND NULLIF(trim(content), '') IS NOT NULL
       AND artifact_type IN ('summary', 'action_items', 'notes', 'transcript')
     ORDER BY created_at DESC
     LIMIT 12`,
    [meetingId]
  )

  const usableArtifacts = artifacts
    .slice()
    .sort((a, b) => artifactPriority(a.artifact_type) - artifactPriority(b.artifact_type))
  if (!usableArtifacts.length) {
    throw createError({ statusCode: 400, statusMessage: 'Add notes, a summary, or a transcript before asking this meeting' })
  }

  const answer = await generateModelRoutedGroqInsight(
    [
      `Meeting: ${meeting.title}`,
      `Question: ${body.question}`,
      '',
      'Meeting artifacts:',
      usableArtifacts.map(contextBlock).join('\n\n---\n\n'),
      '',
      'Answer the question using only these meeting artifacts.',
      'If the artifacts do not contain enough information, say what is missing.',
      'Keep the answer concise and include short source references like [1] where useful.'
    ].join('\n'),
    {
      defaultModelId: GROQ_MODELS.LLAMA_70B,
      temperature: 0.05,
      maxTokens: 900,
      featureKey: 'office_meeting_question_answer',
      userId: user.id,
      requestId: meetingId,
      metadata: {
        route: 'officeMeetingAsk',
        officeId,
        meetingId,
        artifactCount: usableArtifacts.length,
        sourceCount: Math.min(usableArtifacts.length, 5),
        questionChars: body.question.length,
      },
      systemPrompt: 'You answer questions about a single business meeting. Use only the supplied artifacts. Do not invent facts or use outside knowledge.'
    }
  )

  const sources: MeetingQuestionSource[] = usableArtifacts.slice(0, 5).map(artifact => ({
    id: artifact.id,
    title: artifact.title,
    artifact_type: artifact.artifact_type,
    excerpt: excerpt(artifact.content)
  }))

  return {
    answer: answer.trim(),
    sources
  }
})
