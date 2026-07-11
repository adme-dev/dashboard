import { createError, getRouterParam, setHeader } from 'h3'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { deleteVector } from '~~/server/utils/aiVectorize'
import { runAfterResponse } from '~~/server/utils/asyncBackground'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid Monday scope' })
  const result = await transaction(async (db) => {
    const result = await db.query(
      `UPDATE hr_monday_evidence_scopes
       SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status <> 'revoked'
       RETURNING id, status, revoked_at`,
      [id],
    )
    if (!result.rows[0]) throw createError({ statusCode: 404, statusMessage: 'Monday scope not found or already revoked' })
    const vectors = await db.query(
      `UPDATE hr_knowledge_records SET revoked_at = NOW(), updated_at = NOW()
        WHERE scope_id = $1 AND revoked_at IS NULL
        RETURNING vector_id`,
      [id],
    )
    await recordHrAuditEvent({ actorId: user.id, action: 'monday_evidence_scope.revoked', targetType: 'monday_evidence_scope', targetId: id, metadata: { revokedKnowledgeRecords: vectors.rowCount || 0 } }, db)
    return { scope: result.rows[0], vectorIds: vectors.rows.map((row: { vector_id: string | null }) => row.vector_id).filter(Boolean) as string[] }
  })
  if (result.vectorIds.length) {
    runAfterResponse(event, Promise.all(result.vectorIds.map(vectorId => deleteVector(event, vectorId))), `Revoke HR Monday vectors ${id}`)
  }
  return { ok: true, scope: result.scope, revokedKnowledgeRecords: result.vectorIds.length }
})
