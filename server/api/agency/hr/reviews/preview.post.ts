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

function parseJsonArray<T>(value: T[] | string): T[] {
  if (Array.isArray(value)) return value
  try { return JSON.parse(value || '[]') } catch { return [] }
}

function normalizeSourceRefs(value: unknown[] | string): string[] {
  return parseJsonArray<unknown>(value).map(reference => {
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

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)
  const parsed = hrReviewCycleDraftSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid review-cycle preview', data: { issues: parsed.error.issues } })
  const schedule = validateHrSchedule(parsed.data)
  if (schedule.isValid === false) throw createError({ statusCode: 400, statusMessage: `Invalid review schedule: ${schedule.code}` })

  const sources = await queryRows<PreviewSource>(
    `SELECT member.id AS "teamMemberId", member.name AS "memberName", member.email AS "memberEmail",
            role_version.id AS "roleProfileVersionId", role.title AS "roleTitle",
            questionnaire.questions, questionnaire.source_refs AS "sourceRefs"
       FROM hr_role_profile_versions role_version
       JOIN hr_role_profiles role ON role.id = role_version.role_profile_id
       JOIN team_members member ON member.id = ANY($2::uuid[]) AND member.is_active = true
       JOIN LATERAL (
         SELECT questions, source_refs FROM hr_questionnaire_versions candidate
          WHERE candidate.template_key = 'role-' || role.id::text AND candidate.status = 'published'
          ORDER BY candidate.version DESC LIMIT 1
       ) questionnaire ON true
      WHERE role_version.id = ANY($1::uuid[]) AND role_version.status = 'published' AND role.status = 'active'`,
    [parsed.data.participants.map(item => item.roleProfileVersionId), parsed.data.participants.map(item => item.teamMemberId)],
  )
  const byPair = new Map(sources.map(source => [`${source.teamMemberId}:${source.roleProfileVersionId}`, source]))

  const recipients = parsed.data.participants.map(participant => {
    const source = byPair.get(`${participant.teamMemberId}:${participant.roleProfileVersionId}`)
    if (!source) throw createError({ statusCode: 409, statusMessage: 'Every participant requires an active member, published role and published questionnaire' })
    const roleSource = `role-version:${source.roleProfileVersionId}`
    const inheritedRefs = normalizeSourceRefs(source.sourceRefs)
    return {
      ...participant,
      memberName: source.memberName,
      memberEmail: source.memberEmail,
      roleTitle: source.roleTitle,
      questions: parseJsonArray<HrQuestion>(source.questions).map(question => ({
        ...question,
        recommendationReason: question.module === 'role'
          ? `Checks the acknowledged responsibility: ${question.responsibility || 'role responsibility'}.`
          : question.module === 'blockers'
            ? 'Invites balanced operational context about barriers and support.'
            : 'Provides a consistent business-review baseline across roles.',
        sourceRefs: [...new Set([roleSource, ...inheritedRefs])],
      })),
    }
  })

  return {
    previewOnly: true,
    cycle: { name: parsed.data.name, purpose: parsed.data.purpose, timezone: parsed.data.timezone, opensAt: parsed.data.opensAt, dueAt: parsed.data.dueAt, closesAt: parsed.data.closesAt },
    recipients,
    delivery: { channels: ['in_app', 'email', 'calendar'], sendsOnApproval: true },
    visibility: 'Participant and authorised HR; reviewers see submitted answers only.',
  }
})
