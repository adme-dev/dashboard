/**
 * Agency Funnel — staff-facing internal twin of the portal funnel.
 * GET /api/agency/analytics/funnel?clientId=&startDate=&endDate=
 * Returns the current-window funnel plus the previous equal-length window's
 * totals (for period-over-period deltas in the UI).
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { buildClientCondition } from '~~/server/utils/analyticsMetrics'
import { buildFunnel, previousWindow, type FunnelChannelRow } from '~~/server/utils/ga4Funnel'

const SPEND_CHANNEL_CASE = `CASE
  WHEN ms.platform IN ('google_ads','google') THEN 'Paid Search'
  WHEN ms.platform IN ('meta','meta_ads') THEN 'Paid Social'
  ELSE 'Other' END`

const LEAD_CHANNEL_CASE = `CASE
  WHEN l.source = 'google' THEN 'Paid Search'
  WHEN l.source = 'meta' THEN 'Paid Social'
  ELSE 'Other' END`

async function funnelForWindow(
  clientId: string,
  startDate: string,
  endDate: string
): Promise<{ channels: FunnelChannelRow[], totals: FunnelChannelRow, hasGa4: boolean }> {
  const spendRows = await queryRows<{ channel: string, spend: string }>(
    `SELECT ${SPEND_CHANNEL_CASE} AS channel, COALESCE(SUM(ds.spend),0) AS spend
     FROM daily_spend ds
     JOIN media_spend ms ON ms.id = ds.media_spend_id
     WHERE ${buildClientCondition(1)} AND ds.spend_date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )
  const ga4Rows = await queryRows<{ channel: string, sessions: string, engaged: string, key_events: string }>(
    `SELECT channel_group AS channel,
            COALESCE(SUM(sessions),0) AS sessions,
            COALESCE(SUM(engaged_sessions),0) AS engaged,
            COALESCE(SUM(key_events),0) AS key_events
     FROM ga4_daily_channel
     WHERE client_id = $1 AND metric_date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )
  const leadRows = await queryRows<{ channel: string, leads: string }>(
    `SELECT ${LEAD_CHANNEL_CASE} AS channel, COUNT(*) AS leads
     FROM leads l
     WHERE l.client_id = $1 AND l.deleted_at IS NULL
       AND l.source IN ('google', 'meta')
       AND l.submitted_at::date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )

  const spendByChannel: Record<string, number> = {}
  for (const r of spendRows) spendByChannel[r.channel] = Number(r.spend)
  const ga4ByChannel: Record<string, { sessions: number, engagedSessions: number, keyEvents: number }> = {}
  for (const r of ga4Rows) ga4ByChannel[r.channel] = { sessions: Number(r.sessions), engagedSessions: Number(r.engaged), keyEvents: Number(r.key_events) }
  const leadsByChannel: Record<string, number> = {}
  for (const r of leadRows) leadsByChannel[r.channel] = Number(r.leads)

  const funnel = buildFunnel({ spendByChannel, ga4ByChannel, leadsByChannel })
  return { ...funnel, hasGa4: ga4Rows.length > 0 }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!clientId || !startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'clientId, startDate and endDate are required' })
  }

  const { prevStart, prevEnd } = previousWindow(startDate, endDate)
  // hasGa4 reflects the current window only; previous-window GA4 presence isn't needed by the UI.
  const [current, previous] = await Promise.all([
    funnelForWindow(clientId, startDate, endDate),
    funnelForWindow(clientId, prevStart, prevEnd)
  ])

  return {
    channels: current.channels,
    totals: current.totals,
    hasGa4: current.hasGa4,
    previous: { totals: previous.totals }
  }
})
