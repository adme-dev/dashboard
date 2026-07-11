import { createError, getRouterParam, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { canAccessHrParticipant, canManageHr } from '~~/server/utils/hr/access'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'id')
  if (!participantId || !/^[0-9a-f-]{36}$/i.test(participantId)) throw createError({ statusCode: 400, statusMessage: 'Invalid participant' })
  const participant = await queryOne<any>('SELECT id, team_member_id, reviewer_id FROM hr_review_participants WHERE id = $1', [participantId])
  if (!participant || !canAccessHrParticipant(user, { participantUserId: participant.team_member_id, reviewerIds: participant.reviewer_id ? [participant.reviewer_id] : [] }, 'read')) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  const canReview = canManageHr(user) || user.id === participant.reviewer_id
  const findings = await queryRows(
    `SELECT finding.id, finding.finding_type, finding.accountability_class, finding.title,
            finding.statement, finding.evidence_refs, finding.contrary_evidence_review,
            finding.confidence, finding.adverse_individual, finding.participant_response_status,
            finding.status, finding.no_action_rationale, finding.second_approved_by,
            finding.published_at, response.response, response.correction_requested,
            response.correction_detail, response.response_status,
            (SELECT COUNT(*) FROM hr_follow_up_plans action WHERE action.finding_id = finding.id AND action.status <> 'cancelled') AS action_count
       FROM hr_review_findings finding
       LEFT JOIN hr_finding_responses response ON response.finding_id = finding.id
      WHERE finding.participant_id = $1
        AND ($2::boolean OR finding.status IN ('participant_review', 'awaiting_second_approval', 'published'))
      ORDER BY finding.created_at DESC`,
    [participantId, canReview],
  )
  return { findings, canReview, isParticipant: user.id === participant.team_member_id }
})
