import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrFindingResponseSchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const findingId = getRouterParam(event, 'id')
  if (!findingId || !/^[0-9a-f-]{36}$/i.test(findingId)) throw createError({ statusCode: 400, statusMessage: 'Invalid finding' })
  const parsed = hrFindingResponseSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid finding response', data: { issues: parsed.error.issues } })
  const input = parsed.data
  const result = await transaction(async (db) => {
    const findingResult = await db.query(
      `SELECT finding.id, finding.status, participant.team_member_id, participant.cycle_id
         FROM hr_review_findings finding JOIN hr_review_participants participant ON participant.id = finding.participant_id
        WHERE finding.id = $1 FOR UPDATE OF finding`, [findingId],
    )
    const finding = findingResult.rows[0]
    if (!finding || finding.team_member_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'Only the participant may respond to this finding' })
    if (finding.status !== 'participant_review') throw createError({ statusCode: 409, statusMessage: 'This finding is not awaiting participant response' })
    await db.query(
      `INSERT INTO hr_finding_responses (finding_id, participant_id, response, correction_requested, correction_detail, response_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (finding_id) DO UPDATE SET response = EXCLUDED.response, correction_requested = EXCLUDED.correction_requested,
         correction_detail = EXCLUDED.correction_detail, response_status = EXCLUDED.response_status, updated_at = NOW()`,
      [findingId, user.id, input.response || null, input.correctionRequested, input.correctionDetail || null, input.responseStatus],
    )
    await db.query('UPDATE hr_review_findings SET participant_response_status = $2, updated_at = NOW() WHERE id = $1', [findingId, input.responseStatus])
    await recordHrAuditEvent({ actorId: user.id, action: 'finding.participant_responded', targetType: 'review_finding', targetId: findingId, cycleId: finding.cycle_id, metadata: { responseStatus: input.responseStatus, correctionRequested: input.correctionRequested } }, db)
    return { responseStatus: input.responseStatus, correctionRequested: input.correctionRequested }
  })
  return { ok: true, response: result }
})
