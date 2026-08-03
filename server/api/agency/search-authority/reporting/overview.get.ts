import { getQuery } from 'h3'
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { searchConsoleOpportunityWindow, searchConsoleSyncWindow } from '~~/server/utils/searchAuthority/dates'
import { loadSearchAuthorityMeasurement } from '~~/server/utils/searchAuthority/measurement'
import { buildReviewedPmaxSuggestion } from '~~/server/utils/searchAuthority/opportunities'

const Query = z.object({
  clientId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
})

interface OpportunityRow {
  id: string
  title: string
  summary: string
  query_text: string | null
  page_url: string | null
  evidence_start_date: string
  evidence_end_date: string
}

export default eventHandler(async (event) => {
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid reporting request' })
  await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  let window: { startDate: string, endDate: string }
  try {
    window = parsed.data.startDate || parsed.data.endDate
      ? searchConsoleSyncWindow({ startDate: parsed.data.startDate, endDate: parsed.data.endDate })
      : searchConsoleOpportunityWindow()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'The reporting window must be valid and no longer than 90 days' })
  }
  const [measurement, opportunity] = await Promise.all([
    loadSearchAuthorityMeasurement(parsed.data.clientId, window),
    queryOne<OpportunityRow>(`
      SELECT id, title, summary, query_text, page_url,
        evidence_start_date, evidence_end_date
      FROM search_authority_opportunities
      WHERE client_id = $1
        AND lifecycle_status IN ('accepted', 'task_created', 'in_progress', 'published', 'measuring')
      ORDER BY score DESC, last_detected_at DESC
      LIMIT 1
    `, [parsed.data.clientId])
  ])
  return {
    ...measurement,
    evidenceLabels: {
      views: measurement.firstParty.available
        ? 'Measured by the XeroFlow first-party tag on the published guide.'
        : 'Unavailable',
      ctaHandoffs: measurement.firstParty.available
        ? 'Measured clicks from the guide to the tagged dealership destination.'
        : 'Unavailable',
      leads: 'Direct and assisted only when the lead retains the publication UTM marker.',
      ga4: measurement.ga4.available ? 'Aggregate GA4 landing-page evidence.' : 'Unavailable'
    },
    pmaxSuggestion: opportunity
      ? buildReviewedPmaxSuggestion({
          id: opportunity.id,
          title: opportunity.title,
          summary: opportunity.summary,
          queryText: opportunity.query_text,
          pageUrl: opportunity.page_url,
          evidenceStartDate: opportunity.evidence_start_date,
          evidenceEndDate: opportunity.evidence_end_date
        })
      : null
  }
})
