/**
 * Internal (portfolio) benchmarks
 * GET /api/agency/analytics/internal-benchmarks?startDate=&endDate=&clientId=
 *
 * Computes each client's GA4 engagement rate + conversion rate and blended
 * CPL/CPA over the window, then the portfolio distribution (quartiles) per
 * metric. With clientId, also returns that client's value and percentile rank
 * ("vs portfolio median"). Distinct from benchmarks.get.ts, which serves
 * external/industry benchmarks from platform_benchmarks.
 */
import { queryRows } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { summarize, percentileRank } from '~~/server/utils/benchmarks'

interface ClientMetrics {
  engagementRate: number | null
  cvr: number | null
  cpl: number | null
  cpa: number | null
}

const METRICS: Array<{ key: keyof ClientMetrics, lowerIsBetter: boolean }> = [
  { key: 'engagementRate', lowerIsBetter: false },
  { key: 'cvr', lowerIsBetter: false },
  { key: 'cpl', lowerIsBetter: true },
  { key: 'cpa', lowerIsBetter: true }
]

export default defineEventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const q = getQuery(event)
  const startDate = q.startDate as string
  const endDate = q.endDate as string
  const clientId = (q.clientId as string) || undefined
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  try {
    const [ga4Rows, spendRows, leadRows] = await Promise.all([
      queryRows<{ client_id: string, sessions: string, key_events: string, eng_w: string }>(
        `SELECT client_id::text AS client_id,
                COALESCE(SUM(sessions),0) AS sessions,
                COALESCE(SUM(key_events),0) AS key_events,
                COALESCE(SUM(engagement_rate * sessions),0) AS eng_w
         FROM ga4_daily_channel
         WHERE metric_date BETWEEN $1 AND $2 AND client_id IS NOT NULL
         GROUP BY client_id`,
        [startDate, endDate]
      ),
      queryRows<{ client_id: string, spend: string, conversions: string }>(
        // Resolve client via the direct column or the connection's client link
        // (most campaigns are mapped through the ad account, not ms.client_id).
        `SELECT COALESCE(ms.client_id, sc.client_id)::text AS client_id,
                COALESCE(SUM(ds.spend),0) AS spend,
                COALESCE(SUM(ds.conversions),0) AS conversions
         FROM daily_spend ds
         JOIN media_spend ms ON ms.id = ds.media_spend_id
         LEFT JOIN social_connections sc ON sc.id = ms.connection_id
         WHERE ds.spend_date BETWEEN $1 AND $2
           AND COALESCE(ms.client_id, sc.client_id) IS NOT NULL
         GROUP BY COALESCE(ms.client_id, sc.client_id)`,
        [startDate, endDate]
      ),
      queryRows<{ client_id: string, leads: string }>(
        `SELECT client_id::text AS client_id, COUNT(*) AS leads
         FROM leads
         WHERE deleted_at IS NULL AND submitted_at::date BETWEEN $1 AND $2 AND client_id IS NOT NULL
         GROUP BY client_id`,
        [startDate, endDate]
      )
    ])

    // Combine per client_id.
    const byClient = new Map<string, { sessions: number, keyEvents: number, engW: number, spend: number, conversions: number, leads: number }>()
    const ensure = (id: string) => {
      let c = byClient.get(id)
      if (!c) {
        c = { sessions: 0, keyEvents: 0, engW: 0, spend: 0, conversions: 0, leads: 0 }
        byClient.set(id, c)
      }
      return c
    }
    for (const r of ga4Rows) {
      const c = ensure(r.client_id)
      c.sessions += Number(r.sessions)
      c.keyEvents += Number(r.key_events)
      c.engW += Number(r.eng_w)
    }
    for (const r of spendRows) {
      const c = ensure(r.client_id)
      c.spend += Number(r.spend)
      c.conversions += Number(r.conversions)
    }
    for (const r of leadRows) {
      ensure(r.client_id).leads += Number(r.leads)
    }

    // Per-client metric values (null when not computable).
    const metricsByClient = new Map<string, ClientMetrics>()
    for (const [id, c] of byClient) {
      metricsByClient.set(id, {
        engagementRate: c.sessions > 0 ? c.engW / c.sessions : null,
        cvr: c.sessions > 0 ? c.keyEvents / c.sessions : null,
        cpl: c.spend > 0 && c.leads > 0 ? c.spend / c.leads : null,
        cpa: c.spend > 0 && c.conversions > 0 ? c.spend / c.conversions : null
      })
    }

    const focal = clientId ? metricsByClient.get(clientId) : undefined

    const metrics: Record<string, unknown> = {}
    for (const { key, lowerIsBetter } of METRICS) {
      const values = [...metricsByClient.values()]
        .map(m => m[key])
        .filter((v): v is number => v != null)
      const focalValue = focal ? focal[key] : null
      metrics[key] = {
        lowerIsBetter,
        portfolio: summarize(values),
        client: focalValue == null
          ? null
          : {
              value: focalValue,
              percentileRank: percentileRank(values, focalValue)
            }
      }
    }

    // Per-client leaderboard — only the no-client (agency-wide) view consumes it,
    // so skip the extra name lookup and payload entirely when a client is selected.
    let clients: Array<{ clientId: string, clientName: string, metrics: ClientMetrics }> = []
    if (!clientId) {
      const ids = [...metricsByClient.keys()]
      const nameRows = ids.length
        ? await queryRows<{ id: string, name: string }>(
            `SELECT id::text AS id, name FROM agency_clients WHERE id = ANY($1::uuid[])`,
            [ids]
          )
        : []
      const nameById = new Map(nameRows.map(r => [r.id, r.name]))
      clients = ids.map(id => ({
        clientId: id,
        clientName: nameById.get(id) ?? 'Unknown client',
        metrics: metricsByClient.get(id)!
      }))
    }

    return { window: { startDate, endDate }, clientCount: metricsByClient.size, metrics, clients }
  } catch (error) {
    console.error('Internal benchmarks failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to compute internal benchmarks' })
  }
})
