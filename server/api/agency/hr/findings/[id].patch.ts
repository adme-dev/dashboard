import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { canAccessHrParticipant, canManageHr } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrFindingTransitionSchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const findingId = getRouterParam(event, 'id')
  if (!findingId || !/^[0-9a-f-]{36}$/i.test(findingId)) throw createError({ statusCode: 400, statusMessage: 'Invalid finding' })
  const parsed = hrFindingTransitionSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid finding transition' })
  const input = parsed.data

  const finding = await transaction(async (db) => {
    const result = await db.query(
      `SELECT finding.*, participant.team_member_id, participant.reviewer_id, participant.cycle_id,
              (SELECT COUNT(*)::int FROM hr_follow_up_plans action WHERE action.finding_id = finding.id AND action.status <> 'cancelled') AS action_count
         FROM hr_review_findings finding
         JOIN hr_review_participants participant ON participant.id = finding.participant_id
        WHERE finding.id = $1 FOR UPDATE OF finding`,
      [findingId],
    )
    const current = result.rows[0]
    if (!current) throw createError({ statusCode: 404, statusMessage: 'Finding not found' })
    const isReviewer = canAccessHrParticipant(user, { participantUserId: current.team_member_id, reviewerIds: current.reviewer_id ? [current.reviewer_id] : [] }, 'score')
    const isHrAdmin = canManageHr(user)
    let nextStatus: string

    if (input.action === 'share_for_response') {
      if (!isReviewer || current.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Only a draft finding can be shared by its reviewer' })
      nextStatus = 'participant_review'
    } else if (input.action === 'request_approval') {
      if (!isReviewer || current.status !== 'participant_review' || !current.adverse_individual) throw createError({ statusCode: 409, statusMessage: 'Only an adverse finding in participant review can request second approval' })
      if (current.participant_response_status === 'pending') throw createError({ statusCode: 409, statusMessage: 'Record the participant response or decline before requesting approval' })
      if (Number(current.action_count) === 0 && !input.noActionRationale) throw createError({ statusCode: 409, statusMessage: 'Add an action plan or a no-action rationale before approval' })
      nextStatus = 'awaiting_second_approval'
    } else if (input.action === 'publish') {
      if (!isReviewer || current.status !== 'participant_review' || current.adverse_individual) throw createError({ statusCode: 409, statusMessage: 'This finding cannot be published through the standard path' })
      if (current.participant_response_status === 'pending') throw createError({ statusCode: 409, statusMessage: 'Record the participant response or decline before publication' })
      if (Number(current.action_count) === 0 && !input.noActionRationale) throw createError({ statusCode: 409, statusMessage: 'Add an action plan or a no-action rationale before publication' })
      nextStatus = 'published'
    } else if (input.action === 'approve_and_publish') {
      if (!isHrAdmin || current.status !== 'awaiting_second_approval') throw createError({ statusCode: 409, statusMessage: 'This finding is not awaiting HR second approval' })
      if (current.created_by === user.id) throw createError({ statusCode: 409, statusMessage: 'Second approver must be different from the finding author' })
      nextStatus = 'published'
    } else {
      if (!isHrAdmin || !['participant_review', 'awaiting_second_approval'].includes(current.status)) throw createError({ statusCode: 409, statusMessage: 'This finding cannot be rejected from its current state' })
      nextStatus = 'rejected'
    }

    const updatedResult = await db.query(
      `UPDATE hr_review_findings
          SET status = $2,
              no_action_rationale = COALESCE($3, no_action_rationale),
              second_approved_by = CASE WHEN $4 = 'approve_and_publish' THEN $5 ELSE second_approved_by END,
              second_approved_at = CASE WHEN $4 = 'approve_and_publish' THEN NOW() ELSE second_approved_at END,
              published_by = CASE WHEN $2 = 'published' THEN $5 ELSE published_by END,
              published_at = CASE WHEN $2 = 'published' THEN NOW() ELSE published_at END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, status, participant_response_status, second_approved_by, published_at, no_action_rationale`,
      [findingId, nextStatus, input.noActionRationale || null, input.action, user.id],
    )
    await recordHrAuditEvent({ actorId: user.id, action: `finding.${input.action}`, targetType: 'review_finding', targetId: findingId, cycleId: current.cycle_id, metadata: { fromStatus: current.status, toStatus: nextStatus } }, db)
    return {
      record: updatedResult.rows[0],
      participantUserId: current.team_member_id,
      participantId: current.participant_id,
      reviewerId: current.reviewer_id,
      action: input.action,
    }
  })

  const notifications = []
  if (finding.action === 'share_for_response') {
    notifications.push(createNotification({
      userId: finding.participantUserId,
      actorId: user.id,
      type: 'hr_finding_response_requested',
      title: 'Review finding ready for your response',
      message: 'A work-related finding is ready for you to review, respond to, or request a correction.',
      link: `/agency/hr/reviews/participants/${finding.participantId}/findings`,
      reason: 'direct',
      metadata: { findingId },
    }))
  } else if (['publish', 'approve_and_publish'].includes(finding.action)) {
    notifications.push(createNotification({
      userId: finding.participantUserId,
      actorId: user.id,
      type: 'hr_finding_published',
      title: 'Review finding published',
      message: 'A reviewed finding and its agreed action or no-action rationale are now available.',
      link: '/agency/hr',
      reason: 'direct',
      metadata: { findingId },
    }))
  }
  await Promise.allSettled(notifications)
  return { ok: true, finding: finding.record }
})
