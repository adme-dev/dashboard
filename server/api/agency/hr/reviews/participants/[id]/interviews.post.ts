import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { getAppUrl } from '~~/server/utils/appUrl'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, transaction } from '~~/server/utils/db'
import { sendHrReviewLifecycleEmail } from '~~/server/utils/email'
import { createNotification } from '~~/server/utils/notifications'
import { canAccessHrParticipant } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { buildHrCalendarInvite } from '~~/server/utils/hr/schedule'

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

const Body = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().trim().min(2).max(80).default('Australia/Melbourne'),
  location: z.string().trim().max(500).optional(),
  agenda: z.string().trim().min(10).max(5000)
}).superRefine((value, context) => {
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) context.addIssue({ code: 'custom', path: ['endsAt'], message: 'Interview end must be after its start.' })
  if (Date.parse(value.endsAt) - Date.parse(value.startsAt) > 4 * 60 * 60 * 1000) context.addIssue({ code: 'custom', path: ['endsAt'], message: 'Interview duration cannot exceed four hours.' })
  if (!isValidTimeZone(value.timezone)) context.addIssue({ code: 'custom', path: ['timezone'], message: 'Timezone is not recognised.' })
})

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'id')
  if (!participantId || !/^[0-9a-f-]{36}$/i.test(participantId)) throw createError({ statusCode: 400, statusMessage: 'Invalid participant' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid interview schedule', data: { issues: parsed.error.issues } })
  const input = parsed.data
  if (Date.parse(input.startsAt) <= Date.now()) throw createError({ statusCode: 400, statusMessage: 'Interview must be scheduled in the future' })

  const result = await transaction(async (db) => {
    const participantResult = await db.query(
      `SELECT participant.id, participant.team_member_id, participant.reviewer_id, participant.cycle_id,
              member.name AS member_name, member.email AS member_email, cycle.name AS cycle_name,
              assignment.id AS assignment_id, response.status AS response_status
       FROM hr_review_participants participant
       JOIN team_members member ON member.id = participant.team_member_id
       JOIN hr_review_cycles cycle ON cycle.id = participant.cycle_id
       JOIN hr_questionnaire_assignments assignment ON assignment.participant_id = participant.id
       LEFT JOIN hr_responses response ON response.assignment_id = assignment.id
         AND response.respondent_id = participant.team_member_id
       WHERE participant.id = $1 FOR UPDATE OF participant`, [participantId]
    )
    const participant = participantResult.rows[0]
    if (!participant || !canAccessHrParticipant(user, {
      participantUserId: participant.team_member_id,
      reviewerIds: participant.reviewer_id ? [participant.reviewer_id] : []
    }, 'score')) throw createError({ statusCode: 403, statusMessage: 'Only the assigned reviewer may schedule an interview' })
    if (!['submitted', 'locked'].includes(participant.response_status)) {
      throw createError({ statusCode: 409, statusMessage: 'A submitted response is required before scheduling an interview' })
    }

    const existingResult = await db.query(
      `SELECT id, calendar_uid, calendar_sequence FROM hr_review_interviews
       WHERE participant_id = $1 AND status = 'scheduled' FOR UPDATE`, [participantId]
    )
    const existing = existingResult.rows[0]
    const newInterviewId = crypto.randomUUID()
    const calendarUid = existing?.calendar_uid || `hr-interview-${newInterviewId}@xeroflow.agency`
    const interviewResult = existing
      ? await db.query(
          `UPDATE hr_review_interviews
           SET starts_at = $2, ends_at = $3, timezone = $4, location = $5, agenda = $6,
               calendar_sequence = calendar_sequence + 1, updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [existing.id, input.startsAt, input.endsAt, input.timezone, input.location || null, input.agenda]
        )
      : await db.query(
          `INSERT INTO hr_review_interviews
            (id, participant_id, starts_at, ends_at, timezone, location, agenda, calendar_uid, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [newInterviewId, participantId, input.startsAt, input.endsAt, input.timezone, input.location || null, input.agenda, calendarUid, user.id]
        )
    const interview = interviewResult.rows[0]
    await recordHrAuditEvent({
      actorId: user.id,
      action: existing ? 'review_interview.rescheduled' : 'review_interview.scheduled',
      targetType: 'review_interview', targetId: interview.id, cycleId: participant.cycle_id,
      metadata: { startsAt: input.startsAt, endsAt: input.endsAt, calendarSequence: interview.calendar_sequence }
    }, db)
    return { interview, participant }
  })

  const assignmentUrl = `${getAppUrl(event)}/agency/hr`
  const calendarInvite = buildHrCalendarInvite({
    uid: result.interview.calendar_uid, method: 'REQUEST', startsAt: input.startsAt, endsAt: input.endsAt,
    timezone: input.timezone, summary: `${result.participant.cycle_name} follow-up interview`,
    description: input.agenda, url: assignmentUrl, sequence: result.interview.calendar_sequence
  })
  const startLabel = new Intl.DateTimeFormat('en-AU', { dateStyle: 'full', timeStyle: 'short', timeZone: input.timezone }).format(new Date(input.startsAt))
  const message = `Your follow-up interview is scheduled for ${startLabel}${input.location ? ` at ${input.location}` : ''}.`
  const deliveryKey = `interview:${result.interview.calendar_sequence}:${input.startsAt}`
  const failures: string[] = []
  try {
    await createNotification({
      userId: result.participant.team_member_id, actorId: user.id, type: 'hr_review_interview',
      title: 'Business review interview scheduled', message, link: '/agency/hr', reason: 'direct',
      metadata: { interviewId: result.interview.id, participantId }
    })
    await queryOne(`INSERT INTO hr_notification_deliveries
      (assignment_id, recipient_id, channel, kind, delivery_key, status, sent_at)
      VALUES ($1, $2, 'in_app', 'interview', $3, 'sent', NOW()) RETURNING id`,
    [result.participant.assignment_id, result.participant.team_member_id, deliveryKey])
  } catch { failures.push('in_app') }
  try {
    const sent = await sendHrReviewLifecycleEmail({
      to: result.participant.member_email, name: result.participant.member_name,
      cycleName: result.participant.cycle_name, action: 'interview', message,
      assignmentUrl, calendarInvite
    }, event)
    for (const channel of ['email', 'calendar']) await queryOne(`INSERT INTO hr_notification_deliveries
      (assignment_id, recipient_id, channel, kind, delivery_key, status, sent_at, error_code)
      VALUES ($1, $2, $3, 'interview', $4, $5,
              CASE WHEN $5 = 'sent' THEN NOW() ELSE NULL END,
              CASE WHEN $5 = 'failed' THEN 'email_not_configured' ELSE NULL END) RETURNING id`,
    [result.participant.assignment_id, result.participant.team_member_id, channel, deliveryKey, sent ? 'sent' : 'failed'])
    if (!sent) failures.push('email', 'calendar')
  } catch { failures.push('email', 'calendar') }
  return { ok: true, interview: result.interview, deliveryFailures: failures }
})
