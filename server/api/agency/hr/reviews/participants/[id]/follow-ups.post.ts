import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { canAccessHrParticipant } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrFollowUpSchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'id')
  if (!participantId || !/^[0-9a-f-]{36}$/i.test(participantId)) throw createError({ statusCode: 400, statusMessage: 'Invalid participant' })
  const parsed = hrFollowUpSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid follow-up plan', data: { issues: parsed.error.issues } })
  const input = parsed.data

  const result = await transaction(async (db) => {
    const participantResult = await db.query(
      `SELECT id, team_member_id, reviewer_id, cycle_id FROM hr_review_participants WHERE id = $1`,
      [participantId],
    )
    const participant = participantResult.rows[0]
    if (!participant || !canAccessHrParticipant(user, {
      participantUserId: participant.team_member_id,
      reviewerIds: participant.reviewer_id ? [participant.reviewer_id] : [],
    }, 'score')) throw createError({ statusCode: 403, statusMessage: 'Only the assigned reviewer may create follow-ups' })

    const owner = await db.query('SELECT id FROM team_members WHERE id = $1 AND is_active = true', [input.ownerId])
    if (!owner.rows[0]) throw new Error('Follow-up owner must be an active team member')
    if (input.visibility === 'hr_only' && input.ownerId === participant.team_member_id) {
      throw createError({ statusCode: 400, statusMessage: 'An HR-only follow-up cannot be assigned to the participant' })
    }
    const followUpResult = await db.query(
      `INSERT INTO hr_follow_up_plans
        (participant_id, action_type, title, description, rationale, evidence_refs,
         owner_id, due_at, visibility, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
       RETURNING id, participant_id, action_type, title, owner_id, due_at, visibility, status`,
      [participant.id, input.actionType, input.title, input.description, input.rationale || null,
        JSON.stringify(input.evidenceRefs), input.ownerId, input.dueAt, input.visibility, user.id],
    )
    const followUp = followUpResult.rows[0]
    if (input.actionType === 'learning' && input.learning) {
      await db.query(
        `INSERT INTO hr_learning_needs
          (follow_up_id, capability, observable_need, desired_outcome, learning_intervention,
           source_criterion_id, source_kpi_definition_id, provider_or_resource)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [followUp.id, input.learning.capability, input.learning.observableNeed,
          input.learning.desiredOutcome, input.learning.learningIntervention,
          input.learning.sourceCriterionId || null, input.learning.sourceKpiDefinitionId || null,
          input.learning.providerOrResource || null],
      )
    }
    await db.query(
      `INSERT INTO hr_follow_up_events (follow_up_id, actor_id, action, metadata)
       VALUES ($1, $2, 'created', $3::jsonb)`,
      [followUp.id, user.id, JSON.stringify({ actionType: input.actionType, dueAt: input.dueAt })],
    )
    await recordHrAuditEvent({
      actorId: user.id,
      action: 'review_follow_up.created',
      targetType: 'follow_up_plan',
      targetId: followUp.id,
      cycleId: participant.cycle_id,
      metadata: { actionType: input.actionType, ownerId: input.ownerId, dueAt: input.dueAt },
    }, db)
    return { followUp, participant }
  })

  const recipients = new Set(input.visibility === 'participant_and_hr'
    ? [result.participant.team_member_id, input.ownerId]
    : [input.ownerId])
  await Promise.allSettled([...recipients].map(userId => createNotification({
    userId,
    actorId: user.id,
    type: 'hr_follow_up_assigned',
    title: input.actionType === 'learning' ? 'Learning follow-up assigned' : 'Review follow-up assigned',
    message: `${input.title} is required by ${new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(input.dueAt))}.`,
    link: '/agency/hr',
    reason: 'direct',
    metadata: { followUpId: result.followUp.id, participantId },
  })))
  return { ok: true, followUp: result.followUp }
})
