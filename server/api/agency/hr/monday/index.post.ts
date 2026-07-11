import { createError, readBody, setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { generateEmbedding, upsertVector } from '~~/server/utils/aiVectorize'
import { queryRows, queryOne, execute } from '~~/server/utils/db'

/** Index approved Monday process context; structured tasks remain authoritative. */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const scope = await getActiveMondayEvidenceScope()
  if (!scope) throw createError({ statusCode: 409, statusMessage: 'An approved Monday evidence scope is required before indexing' })
  const allowed = new Set(scope.allowed_fields.map(field => field.toLowerCase()))
  if (!allowed.has('name') && !allowed.has('title')) {
    throw createError({ statusCode: 409, statusMessage: 'The approved scope does not allow Monday item titles to be indexed' })
  }
  const body = await readBody<{ batchSize?: number }>(event)
  const batchSize = Math.min(Math.max(Number(body?.batchSize) || 25, 1), 100)
  const rows = await queryRows<{ sourceId: string; title: string; boardId: string; itemId: string; taskId: string | null }>(
    `SELECT DISTINCT ON (COALESCE(mim.monday_board_id, bm.monday_board_id), mim.monday_item_id)
            COALESCE(mim.monday_board_id, bm.monday_board_id) || ':' || mim.monday_item_id AS "sourceId",
            mim.monday_item_name AS title,
            COALESCE(mim.monday_board_id, bm.monday_board_id) AS "boardId",
            mim.monday_item_id AS "itemId", mim.task_id AS "taskId"
       FROM monday_item_mappings mim
       LEFT JOIN monday_board_mappings bm ON bm.id = mim.board_mapping_id
      WHERE COALESCE(mim.monday_board_id, bm.monday_board_id) = ANY($1::text[])
        AND mim.status = 'completed'
        AND mim.created_at::date BETWEEN GREATEST($3::date, CURRENT_DATE - ($5::int * INTERVAL '1 day')) AND $4::date
        AND NOT EXISTS (
          SELECT 1 FROM hr_knowledge_records hkr
           WHERE hkr.source_type = 'monday_item'
             AND hkr.source_id = COALESCE(mim.monday_board_id, bm.monday_board_id) || ':' || mim.monday_item_id
             AND hkr.revoked_at IS NULL
        )
      ORDER BY COALESCE(mim.monday_board_id, bm.monday_board_id), mim.monday_item_id, mim.updated_at DESC
      LIMIT $2`,
    [scope.board_ids, batchSize, scope.period_start, scope.period_end, scope.retention_days],
  )
  let indexed = 0
  let skipped = 0
  for (const row of rows) {
    const content = `Monday process item: ${row.title}`
    const embedding = await generateEmbedding(event, content)
    if (!embedding.length) { skipped++; continue }
    const record = await queryOne<{ id: string }>(
      `INSERT INTO hr_knowledge_records (source_type, source_id, scope_id, title, content, access_policy, retention_until, indexed_at)
       VALUES ('monday_item', $1, $2, $3, $4, 'hr_owner', CURRENT_DATE + $5::int, NOW())
       ON CONFLICT (source_type, source_id) DO UPDATE SET scope_id = $2, title = $3, content = $4, retention_until = CURRENT_DATE + $5::int, indexed_at = NOW(), revoked_at = NULL, updated_at = NOW()
       RETURNING id`,
      [row.sourceId, scope.id, row.title, content, scope.retention_days],
    )
    const vectorId = `hr-monday:${record!.id}`
    await upsertVector(event, vectorId, embedding, { type: 'hr_monday_process', scopeId: scope.id, sourceId: row.sourceId, boardId: row.boardId, itemId: row.itemId })
    await execute(`UPDATE hr_knowledge_records SET vector_id = $1 WHERE id = $2`, [vectorId, record!.id])
    indexed++
  }
  await recordHrAuditEvent({ actorId: user.id, action: 'monday_knowledge.indexed', targetType: 'monday_evidence_scope', targetId: scope.id, metadata: { scanned: rows.length, indexed, skipped } })
  return { ok: true, scopeId: scope.id, scanned: rows.length, indexed, skipped, limitations: ['Only item titles are indexed in this first pass', 'Structured task fields remain relational', 'Private messages, comments, files, and questionnaire answers are excluded'] }
})
