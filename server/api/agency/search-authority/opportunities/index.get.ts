import { getQuery } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'

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
  const clientId = String(getQuery(event).clientId || '')
  await requireAgencySearchAuthorityAccess(event, clientId)
  const rows = await queryRows<OpportunityRow>(
    `SELECT
       opportunity.*,
       map.data_through_date,
       map.provisional_from_date
     FROM search_authority_opportunities opportunity
     LEFT JOIN search_console_property_maps map
       ON map.client_id = opportunity.client_id
      AND map.id = opportunity.property_map_id
     WHERE opportunity.client_id = $1
     ORDER BY
       CASE opportunity.lifecycle_status
         WHEN 'new' THEN 1
         WHEN 'under_review' THEN 2
         WHEN 'accepted' THEN 3
         ELSE 4
       END,
       opportunity.score DESC,
       opportunity.last_detected_at DESC`,
    [clientId]
  )

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
    }))
  }
})
