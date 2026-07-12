import { createError, readBody, setHeader } from 'h3'
import { getAppUrl } from '~~/server/utils/appUrl'
import { transaction, queryOne } from '~~/server/utils/db'
import { sendHrReviewAssignmentEmail } from '~~/server/utils/email'
import { createNotification } from '~~/server/utils/notifications'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { buildHrCalendarInvite, validateHrSchedule } from '~~/server/utils/hr/schedule'
import { hrReviewCycleSchema } from '~~/server/utils/hr/schemas'
import { evaluateHrQuestionQuality } from '~~/server/utils/hr/questionPolicy'
import { evaluateHrLaunchReadiness, type HrLaunchGateApprovals } from '~~/server/utils/hr/launchReadiness'

type CreatedAssignment = {
  id: string
  participantId: string
  teamMemberId: string
  memberName: string
  memberEmail: string
  roleTitle: string
  calendarUid: string
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const parsed = hrReviewCycleSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid review cycle',
      data: { issues: parsed.error.issues },
    })

  const input = parsed.data
  const gateRows = await queryOne<{ approvals: HrLaunchGateApprovals }>(
    `SELECT COALESCE(jsonb_object_agg(gate_key, jsonb_build_object(
       'status', status, 'approvedAt', approved_at, 'expiresAt', expires_at
     )), '{}'::jsonb) AS approvals
     FROM (
       SELECT DISTINCT ON (gate_key) gate_key, status, approved_at, expires_at
       FROM hr_launch_gate_attestations
       ORDER BY gate_key, created_at DESC
     ) latest`,
  )
  const launchReadiness = evaluateHrLaunchReadiness(gateRows?.approvals || {})
  if (!launchReadiness.ready) {
    throw createError({
      statusCode: 409,
      statusMessage: 'HR launch governance gates are incomplete or expired',
    })
  }
  if (!input.ownerConfirmed)
    throw createError({
      statusCode: 400,
      statusMessage: 'Owner confirmation is required before questionnaires can be sent',
    })
  for (const participant of input.participants) {
    const qualityIssues = participant.questions.flatMap(
      (question) =>
        evaluateHrQuestionQuality({
          prompt: question.prompt,
          options: question.options?.map((option) => option.label),
        }).issues,
    )
    if (qualityIssues.length)
      throw createError({
        statusCode: 400,
        statusMessage: 'A commissioned questionnaire did not pass the neutral-question policy',
        data: { issues: qualityIssues },
      })
  }
  const schedule = validateHrSchedule(input)
  if (schedule.isValid === false)
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid review schedule: ${schedule.code}`,
    })

  const result = await transaction(async (db) => {
    const cycleStatus = Date.parse(input.opensAt) <= Date.now() ? 'open' : 'scheduled'
    const cycleResult = await db.query(
      `INSERT INTO hr_review_cycles
        (name, purpose, status, timezone, opens_at, due_at, closes_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, status, opens_at, due_at, closes_at`,
      [input.name, input.purpose, cycleStatus, input.timezone, input.opensAt, input.dueAt, input.closesAt, user.id],
    )
    const cycle = cycleResult.rows[0]
    const assignments: CreatedAssignment[] = []

    for (const participantInput of input.participants) {
      const roleResult = await db.query(
        `SELECT rpv.id AS version_id, rp.id AS profile_id, rp.title,
                assignment.scorecard_version_id
         FROM hr_role_profile_versions rpv
         JOIN hr_role_profiles rp ON rp.id = rpv.role_profile_id
         JOIN hr_role_assignments assignment
           ON assignment.role_profile_version_id = rpv.id
          AND assignment.team_member_id = $2
          AND assignment.effective_to IS NULL
         WHERE rpv.id = $1 AND rpv.status = 'published' AND rp.status = 'active'
           AND assignment.acknowledgement_status = 'acknowledged'
           AND assignment.scorecard_version_id IS NOT NULL`,
        [participantInput.roleProfileVersionId, participantInput.teamMemberId],
      )
      if (!roleResult.rows[0]) throw new Error('Every participant must have the selected published role assigned before questionnaire commissioning')

      const memberResult = await db.query(`SELECT id, name, email FROM team_members WHERE id = $1 AND is_active = true`, [participantInput.teamMemberId])
      if (!memberResult.rows[0]) throw new Error('Every review participant must be an active team member')

      const participantResult = await db.query(
        `INSERT INTO hr_review_participants
          (cycle_id, team_member_id, reviewer_id, role_profile_version_id, scorecard_version_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [cycle.id, participantInput.teamMemberId, participantInput.reviewerId || user.id, participantInput.roleProfileVersionId, roleResult.rows[0].scorecard_version_id],
      )
      const participantId = participantResult.rows[0].id
      const calendarUid = `hr-review-${cycle.id}-${participantInput.teamMemberId}@xeroflow.agency`
      const questionnaireResult = await db.query(
        `INSERT INTO hr_questionnaire_versions
          (template_key, name, version, purpose, visibility, questions, quality_report, source_refs,
           status, published_by, published_at)
         VALUES ($1, $2, 1, $3, 'participant_reviewer_and_hr', $4::jsonb, $5::jsonb, $6::jsonb,
                 'published', $7, NOW())
         RETURNING id`,
        [
          `cycle-${cycle.id}-${participantInput.teamMemberId}`,
          `${input.name} — ${memberResult.rows[0].name}`,
          input.purpose,
          JSON.stringify(participantInput.questions),
          JSON.stringify({
            publishable: true,
            issueCount: 0,
            ownerConfirmed: true,
          }),
          JSON.stringify([...new Set(participantInput.questions.flatMap((question) => question.sourceRefs))]),
          user.id,
        ],
      )
      const assignmentResult = await db.query(
        `INSERT INTO hr_questionnaire_assignments
          (participant_id, questionnaire_version_id, opens_at, due_at, status, calendar_uid)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [participantId, questionnaireResult.rows[0].id, input.opensAt, input.dueAt, cycleStatus === 'open' ? 'open' : 'scheduled', calendarUid],
      )

      assignments.push({
        id: assignmentResult.rows[0].id,
        participantId,
        teamMemberId: memberResult.rows[0].id,
        memberName: memberResult.rows[0].name,
        memberEmail: memberResult.rows[0].email,
        roleTitle: roleResult.rows[0].title,
        calendarUid,
      })

      await recordHrAuditEvent(
        {
          actorId: user.id,
          action: 'questionnaire.commissioned',
          targetType: 'questionnaire_assignment',
          targetId: assignmentResult.rows[0].id,
          cycleId: cycle.id,
          metadata: {
            questionCount: participantInput.questions.length,
            roleProfileVersionId: participantInput.roleProfileVersionId,
          },
        },
        db,
      )
    }

    await recordHrAuditEvent(
      {
        actorId: user.id,
        action: 'review_cycle.created',
        targetType: 'review_cycle',
        targetId: cycle.id,
        cycleId: cycle.id,
        metadata: { participantCount: assignments.length, dueAt: input.dueAt },
      },
      db,
    )
    return { cycle, assignments }
  })

  const appUrl = getAppUrl(event)
  const dueDate = new Date(input.dueAt)
  const dueLabel = new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: input.timezone,
  }).format(dueDate)
  const inviteStart = new Date(dueDate.getTime() - 15 * 60 * 1000).toISOString()

  const deliveryResults = await Promise.allSettled(
    result.assignments.map(async (assignment) => {
      const assignmentUrl = `${appUrl}/agency/hr`
      const calendarInvite = buildHrCalendarInvite({
        uid: assignment.calendarUid,
        method: 'REQUEST',
        startsAt: inviteStart,
        endsAt: input.dueAt,
        timezone: input.timezone,
        summary: `${input.name} due`,
        description: 'Complete your private business review. The calendar entry contains no questionnaire answers.',
        url: assignmentUrl,
        sequence: 0,
      })

      await createNotification({
        userId: assignment.teamMemberId,
        actorId: user.id,
        type: 'hr_review_assigned',
        title: 'Business review assigned',
        message: `${input.name} is required by ${dueLabel}.`,
        link: '/agency/hr',
        reason: 'direct',
        metadata: {
          assignmentId: assignment.id,
          cycleId: result.cycle.id,
          dueAt: input.dueAt,
        },
      })
      await queryOne(
        `INSERT INTO hr_notification_deliveries
        (assignment_id, recipient_id, channel, kind, status, sent_at)
       VALUES ($1, $2, 'in_app', 'assignment', 'sent', NOW()) RETURNING id`,
        [assignment.id, assignment.teamMemberId],
      )
      let emailSent = false
      try {
        emailSent = await sendHrReviewAssignmentEmail(
          {
            to: assignment.memberEmail,
            name: assignment.memberName,
            cycleName: input.name,
            roleTitle: assignment.roleTitle,
            dueLabel,
            assignmentUrl,
            calendarInvite,
          },
          event,
        )
      } catch (error: any) {
        const errorCode = String(error?.message || 'email_delivery_failed').slice(0, 200)
        await queryOne(
          `INSERT INTO hr_notification_deliveries
          (assignment_id, recipient_id, channel, kind, status, error_code)
         VALUES ($1, $2, 'email', 'assignment', 'failed', $3) RETURNING id`,
          [assignment.id, assignment.teamMemberId, errorCode],
        )
        await queryOne(
          `INSERT INTO hr_notification_deliveries
          (assignment_id, recipient_id, channel, kind, status, error_code)
         VALUES ($1, $2, 'calendar', 'assignment', 'failed', $3) RETURNING id`,
          [assignment.id, assignment.teamMemberId, errorCode],
        )
        throw error
      }
      await queryOne(
        `INSERT INTO hr_notification_deliveries
        (assignment_id, recipient_id, channel, kind, status, sent_at)
       VALUES ($1, $2, 'email', 'assignment', $3,
               CASE WHEN $3 = 'sent' THEN NOW() ELSE NULL END) RETURNING id`,
        [assignment.id, assignment.teamMemberId, emailSent ? 'sent' : 'pending'],
      )
      await queryOne(
        `INSERT INTO hr_notification_deliveries
        (assignment_id, recipient_id, channel, kind, status, sent_at)
       VALUES ($1, $2, 'calendar', 'assignment', $3,
               CASE WHEN $3 = 'sent' THEN NOW() ELSE NULL END) RETURNING id`,
        [assignment.id, assignment.teamMemberId, emailSent ? 'sent' : 'pending'],
      )
    }),
  )

  const deliveryFailures = deliveryResults.filter((result) => result.status === 'rejected').length

  await recordHrAuditEvent({
    actorId: user.id,
    action: 'review_cycle.delivery_completed',
    targetType: 'review_cycle',
    targetId: result.cycle.id,
    cycleId: result.cycle.id,
    metadata: {
      participantCount: result.assignments.length,
      dueAt: input.dueAt,
      deliveryFailures,
    },
  })

  return {
    ok: true,
    cycle: result.cycle,
    assignmentCount: result.assignments.length,
    deliveryFailures,
  }
})
