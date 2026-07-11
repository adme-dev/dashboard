import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrKnowledgeRevisionSchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const entryId = getRouterParam(event, 'id')
  if (!entryId || !/^[0-9a-f-]{36}$/i.test(entryId)) throw createError({ statusCode: 400, statusMessage: 'Invalid HR knowledge entry' })
  const parsed = hrKnowledgeRevisionSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid HR knowledge revision', data: { issues: parsed.error.issues } })
  const input = parsed.data
  const result = await transaction(async (db) => {
    const currentResult = await db.query(
      `SELECT entry.id, entry.entry_type, latest.id AS version_id, latest.version, latest.status,
              approved.id AS approved_version_id
         FROM hr_knowledge_entries entry
         JOIN LATERAL (SELECT id, version, status FROM hr_knowledge_entry_versions WHERE entry_id = entry.id ORDER BY version DESC LIMIT 1) latest ON TRUE
         LEFT JOIN LATERAL (SELECT id FROM hr_knowledge_entry_versions WHERE entry_id = entry.id AND status = 'approved' ORDER BY version DESC LIMIT 1) approved ON TRUE
        WHERE entry.id = $1 FOR UPDATE OF entry`,
      [entryId],
    )
    const current = currentResult.rows[0]
    if (!current) throw createError({ statusCode: 404, statusMessage: 'HR knowledge entry not found' })
    if (current.version !== input.expectedVersion) throw createError({ statusCode: 409, statusMessage: 'This knowledge entry has a newer version. Refresh before revising.' })
    if (current.entry_type !== input.entryType) throw createError({ statusCode: 409, statusMessage: 'Knowledge entry type cannot change between versions' })
    const nextVersion = current.version + 1
    if (input.status === 'approved' && current.approved_version_id) {
      await db.query(`UPDATE hr_knowledge_entry_versions SET status = 'superseded', updated_at = NOW() WHERE id = $1`, [current.approved_version_id])
    }
    const versionResult = await db.query(
      `INSERT INTO hr_knowledge_entry_versions
        (entry_id, version, content, status, source_refs, provenance_note, confidentiality,
         permitted_uses, limitations, effective_from, review_due_at, retention_review_at,
         dispute_note, supersedes_version_id, general_ai_excluded, approved_by, approved_at, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12,
               $13, $14, TRUE, CASE WHEN $4 = 'approved' THEN $15 ELSE NULL END,
               CASE WHEN $4 = 'approved' THEN NOW() ELSE NULL END, $15)
       RETURNING id, version, status, review_due_at, general_ai_excluded`,
      [entryId, nextVersion, input.content, input.status, JSON.stringify(input.sourceRefs), input.provenanceNote,
        input.confidentiality, JSON.stringify(input.permittedUses), JSON.stringify(input.limitations), input.effectiveFrom,
        input.reviewDueAt, input.retentionReviewAt || null, input.disputeNote || null, current.version_id, user.id],
    )
    const version = versionResult.rows[0]
    if (input.status === 'approved' && current.approved_version_id) {
      await db.query(`UPDATE hr_knowledge_entry_versions SET superseded_by_version_id = $2 WHERE id = $1`, [current.approved_version_id, version.id])
    }
    await db.query(`UPDATE hr_knowledge_entries SET title = $2, status = $3, owner_id = COALESCE($4, owner_id), updated_at = NOW() WHERE id = $1`, [entryId, input.title, input.status, input.ownerId || null])
    await recordHrAuditEvent({
      actorId: user.id,
      action: input.status === 'approved' ? 'hr_knowledge.approved' : 'hr_knowledge.revised',
      targetType: 'hr_knowledge_entry', targetId: entryId,
      metadata: { status: input.status, version: nextVersion, generalAiExcluded: true },
    }, db)
    return version
  })
  return { ok: true, version: result }
})
