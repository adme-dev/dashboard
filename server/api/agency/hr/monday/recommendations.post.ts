import { createError, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { buildMondayProcessSuggestions } from '~~/server/utils/hr/mondayProcessSuggestions'
import { loadMondayProcessSummaries } from '~~/server/utils/hr/mondayProcessSuggestionSource'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { transaction } from '~~/server/utils/db'

const Body = z.object({ candidateId: z.string().regex(/^(process_profile|question_bank):[^:]+$/) })

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Monday suggestion' })
  const scope = await getActiveMondayEvidenceScope()
  if (!scope) throw createError({ statusCode: 409, statusMessage: 'An approved Monday evidence scope is required' })

  const summaries = await loadMondayProcessSummaries(scope)
  const candidate = summaries.flatMap(buildMondayProcessSuggestions).find(item => item.candidateId === parsed.data.candidateId)
  if (!candidate) throw createError({ statusCode: 404, statusMessage: 'Suggestion is no longer available in the approved scope' })

  const entry = await transaction(async (db) => {
    const entryKey = `monday-suggestion:${scope.id}:${candidate.candidateId}`
    const inserted = await db.query(
      `INSERT INTO hr_knowledge_entries (entry_key, entry_type, title, status, created_by)
       VALUES ($1, $2, $3, 'draft', $4)
       ON CONFLICT (entry_key) DO NOTHING
       RETURNING id, status`,
      [entryKey, candidate.entryType, candidate.title, user.id],
    )
    if (!inserted.rows[0]) {
      const existing = await db.query('SELECT id, status FROM hr_knowledge_entries WHERE entry_key = $1', [entryKey])
      return { ...existing.rows[0], created: false }
    }
    await db.query(
      `INSERT INTO hr_knowledge_entry_versions
        (entry_id, version, content, status, source_refs, provenance_note, confidentiality,
         permitted_uses, limitations, effective_from, review_due_at, retention_review_at,
         general_ai_excluded, created_by)
       VALUES ($1, 1, $2, 'draft', $3::jsonb, $4, 'restricted_hr', $5::jsonb, $6::jsonb,
               CURRENT_DATE, CURRENT_DATE + 90, CURRENT_DATE + $7::int, TRUE, $8)`,
      [
        inserted.rows[0].id,
        candidate.content,
        JSON.stringify([
          { sourceType: 'source_governance', sourceId: scope.id, label: 'Approved Monday evidence scope' },
          { sourceType: 'external_reference', sourceId: candidate.boardId, label: `Monday board ${candidate.boardId}` },
        ]),
        `${candidate.rationale} Generated deterministically from the active owner-approved Monday evidence scope.`,
        JSON.stringify(candidate.kind === 'question_bank' ? ['questionnaire_design'] : ['role_clarity', 'review_context']),
        JSON.stringify(candidate.limitations),
        scope.retention_days,
        user.id,
      ],
    )
    await recordHrAuditEvent({
      actorId: user.id,
      action: 'monday_process_suggestion.saved_as_draft',
      targetType: 'hr_knowledge_entry',
      targetId: inserted.rows[0].id,
      metadata: { scopeId: scope.id, candidateId: candidate.candidateId, entryType: candidate.entryType },
    }, db)
    return { ...inserted.rows[0], created: true }
  })
  return { entry, candidateId: candidate.candidateId, status: 'draft', automaticConclusion: false }
})
