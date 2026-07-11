import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { canAccessHrParticipant } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

const Body = z.object({
  kpiDefinitionId: z.string().uuid(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  actualValue: z.number().finite().nullable().optional(),
  actualText: z.string().trim().min(1).max(1000).nullable().optional(),
  sourceRef: z.string().trim().min(1).max(500),
  contextNote: z.string().trim().max(2000).optional(),
  evidenceStatus: z.enum(['unverified', 'verified', 'missing']).default('unverified'),
}).refine(value => value.actualValue !== null && value.actualValue !== undefined || Boolean(value.actualText), {
  message: 'An actual value or milestone result is required',
})

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'id')
  if (!participantId || !/^[0-9a-f-]{36}$/i.test(participantId)) throw createError({ statusCode: 400, statusMessage: 'Invalid participant' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid KPI evidence', data: { issues: parsed.error.issues } })
  const input = parsed.data
  if (input.periodEnd < input.periodStart) throw createError({ statusCode: 400, statusMessage: 'KPI period end must not precede its start' })

  const observation = await transaction(async (db) => {
    const participantResult = await db.query(
      `SELECT id, team_member_id, reviewer_id, role_profile_version_id, cycle_id
       FROM hr_review_participants WHERE id = $1`,
      [participantId],
    )
    const participant = participantResult.rows[0]
    if (!participant || !canAccessHrParticipant(user, {
      participantUserId: participant.team_member_id,
      reviewerIds: participant.reviewer_id ? [participant.reviewer_id] : [],
    }, 'score')) throw createError({ statusCode: 403, statusMessage: 'Only the assigned reviewer may record KPI evidence' })

    const kpiResult = await db.query(
      `SELECT id, kpi_key, name, unit, direction, target_value, target_min, target_max,
              target_description, source_type, source_ref
       FROM hr_role_kpi_definitions
       WHERE id = $1 AND role_profile_version_id = $2 AND status = 'active'`,
      [input.kpiDefinitionId, participant.role_profile_version_id],
    )
    const kpi = kpiResult.rows[0]
    if (!kpi) throw createError({ statusCode: 400, statusMessage: 'KPI does not belong to the participant role version' })

    const existingResult = await db.query(
      `SELECT evidence_status FROM hr_kpi_observations
       WHERE participant_id = $1 AND kpi_definition_id = $2
         AND period_start = $3::date AND period_end = $4::date`,
      [participantId, kpi.id, input.periodStart, input.periodEnd],
    )
    if (existingResult.rows[0]?.evidence_status === 'disputed'
      && input.evidenceStatus === 'verified'
      && !input.contextNote) {
      throw createError({ statusCode: 400, statusMessage: 'Explain how the participant challenge was resolved before verification' })
    }

    const result = await db.query(
      `INSERT INTO hr_kpi_observations
        (participant_id, kpi_definition_id, period_start, period_end, actual_value,
         actual_text, target_snapshot, source_ref, evidence_status, context_note,
         recorded_by, verified_by, verified_at)
       VALUES ($1, $2, $3::date, $4::date, $5, $6, $7::jsonb, $8, $9, $10, $11,
               CASE WHEN $9 = 'verified' THEN $11::uuid ELSE NULL END,
               CASE WHEN $9 = 'verified' THEN NOW() ELSE NULL END)
       ON CONFLICT (participant_id, kpi_definition_id, period_start, period_end)
       DO UPDATE SET actual_value = EXCLUDED.actual_value, actual_text = EXCLUDED.actual_text,
         target_snapshot = EXCLUDED.target_snapshot, source_ref = EXCLUDED.source_ref,
         evidence_status = EXCLUDED.evidence_status,
         context_note = COALESCE(EXCLUDED.context_note, hr_kpi_observations.context_note),
         recorded_by = EXCLUDED.recorded_by, verified_by = EXCLUDED.verified_by,
         verified_at = EXCLUDED.verified_at, updated_at = NOW()
       RETURNING id, kpi_definition_id, period_start, period_end, actual_value, actual_text,
                 source_ref, evidence_status, context_note, verified_at`,
      [participantId, kpi.id, input.periodStart, input.periodEnd, input.actualValue ?? null,
        input.actualText ?? null, JSON.stringify({
          kpiKey: kpi.kpi_key,
          name: kpi.name,
          unit: kpi.unit,
          direction: kpi.direction,
          targetValue: kpi.target_value,
          targetMin: kpi.target_min,
          targetMax: kpi.target_max,
          targetDescription: kpi.target_description,
          approvedSourceType: kpi.source_type,
          approvedSourceRef: kpi.source_ref,
        }), input.sourceRef, input.evidenceStatus, input.contextNote || null, user.id],
    )
    const saved = result.rows[0]
    await recordHrAuditEvent({
      actorId: user.id,
      action: 'kpi_observation.recorded',
      targetType: 'kpi_observation',
      targetId: saved.id,
      cycleId: participant.cycle_id,
      metadata: { participantId, kpiDefinitionId: kpi.id, evidenceStatus: input.evidenceStatus },
    }, db)
    return saved
  })
  return { ok: true, observation }
})
