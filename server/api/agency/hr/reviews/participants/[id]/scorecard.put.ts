import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, transaction } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { canAccessHrParticipant } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { calculateHrRoleScore } from '~~/server/utils/hr/scoring'

const Body = z.object({
  operationalEnablement: z.number().min(1).max(5),
  criteria: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        rating: z.number().min(1).max(5).nullable(),
        hasSufficientEvidence: z.boolean(),
        evidenceRefs: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
      }),
    )
    .min(1)
    .max(20),
  reviewerNotes: z.string().trim().max(5000).optional(),
  publish: z.boolean().default(false),
})

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'id')
  if (!participantId || !/^[0-9a-f-]{36}$/i.test(participantId))
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid participant',
    })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid scorecard assessment',
      data: { issues: parsed.error.issues },
    })

  const row = await queryOne<any>(
    `SELECT participant.id, participant.team_member_id, participant.reviewer_id,
            participant.cycle_id, scorecard.id AS scorecard_version_id,
            scorecard.criteria, scorecard.evidence_threshold,
            response.status AS response_status,
            role_assignment.acknowledgement_status AS role_acknowledgement_status
     FROM hr_review_participants participant
     LEFT JOIN hr_questionnaire_assignments assignment ON assignment.participant_id = participant.id
     LEFT JOIN hr_responses response ON response.assignment_id = assignment.id
       AND response.respondent_id = participant.team_member_id
     LEFT JOIN hr_role_assignments role_assignment
       ON role_assignment.team_member_id = participant.team_member_id
      AND role_assignment.role_profile_version_id = participant.role_profile_version_id
      AND role_assignment.effective_to IS NULL
     JOIN hr_role_scorecard_versions scorecard
       ON scorecard.id = participant.scorecard_version_id
     WHERE participant.id = $1`,
    [participantId],
  )
  if (!row)
    throw createError({
      statusCode: 404,
      statusMessage: 'Review scorecard not found',
    })
  if (
    !canAccessHrParticipant(
      user,
      {
        participantUserId: row.team_member_id,
        reviewerIds: row.reviewer_id ? [row.reviewer_id] : [],
      },
      'score',
    )
  )
    throw createError({
      statusCode: 403,
      statusMessage: 'Only the assigned reviewer may score this review',
    })
  if (parsed.data.publish && !['submitted', 'locked'].includes(row.response_status)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A submitted response is required before publication',
    })
  }
  if (parsed.data.publish && row.role_acknowledgement_status === 'disputed') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Resolve the role baseline dispute before publication',
    })
  }

  const storedCriteria = row.criteria as Array<{ id: string; weight: number }>
  const provided = new Map(parsed.data.criteria.map((criterion) => [criterion.id, criterion]))
  if (provided.size !== storedCriteria.length || storedCriteria.some((criterion) => !provided.has(criterion.id))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ratings must match the published scorecard criteria',
    })
  }
  const kpiEvidence = await queryOne<any>(
    `SELECT COUNT(kpi.id)::int AS active_kpi_count,
            COUNT(observation.id) FILTER (WHERE observation.evidence_status = 'verified')::int AS verified_kpi_count,
            COALESCE(json_agg(json_build_object(
              'observationId', observation.id,
              'kpiDefinitionId', kpi.id,
              'kpiName', kpi.name,
              'sourceRef', observation.source_ref,
              'periodEnd', observation.period_end
            )) FILTER (WHERE observation.evidence_status = 'verified'), '[]'::json) AS verified_refs
     FROM hr_role_kpi_definitions kpi
     LEFT JOIN LATERAL (
       SELECT candidate.* FROM hr_kpi_observations candidate
       WHERE candidate.participant_id = $1 AND candidate.kpi_definition_id = kpi.id
       ORDER BY candidate.period_end DESC, candidate.updated_at DESC LIMIT 1
     ) observation ON true
     WHERE kpi.role_profile_version_id = (
       SELECT role_profile_version_id FROM hr_review_participants WHERE id = $1
     ) AND kpi.status = 'active'`,
    [participantId],
  )
  const activeKpiCount = Number(kpiEvidence?.active_kpi_count || 0)
  const verifiedKpiCount = Number(kpiEvidence?.verified_kpi_count || 0)
  const verifiedKpiRefs = (kpiEvidence?.verified_refs || []) as Array<{
    observationId: string
    kpiDefinitionId: string
    kpiName: string
    sourceRef: string
    periodEnd: string
  }>
  const normalizedCriteria = parsed.data.criteria.map((criterion) =>
    criterion.id === 'role-outcomes-kpis' && activeKpiCount > 0
      ? {
          ...criterion,
          hasSufficientEvidence: verifiedKpiCount === activeKpiCount,
          evidenceRefs: verifiedKpiRefs.map((ref) => `KPI observation ${ref.observationId}: ${ref.kpiName} · ${ref.sourceRef} · ${ref.periodEnd}`),
        }
      : criterion,
  )
  for (const criterion of normalizedCriteria) {
    if (criterion.hasSufficientEvidence && (criterion.rating === null || criterion.evidenceRefs.length === 0)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Evidence and a rating are required for ${criterion.id}`,
      })
    }
  }

  const calculation = calculateHrRoleScore({
    criteria: storedCriteria.map((criterion) => ({
      id: criterion.id,
      weight: Number(criterion.weight),
      rating: normalizedCriteria.find((value) => value.id === criterion.id)?.rating ?? null,
      hasSufficientEvidence: normalizedCriteria.find((value) => value.id === criterion.id)?.hasSufficientEvidence ?? false,
    })),
    operationalEnablement: parsed.data.operationalEnablement,
    minimumEvidenceCoverage: Number(row.evidence_threshold),
  })
  if (parsed.data.publish && !calculation.isPublishable) {
    throw createError({
      statusCode: 409,
      statusMessage: `Score cannot be published: evidence coverage is ${calculation.evidenceCoverage}%`,
    })
  }

  const saved = await transaction(async (db) => {
    const savedResult = await db.query(
      `INSERT INTO hr_scorecard_results
      (participant_id, scorecard_version_id, version, role_score, operational_enablement,
       evidence_coverage, confidence, publishable, calculation, published_by, published_at)
     SELECT $1, $2, COALESCE(MAX(version), 0) + 1, $3, $4, $5, $6, $7, $8::jsonb,
            CASE WHEN $9 THEN $10::uuid ELSE NULL END,
            CASE WHEN $9 THEN NOW() ELSE NULL END
     FROM hr_scorecard_results
     WHERE participant_id = $1 AND scorecard_version_id = $2
     RETURNING id, version, role_score, operational_enablement, evidence_coverage,
               confidence, publishable, published_at`,
      [
        row.id,
        row.scorecard_version_id,
        calculation.rolePerformanceScore,
        calculation.operationalEnablement,
        calculation.evidenceCoverage,
        calculation.confidence,
        calculation.isPublishable,
        JSON.stringify({
          calculation,
          ratings: normalizedCriteria,
          reviewerNotes: parsed.data.reviewerNotes || null,
          frameworkVersionLocked: true,
          kpiEvidenceServerVerified: activeKpiCount > 0,
        }),
        parsed.data.publish,
        user.id,
      ],
    )
    const result = savedResult.rows[0]
    await recordHrAuditEvent(
      {
        actorId: user.id,
        action: parsed.data.publish ? 'scorecard.published' : 'scorecard.saved',
        targetType: 'scorecard_result',
        targetId: result.id,
        cycleId: row.cycle_id,
        metadata: {
          evidenceCoverage: calculation.evidenceCoverage,
          confidence: calculation.confidence,
          abstained: !calculation.isPublishable,
        },
      },
      db,
    )
    if (parsed.data.publish) {
      await db.query(`UPDATE hr_review_participants SET status = 'reviewed', updated_at = NOW() WHERE id = $1`, [row.id])
    }
    return result
  })

  if (parsed.data.publish) {
    await createNotification({
      userId: row.team_member_id,
      actorId: user.id,
      type: 'hr_scorecard_published',
      title: 'Business review outcome published',
      message: 'Your evidence-based review outcome and agreed follow-ups are available.',
      link: '/agency/hr',
      reason: 'direct',
      metadata: { participantId, scorecardResultId: saved.id },
    }).catch(() => {})
  }

  return {
    ok: true,
    result: saved,
    calculation,
    kpiEvidence: {
      activeKpiCount,
      verifiedKpiCount,
      isSufficient: activeKpiCount === 0 || verifiedKpiCount === activeKpiCount,
    },
  }
})
