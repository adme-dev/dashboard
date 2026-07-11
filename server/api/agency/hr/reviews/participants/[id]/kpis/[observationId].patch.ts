import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { canAccessHrParticipant, canManageHr } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

const Body = z.object({
  evidenceStatus: z.enum(['unverified', 'verified', 'disputed', 'missing']),
  contextNote: z.string().trim().min(1).max(2000),
})

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'id')
  const observationId = getRouterParam(event, 'observationId')
  if (!participantId || !observationId || !/^[0-9a-f-]{36}$/i.test(participantId) || !/^[0-9a-f-]{36}$/i.test(observationId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid KPI observation' })
  }
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid KPI evidence update', data: { issues: parsed.error.issues } })

  const observation = await transaction(async (db) => {
    const result = await db.query(
      `SELECT observation.id, observation.evidence_status, participant.team_member_id,
              participant.reviewer_id, participant.cycle_id
       FROM hr_kpi_observations observation
       JOIN hr_review_participants participant ON participant.id = observation.participant_id
       WHERE observation.id = $1 AND participant.id = $2`,
      [observationId, participantId],
    )
    const current = result.rows[0]
    if (!current || !canAccessHrParticipant(user, {
      participantUserId: current.team_member_id,
      reviewerIds: current.reviewer_id ? [current.reviewer_id] : [],
    }, 'read')) throw createError({ statusCode: 403, statusMessage: 'You cannot update this KPI evidence' })

    const isParticipant = user.id === current.team_member_id && !canManageHr(user)
    if (isParticipant && parsed.data.evidenceStatus !== 'disputed') {
      throw createError({ statusCode: 403, statusMessage: 'Participants may dispute evidence but cannot verify it' })
    }
    if (!isParticipant && parsed.data.evidenceStatus === 'disputed') {
      throw createError({ statusCode: 403, statusMessage: 'Only the participant may mark KPI evidence as disputed' })
    }
    const updatedResult = await db.query(
      `UPDATE hr_kpi_observations
       SET evidence_status = $1, context_note = $2,
           verified_by = CASE WHEN $1 = 'verified' THEN $3::uuid ELSE NULL END,
           verified_at = CASE WHEN $1 = 'verified' THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, evidence_status, context_note, verified_at, updated_at`,
      [parsed.data.evidenceStatus, parsed.data.contextNote, user.id, observationId],
    )
    const updated = updatedResult.rows[0]
    await recordHrAuditEvent({
      actorId: user.id,
      action: parsed.data.evidenceStatus === 'disputed' ? 'kpi_observation.disputed' : 'kpi_observation.status_changed',
      targetType: 'kpi_observation',
      targetId: updated.id,
      cycleId: current.cycle_id,
      metadata: { from: current.evidence_status, to: parsed.data.evidenceStatus, participantId },
    }, db)
    return updated
  })
  return { ok: true, observation }
})
