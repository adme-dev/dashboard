import { createError, readBody, setHeader } from 'h3'
import { randomUUID } from 'node:crypto'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrKnowledgeEntrySchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const parsed = hrKnowledgeEntrySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid HR knowledge entry', data: { issues: parsed.error.issues } })
  const input = parsed.data
  const result = await transaction(async (db) => {
    const entryKey = `${input.entryType}:${randomUUID()}`
    const entry = await db.query(
      `INSERT INTO hr_knowledge_entries (entry_key, entry_type, title, status, owner_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, entry_key, entry_type, title, status`,
      [entryKey, input.entryType, input.title, input.status, input.ownerId || user.id, user.id],
    )
    const version = await db.query(
      `INSERT INTO hr_knowledge_entry_versions
        (entry_id, version, content, status, source_refs, provenance_note, confidentiality,
         permitted_uses, limitations, effective_from, review_due_at, retention_review_at,
         dispute_note, general_ai_excluded, approved_by, approved_at, created_by)
       VALUES ($1, 1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11,
               $12, TRUE, CASE WHEN $3 = 'approved' THEN $13 ELSE NULL END,
               CASE WHEN $3 = 'approved' THEN NOW() ELSE NULL END, $13)
       RETURNING id, version, status, review_due_at, general_ai_excluded`,
      [entry.rows[0].id, input.content, input.status, JSON.stringify(input.sourceRefs), input.provenanceNote,
        input.confidentiality, JSON.stringify(input.permittedUses), JSON.stringify(input.limitations),
        input.effectiveFrom, input.reviewDueAt, input.retentionReviewAt || null, input.disputeNote || null, user.id],
    )
    await recordHrAuditEvent({
      actorId: user.id,
      action: 'hr_knowledge.created',
      targetType: 'hr_knowledge_entry',
      targetId: entry.rows[0].id,
      metadata: { entryType: input.entryType, status: input.status, version: 1, generalAiExcluded: true },
    }, db)
    return { entry: entry.rows[0], version: version.rows[0] }
  })
  return { ok: true, ...result }
})
