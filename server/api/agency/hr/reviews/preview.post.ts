import { createError, readBody, setHeader } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { validateHrSchedule } from '~~/server/utils/hr/schedule'
import { hrReviewCycleDraftSchema } from '~~/server/utils/hr/schemas'
import type { HrQuestion } from '~~/server/utils/hr/questionnaire'

type PreviewSource = {
  teamMemberId: string
  memberName: string
  memberEmail: string
  roleProfileVersionId: string
  roleTitle: string
  questions: HrQuestion[] | string
  sourceRefs: unknown[] | string
}

type KnowledgeContext = {
  id: string
  entryType: string
  title: string
  content: string
  sourceRefs: Record<string, unknown>[] | string
  limitations: string[] | string
}

function parseJsonArray<T>(value: T[] | string): T[] {
  if (Array.isArray(value)) return value
  try {
    return JSON.parse(value || '[]')
  } catch {
    return []
  }
}

function normalizeSourceRefs(value: unknown[] | string): string[] {
  return parseJsonArray<unknown>(value).map((reference) => {
    if (typeof reference === 'string') return reference
    if (reference && typeof reference === 'object') {
      const record = reference as Record<string, unknown>
      const key = String(record.framework_key || record.frameworkKey || record.name || 'benchmark')
      const version = String(record.version || 'current')
      return `benchmark:${key}:${version}`
    }
    return 'benchmark:unknown:current'
  })
}

function relevantKnowledgeForRole(records: KnowledgeContext[], roleProfileVersionId: string) {
  const universalTypes = new Set(['business_context', 'question_bank', 'policy_standard', 'evidence_definition', 'limitation', 'privacy_notice'])
  return records
    .filter((record) => {
      if (universalTypes.has(record.entryType)) return true
      return parseJsonArray<Record<string, unknown>>(record.sourceRefs).some((reference) => String(reference.sourceId || '') === roleProfileVersionId)
    })
    .map((record) => ({
      id: record.id,
      entryType: record.entryType,
      title: record.title,
      content: record.content,
      sourceRefs: parseJsonArray(record.sourceRefs),
      limitations: parseJsonArray<string>(record.limitations),
      use: 'Owner-only questionnaire design context; not employee evidence or an automatic finding.',
    }))
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)
  const parsed = hrReviewCycleDraftSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid review-cycle preview',
      data: { issues: parsed.error.issues },
    })
  const schedule = validateHrSchedule(parsed.data)
  if (schedule.isValid === false)
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid review schedule: ${schedule.code}`,
    })

  const [sources, knowledgeContext] = await Promise.all([
    queryRows<PreviewSource>(
      `SELECT member.id AS "teamMemberId", member.name AS "memberName", member.email AS "memberEmail",
            role_version.id AS "roleProfileVersionId", role.title AS "roleTitle",
            questionnaire.questions, questionnaire.source_refs AS "sourceRefs"
       FROM hr_role_profile_versions role_version
       JOIN hr_role_profiles role ON role.id = role_version.role_profile_id
       JOIN hr_role_assignments assignment
         ON assignment.role_profile_version_id = role_version.id
        AND assignment.effective_to IS NULL
        AND assignment.acknowledgement_status = 'acknowledged'
        AND assignment.scorecard_version_id IS NOT NULL
       JOIN team_members member
         ON member.id = assignment.team_member_id
        AND member.id = ANY($2::uuid[])
        AND member.is_active = true
       JOIN LATERAL (
         SELECT questions, source_refs FROM hr_questionnaire_versions candidate
          WHERE candidate.template_key = 'role-' || role.id::text AND candidate.status = 'published'
          ORDER BY candidate.version DESC LIMIT 1
       ) questionnaire ON true
      WHERE role_version.id = ANY($1::uuid[]) AND role_version.status = 'published' AND role.status = 'active'`,
      [parsed.data.participants.map((item) => item.roleProfileVersionId), parsed.data.participants.map((item) => item.teamMemberId)],
    ),
    queryRows<KnowledgeContext>(
      `SELECT knowledge.id, knowledge.entry_type AS "entryType", knowledge.title,
            version.content, version.source_refs AS "sourceRefs", version.limitations
       FROM hr_knowledge_entries knowledge
       JOIN hr_knowledge_entry_versions version ON version.entry_id = knowledge.id
      WHERE version.status = 'approved'
        AND version.general_ai_excluded = TRUE
        AND version.permitted_uses @> '["questionnaire_design"]'::jsonb
        AND version.effective_from <= CURRENT_DATE
        AND version.review_due_at >= CURRENT_DATE
      ORDER BY knowledge.entry_type, knowledge.title
      LIMIT 100`,
    ),
  ])
  const byPair = new Map(sources.map((source) => [`${source.teamMemberId}:${source.roleProfileVersionId}`, source]))

  const recipients = parsed.data.participants.map((participant) => {
    const source = byPair.get(`${participant.teamMemberId}:${participant.roleProfileVersionId}`)
    if (!source)
      throw createError({
        statusCode: 409,
        statusMessage: 'Every participant requires an active member, acknowledged published role and scorecard, and published questionnaire',
      })
    const roleSource = `role-version:${source.roleProfileVersionId}`
    const inheritedRefs = normalizeSourceRefs(source.sourceRefs)
    return {
      ...participant,
      memberName: source.memberName,
      memberEmail: source.memberEmail,
      roleTitle: source.roleTitle,
      knowledgeContext: relevantKnowledgeForRole(knowledgeContext, source.roleProfileVersionId),
      questions: parseJsonArray<HrQuestion>(source.questions).map((question) => ({
        ...question,
        recommendationReason: question.module === 'role' ? `Checks the acknowledged responsibility: ${question.responsibility || 'role responsibility'}.` : question.module === 'blockers' ? 'Invites balanced operational context about barriers and support.' : 'Provides a consistent business-review baseline across roles.',
        sourceRefs: [...new Set([roleSource, ...inheritedRefs])],
      })),
    }
  })

  return {
    previewOnly: true,
    cycle: {
      name: parsed.data.name,
      purpose: parsed.data.purpose,
      timezone: parsed.data.timezone,
      opensAt: parsed.data.opensAt,
      dueAt: parsed.data.dueAt,
      closesAt: parsed.data.closesAt,
    },
    recipients,
    delivery: {
      channels: ['in_app', 'email', 'calendar'],
      sendsOnApproval: true,
    },
    visibility: 'Participant and authorised HR; reviewers see submitted answers only.',
  }
})
