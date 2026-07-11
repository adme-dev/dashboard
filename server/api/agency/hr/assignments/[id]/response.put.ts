import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, transaction } from '~~/server/utils/db'
import { canAccessHrParticipant } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { validateHrAnswers, type HrAnswers } from '~~/server/utils/hr/responses'

const Body = z.object({
  status: z.enum(['draft', 'submitted']),
  answers: z.record(z.string(), z.union([z.string().max(5000), z.array(z.string().max(200)).max(30)])),
})

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const assignmentId = getRouterParam(event, 'id')
  if (!assignmentId || !/^[0-9a-f-]{36}$/i.test(assignmentId)) throw createError({ statusCode: 400, statusMessage: 'Invalid assignment' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid questionnaire response' })

  const assignment = await queryOne<any>(
    `SELECT qa.id, qa.status, participant.id AS participant_id,
            participant.team_member_id, participant.reviewer_id,
            participant.cycle_id, cycle.closes_at, qv.questions,
            response.status AS response_status
     FROM hr_questionnaire_assignments qa
     JOIN hr_review_participants participant ON participant.id = qa.participant_id
     JOIN hr_review_cycles cycle ON cycle.id = participant.cycle_id
     JOIN hr_questionnaire_versions qv ON qv.id = qa.questionnaire_version_id
     LEFT JOIN hr_responses response ON response.assignment_id = qa.id
       AND response.respondent_id = participant.team_member_id
     WHERE qa.id = $1`,
    [assignmentId],
  )
  if (!assignment) throw createError({ statusCode: 404, statusMessage: 'Assignment not found' })
  if (!canAccessHrParticipant(user, {
    participantUserId: assignment.team_member_id,
    reviewerIds: assignment.reviewer_id ? [assignment.reviewer_id] : [],
  }, 'edit-own-response')) throw createError({ statusCode: 403, statusMessage: 'Only the participant can update this response' })
  if (assignment.response_status === 'submitted') throw createError({ statusCode: 409, statusMessage: 'This response has already been submitted' })
  if (Date.now() > Date.parse(assignment.closes_at)) throw createError({ statusCode: 409, statusMessage: 'This review cycle is closed' })

  const validation = validateHrAnswers(assignment.questions, parsed.data.answers as HrAnswers, parsed.data.status === 'submitted')
  if (!validation.isValid) throw createError({ statusCode: 400, statusMessage: 'Please review the highlighted answers', data: { issues: validation.issues } })

  const response = await transaction(async (db) => {
    const responseResult = await db.query(
      `INSERT INTO hr_responses (assignment_id, respondent_id, status, answers, submitted_at)
     VALUES ($1, $2, $3, $4::jsonb, CASE WHEN $3 = 'submitted' THEN NOW() ELSE NULL END)
     ON CONFLICT (assignment_id, respondent_id)
     DO UPDATE SET status = EXCLUDED.status,
                   answers = EXCLUDED.answers,
                   submitted_at = CASE WHEN EXCLUDED.status = 'submitted' THEN NOW() ELSE NULL END,
                   updated_at = NOW()
     RETURNING id, status, submitted_at, updated_at`,
      [assignment.id, user.id, parsed.data.status, JSON.stringify(parsed.data.answers)],
    )
    const saved = responseResult.rows[0]
    await db.query(
      `UPDATE hr_questionnaire_assignments
     SET status = $2, updated_at = NOW(), notified_at = COALESCE(notified_at, NOW())
     WHERE id = $1`,
      [assignment.id, parsed.data.status === 'submitted' ? 'submitted' : 'in_progress'],
    )
    await db.query(
      `UPDATE hr_review_participants SET status = $2, updated_at = NOW() WHERE id = $1`,
      [assignment.participant_id, parsed.data.status === 'submitted' ? 'submitted' : 'in_progress'],
    )
    await recordHrAuditEvent({
      actorId: user.id,
      action: parsed.data.status === 'submitted' ? 'questionnaire_response.submitted' : 'questionnaire_response.saved',
      targetType: 'questionnaire_response',
      targetId: saved.id,
      cycleId: assignment.cycle_id,
      metadata: { answerCount: Object.keys(parsed.data.answers).length },
    }, db)
    return saved
  })

  return { ok: true, response }
})
