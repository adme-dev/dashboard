import { createError, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

const Body = z.object({
  sourceType: z.enum(['published_finding', 'completed_action']),
  sourceId: z.string().uuid(),
  title: z.string().trim().min(3).max(300),
  content: z.string().trim().min(10).max(5000),
  provenanceNote: z.string().trim().min(10).max(2000),
  limitations: z.array(z.string().trim().min(5).max(500)).min(1).max(20),
})

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid review-learning promotion', data: { issues: parsed.error.issues } })
  const input = parsed.data

  const promoted = await transaction(async (db) => {
    const source = input.sourceType === 'published_finding'
      ? await db.query("SELECT id, title FROM hr_review_findings WHERE id = $1 AND status = 'published'", [input.sourceId])
      : await db.query("SELECT id, title FROM hr_follow_up_plans WHERE id = $1 AND status = 'completed'", [input.sourceId])
    if (!source.rows[0]) throw createError({ statusCode: 409, statusMessage: 'The source must still be a published finding or completed action' })

    const entryKey = `${input.sourceType}:${input.sourceId}`
    const existing = await db.query('SELECT id FROM hr_knowledge_entries WHERE entry_key = $1', [entryKey])
    if (existing.rows[0]) throw createError({ statusCode: 409, statusMessage: 'This review learning already has a governed knowledge draft' })

    const entry = await db.query(
      `INSERT INTO hr_knowledge_entries (entry_key, entry_type, title, status, owner_id, created_by)
       VALUES ($1, $2, $3, 'draft', $4, $4)
       RETURNING id, entry_key, entry_type, title, status`,
      [entryKey, input.sourceType, input.title, user.id],
    )
    const sourceRefs = [{ sourceType: input.sourceType, sourceId: input.sourceId, label: source.rows[0].title }]
    const version = await db.query(
      `INSERT INTO hr_knowledge_entry_versions
        (entry_id, version, content, status, source_refs, provenance_note, confidentiality,
         permitted_uses, limitations, effective_from, review_due_at,
         general_ai_excluded, created_by)
       VALUES ($1, 1, $2, 'draft', $3::jsonb, $4, 'restricted_hr',
               '["review_context","solution_recommendation","aggregate_reporting"]'::jsonb,
               $5::jsonb, CURRENT_DATE, CURRENT_DATE + 180, TRUE, $6)
       RETURNING id, version, status, general_ai_excluded`,
      [entry.rows[0].id, input.content, JSON.stringify(sourceRefs), input.provenanceNote, JSON.stringify(input.limitations), user.id],
    )
    await recordHrAuditEvent({
      actorId: user.id,
      action: 'hr_knowledge.review_learning_promoted',
      targetType: 'hr_knowledge_entry',
      targetId: entry.rows[0].id,
      metadata: { sourceType: input.sourceType, sourceId: input.sourceId, status: 'draft', generalAiExcluded: true },
    }, db)
    return { entry: entry.rows[0], version: version.rows[0] }
  })

  return { ok: true, ...promoted }
})
