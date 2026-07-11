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

const Body = z.object({
  status: z.enum(['completed', 'cancelled']),
  participantSummary: z.string().trim().max(5000).optional(),
  privateNotes: z.string().trim().max(10000).optional(),
  expectedCalendarSequence: z.number().int().min(0)
}).superRefine((input, context) => {
  if (input.status === 'completed' && (!input.participantSummary || input.participantSummary.length < 10)) {
    context.addIssue({ code: 'custom', path: ['participantSummary'], message: 'A factual participant-visible summary is required.' })
  }
})

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const interviewId = getRouterParam(event, 'id')
  if (!interviewId || !/^[0-9a-f-]{36}$/i.test(interviewId)) throw createError({ statusCode: 400, statusMessage: 'Invalid interview' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid interview update', data: { issues: parsed.error.issues } })
  const input = parsed.data

  const result = await transaction(async (db) => {
    const rowResult = await db.query(
      `SELECT interview.*, participant.team_member_id, participant.reviewer_id, participant.cycle_id,
              member.name AS member_name, member.email AS member_email, cycle.name AS cycle_name,
              assignment.id AS assignment_id
       FROM hr_review_interviews interview
       JOIN hr_review_participants participant ON participant.id = interview.participant_id
       JOIN team_members member ON member.id = participant.team_member_id
       JOIN hr_review_cycles cycle ON cycle.id = participant.cycle_id
       JOIN hr_questionnaire_assignments assignment ON assignment.participant_id = participant.id
       WHERE interview.id = $1 FOR UPDATE OF interview`, [interviewId]
    )
    const row = rowResult.rows[0]
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Interview not found' })
    if (!canAccessHrParticipant(user, {
      participantUserId: row.team_member_id,
      reviewerIds: row.reviewer_id ? [row.reviewer_id] : []
    }, 'score')) throw createError({ statusCode: 403, statusMessage: 'Only the assigned reviewer may update this interview' })
    if (row.status !== 'scheduled') throw createError({ statusCode: 409, statusMessage: 'This interview is already closed' })
    if (input.status === 'completed' && Date.parse(row.starts_at) > Date.now()) throw createError({ statusCode: 409, statusMessage: 'A future interview cannot be marked completed' })
    if (row.calendar_sequence !== input.expectedCalendarSequence) throw createError({ statusCode: 409, statusMessage: 'The interview changed. Refresh before trying again.' })
    const updatedResult = await db.query(
      `UPDATE hr_review_interviews
       SET status = $2, participant_summary = $3, private_notes = $4,
           completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE NULL END,
           cancelled_at = CASE WHEN $2 = 'cancelled' THEN NOW() ELSE NULL END,
           calendar_sequence = calendar_sequence + 1, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [interviewId, input.status, input.participantSummary || null, input.privateNotes || null]
    )
    const interview = updatedResult.rows[0]
    await recordHrAuditEvent({
      actorId: user.id, action: `review_interview.${input.status}`,
      targetType: 'review_interview', targetId: interview.id, cycleId: row.cycle_id,
      metadata: { calendarSequence: interview.calendar_sequence, hasPrivateNotes: Boolean(input.privateNotes) }
    }, db)
    return { interview, row }
  })

  const method = input.status === 'cancelled' ? 'CANCEL' : 'REQUEST'
  const calendarInvite = buildHrCalendarInvite({
    uid: result.interview.calendar_uid,
    method: input.status === 'cancelled' ? 'CANCEL' : 'REQUEST',
    startsAt: new Date(result.interview.starts_at).toISOString(),
    endsAt: new Date(result.interview.ends_at).toISOString(), timezone: result.interview.timezone,
    summary: `${result.row.cycle_name} follow-up interview`, description: result.interview.agenda,
    url: `${getAppUrl(event)}/agency/hr`, sequence: result.interview.calendar_sequence
  })
  if (method === 'CANCEL') {
    const message = 'Your business review interview has been cancelled.'
    const deliveryKey = `interview-cancelled:${result.interview.calendar_sequence}`
    await createNotification({
      userId: result.row.team_member_id,
      actorId: user.id,
      type: 'hr_review_interview_cancelled',
      title: 'Business review interview cancelled',
      message,
      link: '/agency/hr',
      reason: 'direct',
      metadata: { interviewId, participantId: result.interview.participant_id }
    }).then(() => queryOne(
      `INSERT INTO hr_notification_deliveries
        (assignment_id, recipient_id, channel, kind, delivery_key, status, sent_at)
       VALUES ($1, $2, 'in_app', 'interview', $3, 'sent', NOW())
       ON CONFLICT (assignment_id, recipient_id, channel, kind, delivery_key) DO NOTHING
       RETURNING id`,
      [result.row.assignment_id, result.row.team_member_id, deliveryKey]
    )).catch(() => {})
    await sendHrReviewLifecycleEmail({
      to: result.row.member_email, name: result.row.member_name, cycleName: result.row.cycle_name,
      action: 'interview_cancelled', message,
      assignmentUrl: `${getAppUrl(event)}/agency/hr`, calendarInvite, calendarMethod: 'CANCEL'
    }, event).then(async (sent) => {
      for (const channel of ['email', 'calendar']) await queryOne(
        `INSERT INTO hr_notification_deliveries
          (assignment_id, recipient_id, channel, kind, delivery_key, status, sent_at, error_code)
         VALUES ($1, $2, $3, 'interview', $4, $5,
                 CASE WHEN $5 = 'sent' THEN NOW() ELSE NULL END,
                 CASE WHEN $5 = 'failed' THEN 'email_not_configured' ELSE NULL END)
         ON CONFLICT (assignment_id, recipient_id, channel, kind, delivery_key) DO NOTHING
         RETURNING id`,
        [result.row.assignment_id, result.row.team_member_id, channel, deliveryKey, sent ? 'sent' : 'failed']
      )
    }).catch(() => false)
  } else {
    await createNotification({
      userId: result.row.team_member_id,
      actorId: user.id,
      type: 'hr_review_interview_completed',
      title: 'Interview summary available',
      message: 'The factual summary from your business review interview is available in your review.',
      link: '/agency/hr',
      reason: 'direct',
      metadata: { interviewId, participantId: result.interview.participant_id }
    }).catch(() => {})
  }
  return { ok: true, interview: result.interview }
})
