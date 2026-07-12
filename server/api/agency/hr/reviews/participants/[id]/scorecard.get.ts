import { createError, getRouterParam, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { canAccessHrParticipant, canManageHr } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'id')
  if (!participantId || !/^[0-9a-f-]{36}$/i.test(participantId))
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid participant',
    })

  const row = await queryOne<any>(
    `SELECT participant.id, participant.team_member_id, participant.reviewer_id,
            participant.cycle_id, participant.status,
            member.name AS member_name, member.email AS member_email,
            cycle.name AS cycle_name,
            role.title AS role_title,
            scorecard.id AS scorecard_version_id,
            scorecard.version AS scorecard_version,
            scorecard.criteria,
            scorecard.evidence_threshold,
            result.id AS result_id, result.role_score, result.operational_enablement,
            result.evidence_coverage, result.confidence, result.publishable,
            result.calculation, result.published_at,
            response.status AS response_status, response.submitted_at
     FROM hr_review_participants participant
     JOIN team_members member ON member.id = participant.team_member_id
     JOIN hr_review_cycles cycle ON cycle.id = participant.cycle_id
     LEFT JOIN hr_role_profile_versions role_version ON role_version.id = participant.role_profile_version_id
     LEFT JOIN hr_role_profiles role ON role.id = role_version.role_profile_id
     LEFT JOIN hr_role_scorecard_versions scorecard
       ON scorecard.id = participant.scorecard_version_id
     LEFT JOIN LATERAL (
       SELECT * FROM hr_scorecard_results candidate
       WHERE candidate.participant_id = participant.id
         AND ($3::boolean OR participant.team_member_id <> $2::uuid
              OR participant.reviewer_id = $2::uuid OR candidate.published_at IS NOT NULL)
       ORDER BY candidate.version DESC LIMIT 1
     ) result ON true
     LEFT JOIN hr_questionnaire_assignments assignment ON assignment.participant_id = participant.id
     LEFT JOIN hr_responses response ON response.assignment_id = assignment.id
       AND response.respondent_id = participant.team_member_id
     WHERE participant.id = $1`,
    [participantId, user.id, canManageHr(user)],
  )
  if (!row)
    throw createError({
      statusCode: 404,
      statusMessage: 'Review participant not found',
    })
  if (
    !canAccessHrParticipant(
      user,
      {
        participantUserId: row.team_member_id,
        reviewerIds: row.reviewer_id ? [row.reviewer_id] : [],
      },
      'read',
    )
  )
    throw createError({
      statusCode: 403,
      statusMessage: 'You cannot view this scorecard',
    })

  const isParticipantView = user.id === row.team_member_id && user.id !== row.reviewer_id && !canManageHr(user)
  const resultIsVisible = Boolean(row.result_id && (!isParticipantView || row.published_at))
  const canScore = canAccessHrParticipant(
    user,
    {
      participantUserId: row.team_member_id,
      reviewerIds: row.reviewer_id ? [row.reviewer_id] : [],
    },
    'score',
  )
  const calculation =
    row.calculation && isParticipantView
      ? {
          calculation: row.calculation.calculation,
          ratings: row.calculation.ratings,
        }
      : row.calculation

  await recordHrAuditEvent({
    actorId: user.id,
    action: 'scorecard.viewed',
    targetType: 'review_participant',
    targetId: row.id,
    cycleId: row.cycle_id,
  })

  return {
    participant: {
      id: row.id,
      teamMemberId: row.team_member_id,
      memberName: row.member_name,
      memberEmail: row.member_email,
      cycleId: row.cycle_id,
      cycleName: row.cycle_name,
      roleTitle: row.role_title,
      status: row.status,
      responseStatus: row.response_status,
      responseSubmittedAt: row.submitted_at,
      canScore,
    },
    scorecard: {
      id: row.scorecard_version_id,
      version: row.scorecard_version,
      criteria: row.criteria || [],
      evidenceThreshold: Number(row.evidence_threshold || 70),
    },
    result: resultIsVisible
      ? {
          id: row.result_id,
          roleScore: row.role_score === null ? null : Number(row.role_score),
          operationalEnablement: Number(row.operational_enablement),
          evidenceCoverage: Number(row.evidence_coverage),
          confidence: row.confidence,
          publishable: row.publishable,
          calculation,
          publishedAt: row.published_at,
        }
      : null,
  }
})
