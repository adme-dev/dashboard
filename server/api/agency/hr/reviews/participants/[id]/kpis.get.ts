import { createError, getRouterParam, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { query, queryOne } from '~~/server/utils/db'
import { canAccessHrParticipant } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'id')
  if (!participantId || !/^[0-9a-f-]{36}$/i.test(participantId)) throw createError({ statusCode: 400, statusMessage: 'Invalid participant' })

  const participant = await queryOne<any>(
    `SELECT id, team_member_id, reviewer_id, role_profile_version_id, cycle_id
     FROM hr_review_participants WHERE id = $1`,
    [participantId],
  )
  if (!participant || !canAccessHrParticipant(user, {
    participantUserId: participant.team_member_id,
    reviewerIds: participant.reviewer_id ? [participant.reviewer_id] : [],
  }, 'read')) throw createError({ statusCode: 403, statusMessage: 'You cannot view this KPI evidence' })

  const observations = await query<any>(
    `SELECT kpi.id AS kpi_definition_id, kpi.kpi_key, kpi.name, kpi.description,
            kpi.unit, kpi.direction, kpi.target_value, kpi.target_min, kpi.target_max,
            kpi.target_description, kpi.cadence, kpi.source_type, kpi.source_ref,
            observation.id AS observation_id, observation.period_start, observation.period_end,
            observation.actual_value, observation.actual_text, observation.evidence_status,
            observation.context_note, observation.source_ref AS observation_source_ref,
            observation.verified_at, observation.updated_at
     FROM hr_role_kpi_definitions kpi
     LEFT JOIN LATERAL (
       SELECT candidate.* FROM hr_kpi_observations candidate
       WHERE candidate.participant_id = $1 AND candidate.kpi_definition_id = kpi.id
       ORDER BY candidate.period_end DESC, candidate.updated_at DESC LIMIT 1
     ) observation ON true
     WHERE kpi.role_profile_version_id = $2 AND kpi.status = 'active'
     ORDER BY kpi.name`,
    [participantId, participant.role_profile_version_id],
  )
  await recordHrAuditEvent({
    actorId: user.id,
    action: 'kpi_evidence.viewed',
    targetType: 'review_participant',
    targetId: participant.id,
    cycleId: participant.cycle_id,
  })
  return { observations }
})
