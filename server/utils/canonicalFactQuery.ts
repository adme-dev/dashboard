// server/utils/canonicalFactQuery.ts
/**
 * Fetch the canonical daily fact (date × canonical channel) for a window,
 * optionally scoped to one client. Resolves native ad-platform / lead-source /
 * GA4 channel values to canonical channels via channelTaxonomy, then merges
 * with buildCanonicalFactRows. Shared by the export API and NL-insights.
 */
import { queryRows } from './db'
import { resolveCanonicalChannel } from './channelTaxonomy'
import { buildCanonicalFactRows, type CanonicalFactRow } from './canonicalFact'

export async function fetchCanonicalFact(
  opts: { startDate: string, endDate: string, clientId?: string }
): Promise<CanonicalFactRow[]> {
  const { startDate, endDate, clientId } = opts

  // Spend / conversions / revenue per day+platform (client via direct col or connection link).
  const spendParams: unknown[] = clientId ? [startDate, endDate, clientId] : [startDate, endDate]
  const spendRows = await queryRows<{ date: string, platform: string, spend: string, conversions: string, revenue: string }>(
    `SELECT ds.spend_date::text AS date, ms.platform AS platform,
            COALESCE(SUM(ds.spend),0) AS spend,
            COALESCE(SUM(ds.conversions),0) AS conversions,
            COALESCE(SUM(ds.revenue),0) AS revenue
     FROM daily_spend ds
     JOIN media_spend ms ON ms.id = ds.media_spend_id
     LEFT JOIN social_connections sc ON sc.id = ms.connection_id
     WHERE ds.spend_date BETWEEN $1 AND $2
       ${clientId ? 'AND COALESCE(ms.client_id, sc.client_id) = $3' : ''}
     GROUP BY ds.spend_date, ms.platform`,
    spendParams
  )

  // GA4 sessions per day+channel.
  const ga4Params: unknown[] = clientId ? [startDate, endDate, clientId] : [startDate, endDate]
  const ga4Rows = await queryRows<{ date: string, channel_group: string, sessions: string }>(
    `SELECT metric_date::text AS date, channel_group, COALESCE(SUM(sessions),0) AS sessions
     FROM ga4_daily_channel
     WHERE metric_date BETWEEN $1 AND $2 ${clientId ? 'AND client_id = $3' : ''}
     GROUP BY metric_date, channel_group`,
    ga4Params
  )

  // Owned leads per day+source.
  const leadParams: unknown[] = clientId ? [startDate, endDate, clientId] : [startDate, endDate]
  const leadRows = await queryRows<{ date: string, source: string, leads: string }>(
    `SELECT submitted_at::date::text AS date, source, COUNT(*) AS leads
     FROM leads
     WHERE deleted_at IS NULL AND submitted_at::date BETWEEN $1 AND $2
       ${clientId ? 'AND client_id = $3' : ''}
     GROUP BY submitted_at::date, source`,
    leadParams
  )

  const spend = []
  for (const r of spendRows) {
    const channel = (await resolveCanonicalChannel('ad_platform', r.platform)) ?? 'Other'
    spend.push({ date: r.date, channel, spend: Number(r.spend), conversions: Number(r.conversions), revenue: Number(r.revenue) })
  }
  const sessions = []
  for (const r of ga4Rows) {
    const channel = (await resolveCanonicalChannel('ga4', r.channel_group)) ?? r.channel_group
    sessions.push({ date: r.date, channel, sessions: Number(r.sessions) })
  }
  const leads = []
  for (const r of leadRows) {
    const channel = (await resolveCanonicalChannel('lead_source', r.source)) ?? 'Other'
    leads.push({ date: r.date, channel, leads: Number(r.leads) })
  }

  return buildCanonicalFactRows({ spend, sessions, leads })
}
