import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, transaction } from '~~/server/utils/db'
import { canAccessHrParticipant, canManageHr } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

const Body = z.object({
  status: z.enum(['acknowledged', 'in_progress', 'completed', 'cancelled', 'closure_acknowledged']),
  closureNote: z.string().trim().min(10).max(5000).optional(),
}).superRefine((input, context) => {
  if (input.status === 'completed' && !input.closureNote) context.addIssue({ code: 'custom', path: ['closureNote'], message: 'Completion requires an outcome and closure note.' })
})

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const followUpId = getRouterParam(event, 'id')
  if (!followUpId || !/^[0-9a-f-]{36}$/i.test(followUpId)) throw createError({ statusCode: 400, statusMessage: 'Invalid follow-up' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid follow-up status' })

  const followUp = await queryOne<any>(
    `SELECT follow_up.id, follow_up.owner_id, follow_up.visibility, follow_up.status,
            participant.team_member_id, participant.reviewer_id, participant.cycle_id
     FROM hr_follow_up_plans follow_up
     JOIN hr_review_participants participant ON participant.id = follow_up.participant_id
     WHERE follow_up.id = $1`,
    [followUpId],
  )
  if (!followUp) throw createError({ statusCode: 404, statusMessage: 'Follow-up not found' })

  const isParticipant = user.id === followUp.team_member_id
  const isOwner = user.id === followUp.owner_id
  const isReviewer = canAccessHrParticipant(user, {
    participantUserId: followUp.team_member_id,
    reviewerIds: followUp.reviewer_id ? [followUp.reviewer_id] : [],
  }, 'score')
  const allowed = (canManageHr(user) && parsed.data.status !== 'closure_acknowledged')
    || (isParticipant && followUp.visibility === 'participant_and_hr' && parsed.data.status === 'acknowledged')
    || (isParticipant && followUp.visibility === 'participant_and_hr' && parsed.data.status === 'closure_acknowledged' && followUp.status === 'completed')
    || (isOwner && ['in_progress', 'completed'].includes(parsed.data.status))
    || (isReviewer && parsed.data.status !== 'closure_acknowledged')
  if (!allowed) throw createError({ statusCode: 403, statusMessage: 'You cannot make this follow-up transition' })
  if (['completed', 'cancelled'].includes(followUp.status) && parsed.data.status !== 'closure_acknowledged') throw createError({ statusCode: 409, statusMessage: 'This follow-up is already closed' })

  const updated = await transaction(async (db) => {
    const updatedResult = await db.query(
      `UPDATE hr_follow_up_plans
     SET status = CASE WHEN $2 = 'closure_acknowledged' THEN status ELSE $2 END,
         acknowledged_at = CASE WHEN $2 = 'acknowledged' THEN COALESCE(acknowledged_at, NOW()) ELSE acknowledged_at END,
         completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END,
         closure_note = CASE WHEN $2 = 'completed' THEN $3 ELSE closure_note END,
         closure_acknowledged_at = CASE WHEN $2 = 'closure_acknowledged' THEN NOW() ELSE closure_acknowledged_at END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, status, acknowledged_at, completed_at, closure_note, closure_acknowledged_at, updated_at`,
      [followUpId, parsed.data.status, parsed.data.closureNote || null],
    )
    const saved = updatedResult.rows[0]
    await db.query(
      `INSERT INTO hr_follow_up_events (follow_up_id, actor_id, action, metadata)
     VALUES ($1, $2, $3, '{}'::jsonb) RETURNING id`,
      [followUpId, user.id, parsed.data.status],
    )
    await recordHrAuditEvent({
      actorId: user.id,
      action: `review_follow_up.${parsed.data.status}`,
      targetType: 'follow_up_plan',
      targetId: followUpId,
      cycleId: followUp.cycle_id,
    }, db)
    return saved
  })
  return { ok: true, followUp: updated }
})
