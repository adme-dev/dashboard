/**
 * POST /api/office/:officeId/meetings/search
 * Answers a question across recent meeting artifacts for an office.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import type { OfficeMeetingArtifactRow, OfficeMemberRow } from '~~/app/types/office'

const Body = z.object({
  question: z.string().trim().min(3).max(800)
})

type MeetingMemoryArtifact = OfficeMeetingArtifactRow & {
  meeting_title: string
  meeting_status: string
  zone_name: string | null
}

function artifactRank(type: OfficeMeetingArtifactRow['artifact_type']) {
  if (type === 'summary') return 0
  if (type === 'action_items') return 1
  if (type === 'notes') return 2
  if (type === 'transcript') return 3
  return 4
}

function excerpt(value: string, limit = 360) {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length <= limit ? cleaned : `${cleaned.slice(0, limit).trim()}...`
}

function contextBlock(artifact: MeetingMemoryArtifact, index: number) {
  return [
    `[${index + 1}] ${artifact.meeting_title} / ${artifact.title} (${artifact.artifact_type})`,
    artifact.zone_name ? `Room: ${artifact.zone_name}` : '',
    artifact.content.trim().slice(0, artifact.artifact_type === 'transcript' ? 10_000 : 4_000)
  ].filter(Boolean).join('\n')
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
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
  const artifacts = await queryRows<MeetingMemoryArtifact>(
    `SELECT oma.*,
            oms.title AS meeting_title,
            oms.status AS meeting_status,
            oz.name AS zone_name
     FROM office_meeting_artifacts oma
     JOIN office_meeting_sessions oms ON oms.id = oma.meeting_session_id
     LEFT JOIN office_zones oz ON oz.id = oms.zone_id
     WHERE oms.office_id = $1
       AND NULLIF(trim(oma.content), '') IS NOT NULL
       AND oma.artifact_type IN ('summary', 'action_items', 'notes', 'transcript')
     ORDER BY oma.created_at DESC
     LIMIT 24`,
    [officeId]
  )

  const usableArtifacts = artifacts
    .slice()
    .sort((a, b) => artifactRank(a.artifact_type) - artifactRank(b.artifact_type))
    .slice(0, 12)

  if (!usableArtifacts.length) {
    throw createError({ statusCode: 400, statusMessage: 'No meeting artifacts are available to search yet' })
  }

  const answer = await generateGroqInsight(
    [
      `Question: ${body.question}`,
      '',
      'Recent meeting artifacts:',
      usableArtifacts.map(contextBlock).join('\n\n---\n\n'),
      '',
      'Answer using only these meeting artifacts.',
      'Synthesize across meetings when useful, and cite source numbers like [1].',
      'If the artifacts are insufficient, say what is missing.'
    ].join('\n'),
    {
      model: GROQ_MODELS.LLAMA_70B,
      temperature: 0.05,
      maxTokens: 1100,
      systemPrompt: 'You answer questions across recent business meeting artifacts. Use only supplied artifacts and do not invent facts.'
    }
  )

  return {
    answer: answer.trim(),
    sources: usableArtifacts.slice(0, 6).map(artifact => ({
      id: artifact.id,
      meeting_id: artifact.meeting_session_id,
      meeting_title: artifact.meeting_title,
      title: artifact.title,
      artifact_type: artifact.artifact_type,
      excerpt: excerpt(artifact.content)
    }))
  }
})
