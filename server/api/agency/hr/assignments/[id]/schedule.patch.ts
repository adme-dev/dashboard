import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { getAppUrl } from '~~/server/utils/appUrl'
import { queryOne, transaction } from '~~/server/utils/db'
import { sendHrReviewLifecycleEmail } from '~~/server/utils/email'
import { createNotification } from '~~/server/utils/notifications'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { buildHrCalendarInvite, planHrAssignmentScheduleChange } from '~~/server/utils/hr/schedule'
import { hrAssignmentScheduleChangeSchema } from '~~/server/utils/hr/schemas'

type AssignmentRecord = {
  id: string
  participant_id: string
  team_member_id: string
  member_name: string
  member_email: string
  cycle_id: string
  cycle_name: string
  timezone: string
  closes_at: string
  due_at: string
  extension_due_at: string | null
  calendar_uid: string
  calendar_sequence: number
  assignment_status: string
  response_status: string | null
}

const actionLabels = {
  extend: 'extension',
  reschedule: 'reschedule',
  cancel: 'cancel',
  reopen: 'reopen'
} as const

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const assignmentId = getRouterParam(event, 'id')
  if (!assignmentId || !/^[0-9a-f-]{36}$/i.test(assignmentId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid assignment' })
  }
  const parsed = hrAssignmentScheduleChangeSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid schedule change', data: { issues: parsed.error.issues } })
  }
  const input = parsed.data

  const result = await transaction(async (db) => {
    const assignmentResult = await db.query<AssignmentRecord>(
      `SELECT assignment.id, assignment.participant_id, assignment.due_at::text,
              assignment.extension_due_at::text, assignment.calendar_uid,
              assignment.calendar_sequence, assignment.status AS assignment_status,
              participant.team_member_id, member.name AS member_name, member.email AS member_email,
              cycle.id AS cycle_id, cycle.name AS cycle_name, cycle.timezone,
              cycle.closes_at::text, response.status AS response_status
       FROM hr_questionnaire_assignments assignment
       JOIN hr_review_participants participant ON participant.id = assignment.participant_id
       JOIN hr_review_cycles cycle ON cycle.id = participant.cycle_id
       JOIN team_members member ON member.id = participant.team_member_id
       LEFT JOIN hr_responses response ON response.assignment_id = assignment.id
       WHERE assignment.id = $1
       FOR UPDATE OF assignment`,
      [assignmentId]
    )
    const assignment = assignmentResult.rows[0]
    if (!assignment) throw createError({ statusCode: 404, statusMessage: 'Assignment not found' })
    if (assignment.calendar_sequence !== input.expectedCalendarSequence) {
      throw createError({ statusCode: 409, statusMessage: 'The assignment changed. Refresh before trying again.' })
    }
    if (assignment.assignment_status === 'closed') {
      throw createError({ statusCode: 409, statusMessage: 'This assignment is already closed' })
    }
    if (Date.parse(assignment.closes_at) <= Date.now()) {
      throw createError({ statusCode: 409, statusMessage: 'The review cycle is already closed' })
    }
    if (input.dueAt && Date.parse(input.dueAt) <= Date.now()) {
      throw createError({ statusCode: 400, statusMessage: 'The replacement deadline must be in the future' })
    }
    if (input.action === 'reopen' && !['submitted', 'locked'].includes(assignment.response_status || '')) {
      throw createError({ statusCode: 409, statusMessage: 'Only a submitted response can be reopened' })
    }
    if (input.action !== 'reopen' && ['submitted', 'locked'].includes(assignment.response_status || '')) {
      throw createError({ statusCode: 409, statusMessage: 'Reopen the response before changing its deadline' })
    }

    const currentDueAt = assignment.extension_due_at || assignment.due_at
    const plan = planHrAssignmentScheduleChange({
      action: input.action === 'reopen' ? 'extend' : input.action,
      currentDueAt,
      closesAt: assignment.closes_at,
      dueAt: input.dueAt
    })
    if ('code' in plan) throw createError({ statusCode: 400, statusMessage: `Invalid schedule change: ${plan.code}` })

    const nextSequence = assignment.calendar_sequence + 1
    const calendarUid = assignment.calendar_uid || `hr-review-${assignment.cycle_id}-${assignment.team_member_id}@xeroflow.agency`
    if (input.action === 'cancel') {
      await db.query(
        `UPDATE hr_questionnaire_assignments
         SET status = 'closed', calendar_uid = $2,
             calendar_sequence = calendar_sequence + 1, updated_at = NOW()
         WHERE id = $1`, [assignment.id, calendarUid]
      )
      await db.query(`UPDATE hr_review_participants SET status = 'closed', updated_at = NOW() WHERE id = $1`, [assignment.participant_id])
    } else {
      const useExtension = input.action === 'extend' || input.action === 'reopen'
      await db.query(
        `UPDATE hr_questionnaire_assignments
         SET due_at = CASE WHEN $2 THEN due_at ELSE $3::timestamptz END,
             extension_due_at = CASE WHEN $2 THEN $3::timestamptz ELSE NULL END,
             status = 'open', calendar_uid = $4,
             calendar_sequence = calendar_sequence + 1, updated_at = NOW()
         WHERE id = $1`, [assignment.id, useExtension, plan.effectiveDueAt, calendarUid]
      )
      await db.query(`UPDATE hr_review_participants SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [assignment.participant_id])
      if (input.action === 'reopen') {
        await db.query(
          `UPDATE hr_responses
           SET status = 'draft', submitted_at = NULL, locked_at = NULL, updated_at = NOW()
           WHERE assignment_id = $1`, [assignment.id]
        )
      }
    }

    await recordHrAuditEvent({
      actorId: user.id,
      action: `questionnaire.${actionLabels[input.action]}`,
      targetType: 'questionnaire_assignment',
      targetId: assignment.id,
      cycleId: assignment.cycle_id,
      metadata: { reason: input.reason, effectiveDueAt: plan.effectiveDueAt, calendarSequence: nextSequence }
    }, db)
    return { assignment: { ...assignment, calendar_uid: calendarUid }, effectiveDueAt: plan.effectiveDueAt, nextSequence }
  })

  const lifecycleAction = actionLabels[input.action]
  const dueLabel = new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'full', timeStyle: 'short', timeZone: result.assignment.timezone
  }).format(new Date(result.effectiveDueAt))
  const message = input.action === 'cancel'
    ? `${result.assignment.cycle_name} has been cancelled. Reason: ${input.reason}`
    : `${result.assignment.cycle_name} is now due ${dueLabel}. Reason: ${input.reason}`
  const assignmentUrl = `${getAppUrl(event)}/agency/hr`
  const dueDate = new Date(result.effectiveDueAt)
  const calendarInvite = buildHrCalendarInvite({
    uid: result.assignment.calendar_uid,
    method: input.action === 'cancel' ? 'CANCEL' : 'REQUEST',
    startsAt: new Date(dueDate.getTime() - 15 * 60 * 1000).toISOString(),
    endsAt: dueDate.toISOString(),
    timezone: result.assignment.timezone,
    summary: `${result.assignment.cycle_name} due`,
    description: 'Complete your private business review. This entry contains no questionnaire answers.',
    url: assignmentUrl,
    sequence: result.nextSequence
  })
  const deliveryKey = `${lifecycleAction}:${result.nextSequence}:${result.effectiveDueAt}`
  const deliveryFailures: string[] = []

  try {
    await createNotification({
      userId: result.assignment.team_member_id,
      actorId: user.id,
      type: `hr_review_${lifecycleAction}`,
      title: input.action === 'cancel' ? 'Business review cancelled' : 'Business review deadline updated',
      message,
      link: '/agency/hr',
      reason: 'direct',
      metadata: { assignmentId, cycleId: result.assignment.cycle_id, dueAt: result.effectiveDueAt }
    })
    await queryOne(
      `INSERT INTO hr_notification_deliveries
        (assignment_id, recipient_id, channel, kind, delivery_key, status, sent_at)
       VALUES ($1, $2, 'in_app', $3, $4, 'sent', NOW()) RETURNING id`,
      [assignmentId, result.assignment.team_member_id, lifecycleAction, deliveryKey]
    )
  } catch { deliveryFailures.push('in_app') }

  try {
    const emailSent = await sendHrReviewLifecycleEmail({
      to: result.assignment.member_email,
      name: result.assignment.member_name,
      cycleName: result.assignment.cycle_name,
      action: lifecycleAction,
      message,
      assignmentUrl,
      calendarInvite
    }, event)
    const deliveryStatus = emailSent ? 'sent' : 'failed'
    await queryOne(
      `INSERT INTO hr_notification_deliveries
        (assignment_id, recipient_id, channel, kind, delivery_key, status, sent_at, error_code)
       VALUES ($1, $2, 'email', $3, $4, $5,
               CASE WHEN $5 = 'sent' THEN NOW() ELSE NULL END,
               CASE WHEN $5 = 'failed' THEN 'email_not_configured' ELSE NULL END) RETURNING id`,
      [assignmentId, result.assignment.team_member_id, lifecycleAction, deliveryKey, deliveryStatus]
    )
    await queryOne(
      `INSERT INTO hr_notification_deliveries
        (assignment_id, recipient_id, channel, kind, delivery_key, status, sent_at, error_code)
       VALUES ($1, $2, 'calendar', $3, $4, $5,
               CASE WHEN $5 = 'sent' THEN NOW() ELSE NULL END,
               CASE WHEN $5 = 'failed' THEN 'email_not_configured' ELSE NULL END) RETURNING id`,
      [assignmentId, result.assignment.team_member_id, lifecycleAction, deliveryKey, deliveryStatus]
    )
    if (!emailSent) deliveryFailures.push('email', 'calendar')
  } catch (error: unknown) {
    const errorCode = String(error instanceof Error ? error.message : 'email_delivery_failed').slice(0, 200)
    await Promise.allSettled(['email', 'calendar'].map(channel => queryOne(
      `INSERT INTO hr_notification_deliveries
        (assignment_id, recipient_id, channel, kind, delivery_key, status, error_code)
       VALUES ($1, $2, $3, $4, $5, 'failed', $6)
       ON CONFLICT (assignment_id, recipient_id, channel, kind, delivery_key) DO UPDATE
         SET status = 'failed', error_code = EXCLUDED.error_code
       RETURNING id`,
      [assignmentId, result.assignment.team_member_id, channel, lifecycleAction, deliveryKey, errorCode]
    )))
    deliveryFailures.push('email', 'calendar')
  }

  return {
    ok: true,
    assignmentId,
    action: input.action,
    effectiveDueAt: result.effectiveDueAt,
    calendarSequence: result.nextSequence,
    deliveryFailures
  }
})
