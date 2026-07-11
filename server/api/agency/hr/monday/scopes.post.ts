import { createError, readBody, setHeader } from 'h3'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrMondayEvidenceScopeSchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const parsed = hrMondayEvidenceScopeSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Monday evidence scope', data: { issues: parsed.error.issues } })
  const input = parsed.data
  const result = await transaction(async (db) => {
    if (input.status === 'approved') {
      await db.query(`UPDATE hr_monday_evidence_scopes SET status = 'revoked', revoked_at = NOW(), updated_at = NOW() WHERE status = 'approved'`)
    }
    const inserted = await db.query(
      `INSERT INTO hr_monday_evidence_scopes
        (workspace_ids, board_ids, destination_mappings, allowed_fields, purpose, exclusions,
         period_start, period_end, retention_days, status, created_by, approved_by, approved_at)
       VALUES ($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7::date, $8::date,
               $9, $10::text, $11::uuid, CASE WHEN $10::text = 'approved' THEN $11::uuid ELSE NULL::uuid END,
               CASE WHEN $10::text = 'approved' THEN NOW() ELSE NULL END)
       RETURNING id, workspace_ids, board_ids, destination_mappings, allowed_fields, purpose, exclusions,
                 period_start, period_end, retention_days, status, approved_at, created_at`,
      [JSON.stringify(input.workspaceIds), JSON.stringify(input.boardIds), JSON.stringify(input.destinationMappings), JSON.stringify(input.allowedFields),
        input.purpose, JSON.stringify(input.exclusions), input.periodStart, input.periodEnd,
        input.retentionDays, input.status, user.id],
    )
    const scope = inserted.rows[0]
    await recordHrAuditEvent({
      actorId: user.id,
      action: input.status === 'approved' ? 'monday_evidence_scope.approved' : 'monday_evidence_scope.created',
      targetType: 'monday_evidence_scope',
      targetId: scope.id,
      metadata: { boardCount: input.boardIds.length, destinationCount: input.destinationMappings.length, fieldCount: input.allowedFields.length, periodEnd: input.periodEnd },
    }, db)
    return scope
  })
  return { ok: true, scope: result }
})
