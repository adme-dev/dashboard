import { getQuery } from 'h3'
import { z } from 'zod'
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { searchConsoleSyncWindow } from '~~/server/utils/searchAuthority/dates'

const Lifecycle = z.enum([
  'new',
  'under_review',
  'accepted',
  'task_created',
  'in_progress',
  'published',
  'measuring',
  'closed',
  'dismissed',
  'duplicate',
  'expired',
  'not_actionable'
])

const Query = z.object({
  clientId: z.string().uuid(),
  lifecycle: z.union([Lifecycle, z.literal('all')]).default('all'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
})

interface OpportunityRow {
  id: string
  opportunity_type: string
  query_text: string | null
  page_url: string | null
  title: string
  summary: string
  score: number | string
  confidence: number | string
  scoring_version: string
  reason_codes: Array<{ code?: string }>
  lifecycle_status: string
  evidence_start_date: string
  evidence_end_date: string
  task_id: string | null
  data_through_date: string | null
  provisional_from_date: string | null
}

export default eventHandler(async (event) => {
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid opportunity filters'
    })
  }
  let window: { startDate: string, endDate: string } | null = null
  if (parsed.data.startDate || parsed.data.endDate) {
    try {
      window = searchConsoleSyncWindow({
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate
      })
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid opportunity evidence window'
      })
    }
  }
  const {
    clientId,
    lifecycle,
    page,
    pageSize
  } = parsed.data
  await requireAgencySearchAuthorityAccess(event, clientId)
  const params = [
    clientId,
    lifecycle === 'all' ? null : lifecycle,
    window?.startDate ?? null,
    window?.endDate ?? null
  ]
  const where = `opportunity.client_id = $1
       AND opportunity.property_map_id = (
         SELECT map.id
         FROM search_console_property_maps map
         WHERE map.client_id = $1
           AND map.status IN ('active', 'restricted')
         ORDER BY map.updated_at DESC
         LIMIT 1
       )
       AND ($2::text IS NULL OR opportunity.lifecycle_status = $2)
       AND ($3::date IS NULL OR opportunity.evidence_end_date >= $3::date)
       AND ($4::date IS NULL OR opportunity.evidence_start_date <= $4::date)`
  const [rows, count] = await Promise.all([
    queryRows<OpportunityRow>(
      `SELECT
         opportunity.*,
         map.data_through_date,
         map.provisional_from_date
       FROM search_authority_opportunities opportunity
       LEFT JOIN search_console_property_maps map
         ON map.client_id = opportunity.client_id
        AND map.id = opportunity.property_map_id
       WHERE ${where}
       ORDER BY
         CASE opportunity.lifecycle_status
           WHEN 'new' THEN 1
           WHEN 'under_review' THEN 2
           WHEN 'accepted' THEN 3
           ELSE 4
         END,
         opportunity.score DESC,
         opportunity.last_detected_at DESC,
         opportunity.id DESC
       LIMIT $5 OFFSET $6`,
      [...params, pageSize, (page - 1) * pageSize]
    ),
    queryOne<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM search_authority_opportunities opportunity
       WHERE ${where}`,
      params
    )
  ])

  return {
    opportunities: rows.map(row => ({
      id: row.id,
      opportunityType: row.opportunity_type,
      queryText: row.query_text,
      pageUrl: row.page_url,
      title: row.title,
      summary: row.summary,
      score: Number(row.score),
      confidence: Number(row.confidence),
      scoringVersion: row.scoring_version,
      reasonCodes: row.reason_codes,
      lifecycleStatus: row.lifecycle_status,
      evidenceStartDate: row.evidence_start_date,
      evidenceEndDate: row.evidence_end_date,
      taskId: row.task_id,
      provider: {
        dataThroughDate: row.data_through_date,
        provisionalFromDate: row.provisional_from_date,
        provisional: row.reason_codes.some(
          reason => reason.code === 'provider_data_provisional'
        )
      }
    })),
    pagination: {
      page,
      pageSize,
      total: Number(count?.total || 0)
    }
  }
})
