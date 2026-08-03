import { getQuery } from 'h3'
import { z } from 'zod'

import { queryRows } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import type { SearchAuthorityPerformanceEvidence } from '~~/server/utils/searchAuthority/performanceEvidence'

const Query = z.object({
  clientId: z.string().uuid(),
  status: z.enum(['all', 'open', 'actioned', 'resolved', 'dismissed']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50)
})

interface TrustFindingRow {
  id: string
  page_id: string
  page_url: string
  check_key: string
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  owner: 'xeroflow' | 'dealer_origin' | 'external_provider'
  lifecycle_status: 'open' | 'actioned' | 'resolved' | 'dismissed'
  title: string
  summary: string
  evidence: Record<string, string | number | boolean | null>
  recurrence_count: number | string
  task_id: string | null
  first_seen_at: Date | string
  last_seen_at: Date | string
  performance_evidence: SearchAuthorityPerformanceEvidence | null
}

interface PerformanceRow {
  evidence: SearchAuthorityPerformanceEvidence
}

export default eventHandler(async (event) => {
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid trust finding filters' })
  }
  const { clientId, status, limit } = parsed.data
  await requireAgencySearchAuthorityAccess(event, clientId)

  const [rows, performanceRows] = await Promise.all([
    queryRows<TrustFindingRow>(`
    SELECT finding.id,
           finding.page_id,
           page.canonical_url AS page_url,
           finding.check_key,
           finding.severity,
           finding.owner,
           finding.lifecycle_status,
           finding.title,
           finding.summary,
           finding.evidence,
           finding.recurrence_count,
           finding.task_id,
           finding.first_seen_at,
           finding.last_seen_at,
           performance.evidence AS performance_evidence
    FROM search_authority_trust_findings finding
    JOIN site_intelligence_pages page
      ON page.client_id = finding.client_id
     AND page.id = finding.page_id
    LEFT JOIN LATERAL (
      SELECT observation.evidence
      FROM search_authority_performance_evidence observation
      WHERE observation.client_id = finding.client_id
        AND observation.page_id = finding.page_id
      ORDER BY observation.collected_at DESC
      LIMIT 1
    ) performance ON TRUE
    WHERE finding.client_id = $1
      AND ($2::text IS NULL OR finding.lifecycle_status = $2)
    ORDER BY
      CASE finding.severity
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3
        WHEN 'low' THEN 4 ELSE 5
      END,
      finding.last_seen_at DESC,
      finding.id DESC
    LIMIT $3
    `, [clientId, status === 'all' ? null : status, limit]),
    queryRows<PerformanceRow>(`
      SELECT DISTINCT ON (observation.page_id) observation.evidence
      FROM search_authority_performance_evidence observation
      WHERE observation.client_id = $1
      ORDER BY observation.page_id, observation.collected_at DESC
      LIMIT 20
    `, [clientId])
  ])

  return {
    generatedAt: new Date().toISOString(),
    performance: performanceRows.map(row => row.evidence),
    findings: rows.map(row => ({
      id: row.id,
      pageId: row.page_id,
      pageUrl: row.page_url,
      checkKey: row.check_key,
      severity: row.severity,
      owner: row.owner,
      lifecycleStatus: row.lifecycle_status,
      title: row.title,
      summary: row.summary,
      evidence: row.evidence,
      recurrenceCount: Number(row.recurrence_count),
      taskId: row.task_id,
      firstSeenAt: dateValue(row.first_seen_at),
      lastSeenAt: dateValue(row.last_seen_at),
      performance: row.performance_evidence
    }))
  }
})

function dateValue(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}
