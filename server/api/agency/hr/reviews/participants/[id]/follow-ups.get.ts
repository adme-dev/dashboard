import { createError, getRouterParam, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { canAccessHrParticipant, canManageHr } from '~~/server/utils/hr/access'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'id')
  if (!participantId || !/^[0-9a-f-]{36}$/i.test(participantId)) throw createError({ statusCode: 400, statusMessage: 'Invalid participant' })
  const participant = await queryOne<any>(
    `SELECT id, team_member_id, reviewer_id FROM hr_review_participants WHERE id = $1`,
    [participantId],
  )
  if (!participant || !canAccessHrParticipant(user, {
    participantUserId: participant.team_member_id,
    reviewerIds: participant.reviewer_id ? [participant.reviewer_id] : [],
  }, 'read')) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const includeHrOnly = canManageHr(user) || user.id === participant.reviewer_id
  const followUps = await queryRows(
    `SELECT follow_up.id, follow_up.action_type, follow_up.title, follow_up.description,
            follow_up.rationale, follow_up.evidence_refs, follow_up.owner_id,
            follow_up.finding_id, follow_up.employee_responsibility,
            follow_up.business_responsibility, follow_up.support_commitment,
            follow_up.success_measure, follow_up.review_at, follow_up.closure_note,
            follow_up.closure_acknowledged_at,
            owner.name AS owner_name, follow_up.due_at, follow_up.visibility,
            follow_up.status, follow_up.acknowledged_at, follow_up.completed_at,
            learning.capability, learning.observable_need, learning.desired_outcome,
            learning.learning_intervention, learning.provider_or_resource
     FROM hr_follow_up_plans follow_up
     JOIN team_members owner ON owner.id = follow_up.owner_id
     LEFT JOIN hr_learning_needs learning ON learning.follow_up_id = follow_up.id
     WHERE follow_up.participant_id = $1
       AND ($2::boolean OR follow_up.visibility = 'participant_and_hr')
     ORDER BY follow_up.due_at, follow_up.created_at`,
    [participantId, includeHrOnly],
  )
  const owners = canManageHr(user) || user.id === participant.reviewer_id
    ? await queryRows('SELECT id, name, email FROM team_members WHERE is_active = true ORDER BY name')
    : []
  return { followUps, owners }
})
