/**
 * GET /api/advisor/recommendations/similar?id=<rec-id>[&topK=5]
 *
 * Cosine-similar past advice for a given recommendation, scoped to the
 * tenant. Excludes the source row itself. If Vectorize is unavailable
 * or the row has no embedding yet, returns an empty list rather than
 * erroring.
 *
 * Also callable with `text=<freeform>` to search by raw query string —
 * used during advisor generation to pre-pull "still open from prior
 * months" candidates against the new report's risks.
 */

import { createError } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth } from '~~/server/utils/auth'
import { searchSimilarAdvisor } from '~~/server/utils/advisorEmbedder'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const q = getQuery(event)
  const id = typeof q.id === 'string' ? q.id : null
  const rawText = typeof q.text === 'string' ? q.text : null
  const topK = Math.min(parseInt(typeof q.topK === 'string' ? q.topK : '5', 10) || 5, 20)

  if (!id && !rawText) {
    throw createError({ statusCode: 400, statusMessage: 'Provide either id or text' })
  }

  let queryText = rawText
  let excludeVectorId: string | undefined
  let sourceRec: any = null

  if (id) {
    sourceRec = await queryOne<any>(
      `SELECT r.id, r.tenant_id, r.title, r.action, r.impact, r.vector_id,
              far.period_label, ac.name AS client_name
       FROM recommendations r
       LEFT JOIN financial_advisor_reports far ON far.id = r.source_report_id
       LEFT JOIN agency_clients ac ON ac.id = r.client_id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [id, tenantId]
    )
    if (!sourceRec) {
      throw createError({ statusCode: 404, statusMessage: 'Recommendation not found' })
    }
    excludeVectorId = sourceRec.vector_id ?? `advisor-rec:${sourceRec.id}`
    // Build the same text shape advisorEmbedder uses so neighbors are
    // consistent whether we search by id or by raw text later.
    const scope = sourceRec.client_name ? `Client: ${sourceRec.client_name}` : 'Scope: agency books'
    queryText = [
      scope,
      sourceRec.period_label ? `Period: ${sourceRec.period_label}` : '',
      `Title: ${sourceRec.title}`,
      `Action: ${sourceRec.action}`,
      sourceRec.impact ? `Impact: ${sourceRec.impact}` : '',
    ].filter(Boolean).join('\n')
  }

  if (!queryText) {
    return { matches: [] }
  }

  const matches = await searchSimilarAdvisor(event, queryText, tenantId, topK, excludeVectorId)
  if (matches.length === 0) {
    return { matches: [] }
  }

  // Hydrate with DB rows so the client has full context (status,
  // assignee, dates) without a second round-trip.
  const recIds = matches.map((m) => m.recommendation_id).filter(Boolean)
  if (recIds.length === 0) {
    return { matches: [] }
  }

  const rows = await queryRows<any>(
    `SELECT
       r.id, r.title, r.action, r.impact, r.priority, r.status,
       r.client_id, r.assigned_to, r.due_date, r.outcome_notes,
       r.acted_at, r.created_at, r.updated_at,
       far.period_key, far.period_label,
       ac.name AS client_name,
       tm.name AS assignee_name
     FROM recommendations r
     LEFT JOIN financial_advisor_reports far ON far.id = r.source_report_id
     LEFT JOIN agency_clients ac ON ac.id = r.client_id
     LEFT JOIN team_members tm ON tm.id = r.assigned_to
     WHERE r.id = ANY($1::uuid[]) AND r.tenant_id = $2`,
    [recIds, tenantId]
  )

  // Preserve vector-similarity order.
  const byId = new Map(rows.map((r: any) => [r.id, r]))
  const hydrated = matches
    .map((m) => {
      const row = byId.get(m.recommendation_id)
      return row ? { ...row, score: m.score } : null
    })
    .filter(Boolean)

  return { matches: hydrated }
})
