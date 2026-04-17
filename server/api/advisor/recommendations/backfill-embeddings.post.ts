/**
 * POST /api/advisor/recommendations/backfill-embeddings
 *
 * One-shot backfill for recommendations that were persisted before
 * Phase 2 shipped (or where an embed failed). Only owners/admins can
 * trigger it. Tenant-scoped — never embeds across tenants.
 *
 * Query params:
 *  - limit: max rows to process (default 50, cap 500)
 *  - force: if 'true', re-embed rows that already have a vector_id
 */

import { createError } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireRole } from '~~/server/utils/auth'
import { embedRecommendation } from '~~/server/utils/advisorEmbedder'

export default eventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const q = getQuery(event)
  const limit = Math.min(parseInt(typeof q.limit === 'string' ? q.limit : '50', 10) || 50, 500)
  const force = q.force === 'true' || q.force === '1'

  const rows = await queryRows<any>(
    `SELECT
       r.id, r.tenant_id, r.client_id, r.source_report_id,
       r.title, r.action, r.impact, r.priority, r.status, r.vector_id,
       far.period_key, far.period_label,
       ac.name AS client_name
     FROM recommendations r
     LEFT JOIN financial_advisor_reports far ON far.id = r.source_report_id
     LEFT JOIN agency_clients ac ON ac.id = r.client_id
     WHERE r.tenant_id = $1
       ${force ? '' : 'AND r.vector_id IS NULL'}
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [tenantId, limit]
  )

  let embedded = 0
  let failed = 0
  for (const r of rows) {
    try {
      const vectorId = await embedRecommendation(event, {
        id: r.id,
        tenant_id: r.tenant_id,
        client_id: r.client_id,
        client_name: r.client_name,
        source_report_id: r.source_report_id,
        period_key: r.period_key,
        period_label: r.period_label,
        title: r.title,
        action: r.action,
        impact: r.impact,
        priority: r.priority,
        status: r.status,
      })
      if (vectorId) embedded++
      else failed++
    } catch (err: any) {
      console.warn('[advisor.backfill] row failed:', r.id, err?.message ?? err)
      failed++
    }
  }

  return { processed: rows.length, embedded, failed }
})
