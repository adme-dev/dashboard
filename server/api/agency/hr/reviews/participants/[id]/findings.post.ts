import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { canAccessHrParticipant } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrFindingSchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'id')
  if (!participantId || !/^[0-9a-f-]{36}$/i.test(participantId)) throw createError({ statusCode: 400, statusMessage: 'Invalid participant' })
  const parsed = hrFindingSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid review finding', data: { issues: parsed.error.issues } })
  const input = parsed.data
  const finding = await transaction(async (db) => {
    const participantResult = await db.query('SELECT id, team_member_id, reviewer_id, cycle_id FROM hr_review_participants WHERE id = $1', [participantId])
    const participant = participantResult.rows[0]
    if (!participant || !canAccessHrParticipant(user, { participantUserId: participant.team_member_id, reviewerIds: participant.reviewer_id ? [participant.reviewer_id] : [] }, 'score')) {
      throw createError({ statusCode: 403, statusMessage: 'Only the assigned reviewer may draft findings' })
    }
    const result = await db.query(
      `INSERT INTO hr_review_findings
        (participant_id, finding_type, accountability_class, title, statement, evidence_refs,
         contrary_evidence_review, confidence, adverse_individual, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
       RETURNING id, participant_id, finding_type, accountability_class, title, status, confidence, adverse_individual`,
      [participantId, input.findingType, input.accountabilityClass, input.title, input.statement,
        JSON.stringify(input.evidenceRefs), input.contraryEvidenceReview, input.confidence, input.adverseIndividual, user.id],
    )
    await recordHrAuditEvent({ actorId: user.id, action: 'finding.drafted', targetType: 'review_finding', targetId: result.rows[0].id, cycleId: participant.cycle_id, metadata: { findingType: input.findingType, adverseIndividual: input.adverseIndividual } }, db)
    return result.rows[0]
  })
  return { ok: true, finding }
})
