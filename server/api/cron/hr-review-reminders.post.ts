import { createError, getHeader, setHeader } from 'h3'
import { getAppUrl } from '~~/server/utils/appUrl'
import { execute, queryOne, queryRows } from '~~/server/utils/db'
import { sendHrReviewLifecycleEmail } from '~~/server/utils/email'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { createNotification } from '~~/server/utils/notifications'

type ReminderKind = 'reminder' | 'overdue'
type ReminderCandidate = {
  assignment_id: string
  participant_id: string
  recipient_id: string
  recipient_name: string
  recipient_email: string
  cycle_id: string
  cycle_name: string
  timezone: string
  due_at: string
  kind: ReminderKind
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const secret = getHeader(event, 'x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const candidates = await queryRows<ReminderCandidate>(
    `SELECT assignment.id AS assignment_id, participant.id AS participant_id,
            participant.team_member_id AS recipient_id, member.name AS recipient_name,
            member.email AS recipient_email, cycle.id AS cycle_id,
            cycle.name AS cycle_name, cycle.timezone,
            COALESCE(assignment.extension_due_at, assignment.due_at)::text AS due_at,
            CASE WHEN COALESCE(assignment.extension_due_at, assignment.due_at) < NOW()
                 THEN 'overdue' ELSE 'reminder' END AS kind
     FROM hr_questionnaire_assignments assignment
     JOIN hr_review_participants participant ON participant.id = assignment.participant_id
     JOIN team_members member ON member.id = participant.team_member_id
     JOIN hr_review_cycles cycle ON cycle.id = participant.cycle_id
     WHERE assignment.status IN ('scheduled', 'open', 'in_progress', 'overdue')
       AND cycle.status IN ('scheduled', 'open')
       AND assignment.opens_at <= NOW()
       AND cycle.closes_at >= NOW()
       AND COALESCE(assignment.extension_due_at, assignment.due_at) <= NOW() + INTERVAL '72 hours'
     ORDER BY COALESCE(assignment.extension_due_at, assignment.due_at)
     LIMIT 200`
  )

  let sent = 0
  let skipped = 0
  let failed = 0
  for (const candidate of candidates) {
    const deliveryKey = `${candidate.kind}:${candidate.due_at}`
    const delivery = await queryOne<{ id: string }>(
      `INSERT INTO hr_notification_deliveries
        (assignment_id, recipient_id, channel, kind, delivery_key, status)
       VALUES ($1, $2, 'in_app', $3, $4, 'pending')
       ON CONFLICT (assignment_id, recipient_id, channel, kind, delivery_key) DO UPDATE
         SET status = 'pending', error_code = NULL
         WHERE hr_notification_deliveries.status = 'failed'
       RETURNING id`,
      [candidate.assignment_id, candidate.recipient_id, candidate.kind, deliveryKey]
    )
    const dueLabel = new Intl.DateTimeFormat('en-AU', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: candidate.timezone
    }).format(new Date(candidate.due_at))
    if (!delivery) {
      skipped++
    } else try {
      const isOverdue = candidate.kind === 'overdue'
      await createNotification({
        userId: candidate.recipient_id,
        type: isOverdue ? 'hr_review_overdue' : 'hr_review_reminder',
        title: isOverdue ? 'Business review overdue' : 'Business review due soon',
        message: isOverdue
          ? `${candidate.cycle_name} was required by ${dueLabel}. Complete it before the review closes.`
          : `${candidate.cycle_name} is required by ${dueLabel}.`,
        link: '/agency/hr',
        reason: 'direct',
        metadata: {
          assignmentId: candidate.assignment_id,
          cycleId: candidate.cycle_id,
          dueAt: candidate.due_at,
          reminderKind: candidate.kind
        }
      })
      await execute(
        `UPDATE hr_notification_deliveries SET status = 'sent', sent_at = NOW()
         WHERE id = $1`,
        [delivery.id]
      )
      if (isOverdue) {
        await execute(
          `UPDATE hr_questionnaire_assignments SET status = 'overdue', updated_at = NOW()
           WHERE id = $1 AND status <> 'submitted'`,
          [candidate.assignment_id]
        )
        await execute(
          `UPDATE hr_review_participants SET status = 'overdue', updated_at = NOW()
           WHERE id = $1 AND status NOT IN ('submitted', 'reviewed', 'closed')`,
          [candidate.participant_id]
        )
      }
      await recordHrAuditEvent({
        action: `review_${candidate.kind}.sent`,
        targetType: 'questionnaire_assignment',
        targetId: candidate.assignment_id,
        cycleId: candidate.cycle_id,
        metadata: { recipientId: candidate.recipient_id, dueAt: candidate.due_at }
      })
      sent++
    } catch (error: unknown) {
      failed++
      await execute(
        `UPDATE hr_notification_deliveries SET status = 'failed', error_code = $2
         WHERE id = $1`,
        [delivery.id, String(error instanceof Error ? error.message : 'notification_failed').slice(0, 200)]
      )
    }

    const emailDelivery = await queryOne<{ id: string }>(
      `INSERT INTO hr_notification_deliveries
        (assignment_id, recipient_id, channel, kind, delivery_key, status)
       VALUES ($1, $2, 'email', $3, $4, 'pending')
       ON CONFLICT (assignment_id, recipient_id, channel, kind, delivery_key) DO UPDATE
         SET status = 'pending', error_code = NULL
         WHERE hr_notification_deliveries.status = 'failed'
       RETURNING id`,
      [candidate.assignment_id, candidate.recipient_id, candidate.kind, deliveryKey]
    )
    if (!emailDelivery) continue
    try {
      const isOverdue = candidate.kind === 'overdue'
      const dueLabel = new Intl.DateTimeFormat('en-AU', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: candidate.timezone
      }).format(new Date(candidate.due_at))
      const emailSent = await sendHrReviewLifecycleEmail({
        to: candidate.recipient_email,
        name: candidate.recipient_name,
        cycleName: candidate.cycle_name,
        action: candidate.kind,
        message: isOverdue
          ? `Your response was required by ${dueLabel}. Complete it before the review closes.`
          : `Your response is required by ${dueLabel}.`,
        assignmentUrl: `${getAppUrl(event)}/agency/hr`
      }, event)
      await execute(
        `UPDATE hr_notification_deliveries
         SET status = $2, sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE NULL END,
             error_code = CASE WHEN $2 = 'failed' THEN 'email_not_configured' ELSE NULL END
         WHERE id = $1`,
        [emailDelivery.id, emailSent ? 'sent' : 'failed']
      )
      if (!emailSent) failed++
    } catch (error: unknown) {
      failed++
      await execute(
        `UPDATE hr_notification_deliveries SET status = 'failed', error_code = $2 WHERE id = $1`,
        [emailDelivery.id, String(error instanceof Error ? error.message : 'email_delivery_failed').slice(0, 200)]
      )
    }
  }

  return { ok: true, considered: candidates.length, sent, skipped, failed }
})
