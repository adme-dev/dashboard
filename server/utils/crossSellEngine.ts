/**
 * Cross-Sell Intelligence Engine
 *
 * Scores platforms a client is NOT using via three weighted signals:
 *   1. Peer Adoption (0.40) — what % of similar-spend clients use this platform?
 *   2. Performance Gap (0.35) — does this platform outperform the client's current worst?
 *   3. Spend Headroom (0.25) — does the client have budget room to expand?
 */

import { queryRows } from '~~/server/utils/db'
import { toNum, PLATFORM_LABELS } from '~~/server/utils/analyticsMetrics'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrossSellRecommendation {
  clientId: string
  clientName: string
  recommendedPlatform: string
  displayName: string
  score: number // 0–1
  reason: string // human-readable explanation
  peerAdoptionRate: number
  agencyAvgCPC: number | null
  agencyAvgCTR: number | null
  estimatedMonthlySpend: number
  confidence: 'high' | 'medium' | 'low'
}

interface ClientRow {
  client_id: string
  client_name: string
  platform: string
  total_spend: string | number
  total_budget: string | number
  impressions: string | number
  clicks: string | number
}

interface PlatformMedian {
  platform: string
  median_cpc: string | number | null
  median_ctr: string | number | null
  client_count: string | number
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function getCrossSellRecommendations(options?: {
  clientId?: string
  limit?: number
}): Promise<CrossSellRecommendation[]> {
  const limit = options?.limit ?? 20

  // 1. Determine the latest period that has spend data
  const latestPeriodRows = await queryRows<{ period: string }>(
    `SELECT period FROM media_spend
     WHERE actual_spend > 0
     ORDER BY period DESC LIMIT 1`
  )
  if (!latestPeriodRows.length) return []
  const latestPeriod = latestPeriodRows[0].period

  // 2. Fetch all client × platform aggregates for that period
  const clientData = await queryRows<ClientRow>(
    `SELECT
       ms.client_id,
       ac.name AS client_name,
       ms.platform,
       SUM(ms.actual_spend)       AS total_spend,
       SUM(ms.budget_allocated)   AS total_budget,
       SUM(COALESCE(ms.impressions, 0)) AS impressions,
       SUM(COALESCE(ms.clicks, 0))      AS clicks
     FROM media_spend ms
     JOIN agency_clients ac ON ac.id = ms.client_id
     WHERE ms.period = $1
       AND ms.client_id IS NOT NULL
       AND ac.is_active = true
     GROUP BY ms.client_id, ac.name, ms.platform`,
    [latestPeriod]
  )
  if (!clientData.length) return []

  // 3. Build per-client structures
  interface ClientProfile {
    clientId: string
    clientName: string
    platforms: Set<string>
    totalSpend: number
    totalBudget: number
    worstCPC: number | null // highest CPC (= worst efficiency)
    worstCTR: number | null // lowest CTR (= worst efficiency)
  }

  const clientMap = new Map<string, ClientProfile>()

  for (const row of clientData) {
    const cid = row.client_id
    if (!clientMap.has(cid)) {
      clientMap.set(cid, {
        clientId: cid,
        clientName: row.client_name,
        platforms: new Set(),
        totalSpend: 0,
        totalBudget: 0,
        worstCPC: null,
        worstCTR: null,
      })
    }
    const profile = clientMap.get(cid)!
    profile.platforms.add(row.platform)

    const spend = toNum(row.total_spend)
    const budget = toNum(row.total_budget)
    const impressions = toNum(row.impressions)
    const clicks = toNum(row.clicks)

    profile.totalSpend += spend
    profile.totalBudget += budget

    // Track worst CPC (highest) and worst CTR (lowest)
    if (clicks > 0) {
      const cpc = spend / clicks
      if (profile.worstCPC === null || cpc > profile.worstCPC) {
        profile.worstCPC = cpc
      }
    }
    if (impressions > 0) {
      const ctr = (clicks / impressions) * 100
      if (profile.worstCTR === null || ctr < profile.worstCTR) {
        profile.worstCTR = ctr
      }
    }
  }

  // 4. Compute agency-wide platform medians (CPC and CTR)
  //    Using percentile_cont for true medians.
  const medianRows = await queryRows<PlatformMedian>(
    `SELECT
       platform,
       PERCENTILE_CONT(0.5) WITHIN GROUP (
         ORDER BY CASE WHEN clicks > 0 THEN actual_spend / clicks ELSE NULL END
       ) AS median_cpc,
       PERCENTILE_CONT(0.5) WITHIN GROUP (
         ORDER BY CASE WHEN impressions > 0 THEN (clicks::NUMERIC / impressions) * 100 ELSE NULL END
       ) AS median_ctr,
       COUNT(DISTINCT client_id) AS client_count
     FROM media_spend
     WHERE period = $1
       AND actual_spend > 0
       AND client_id IS NOT NULL
     GROUP BY platform`,
    [latestPeriod]
  )

  const platformMedians = new Map<string, { medianCPC: number | null; medianCTR: number | null; clientCount: number }>()
  for (const row of medianRows) {
    platformMedians.set(row.platform, {
      medianCPC: row.median_cpc != null ? toNum(row.median_cpc) : null,
      medianCTR: row.median_ctr != null ? toNum(row.median_ctr) : null,
      clientCount: toNum(row.client_count),
    })
  }

  // 5. Score each client × missing platform combination
  const clients = options?.clientId
    ? [clientMap.get(options.clientId)].filter(Boolean) as ClientProfile[]
    : Array.from(clientMap.values())

  // All platforms actually in use across the agency this period
  const activePlatforms = new Set(clientData.map(r => r.platform))

  const recommendations: CrossSellRecommendation[] = []

  for (const client of clients) {
    if (client.totalSpend <= 0) continue // skip zero-spend clients

    for (const platform of activePlatforms) {
      if (client.platforms.has(platform)) continue // already using it

      // --- Signal 1: Peer Adoption (weight 0.40) ---
      // Peers = clients with total spend within ±50% of this client
      const spendLow = client.totalSpend * 0.5
      const spendHigh = client.totalSpend * 1.5
      let peerCount = 0
      let peersUsingPlatform = 0

      for (const other of clientMap.values()) {
        if (other.clientId === client.clientId) continue
        if (other.totalSpend < spendLow || other.totalSpend > spendHigh) continue
        peerCount++
        if (other.platforms.has(platform)) peersUsingPlatform++
      }

      const peerAdoptionRate = peerCount > 0 ? peersUsingPlatform / peerCount : 0
      const signal1 = peerAdoptionRate * 0.40

      // Confidence from peer count
      const confidence: CrossSellRecommendation['confidence'] =
        peerCount >= 10 ? 'high' : peerCount >= 5 ? 'medium' : 'low'

      // --- Signal 2: Performance Gap (weight 0.35) ---
      const platformStats = platformMedians.get(platform)
      let signal2 = 0
      let efficiencyReason = ''

      if (platformStats) {
        // CPC comparison: if the missing platform's median CPC < client's worst CPC → good
        if (platformStats.medianCPC != null && client.worstCPC != null && client.worstCPC > 0) {
          const cpcDelta = (client.worstCPC - platformStats.medianCPC) / client.worstCPC
          if (cpcDelta > 0) {
            signal2 += Math.min(cpcDelta, 1) * 0.5 * 0.35 // half the signal weight from CPC
            efficiencyReason = `${Math.round(cpcDelta * 100)}% lower CPC than your worst-performing platform`
          }
        }
        // CTR comparison: if the missing platform's median CTR > client's worst CTR → good
        if (platformStats.medianCTR != null && client.worstCTR != null && client.worstCTR > 0) {
          const ctrDelta = (platformStats.medianCTR - client.worstCTR) / platformStats.medianCTR
          if (ctrDelta > 0) {
            signal2 += Math.min(ctrDelta, 1) * 0.5 * 0.35 // half the signal weight from CTR
            if (!efficiencyReason) {
              efficiencyReason = `${Math.round(ctrDelta * 100)}% higher CTR than your worst-performing platform`
            }
          }
        }
      }

      // --- Signal 3: Spend Headroom (weight 0.25) ---
      let signal3 = 0
      const utilization = client.totalBudget > 0 ? client.totalSpend / client.totalBudget : 1
      if (utilization < 0.8) {
        const headroom = 1 - utilization
        const platformCTR = platformStats?.medianCTR ?? 0
        // Normalize CTR contribution (cap at a reasonable 5% CTR)
        const normalizedCTR = Math.min(platformCTR / 5, 1)
        signal3 = headroom * normalizedCTR * 0.25
      }

      const score = Math.min(signal1 + signal2 + signal3, 1)
      if (score <= 0) continue

      // Estimated monthly spend = agency median spend on this platform
      // or 20% of client's current total (whichever is smaller)
      const estimatedMonthlySpend = Math.min(
        platformStats?.medianCPC != null ? client.totalSpend * 0.2 : client.totalSpend * 0.15,
        client.totalSpend * 0.3
      )

      // Build human-readable reason
      const reasons: string[] = []
      if (peerAdoptionRate > 0) {
        reasons.push(`${Math.round(peerAdoptionRate * 100)}% of similar-spend clients use ${PLATFORM_LABELS[platform] || platform}`)
      }
      if (efficiencyReason) {
        reasons.push(efficiencyReason)
      }
      if (utilization < 0.8) {
        reasons.push(`${Math.round((1 - utilization) * 100)}% budget headroom available`)
      }

      recommendations.push({
        clientId: client.clientId,
        clientName: client.clientName,
        recommendedPlatform: platform,
        displayName: PLATFORM_LABELS[platform] || platform,
        score: Math.round(score * 1000) / 1000, // 3 decimal places
        reason: reasons.join('. ') + '.',
        peerAdoptionRate: Math.round(peerAdoptionRate * 100) / 100,
        agencyAvgCPC: platformStats?.medianCPC ?? null,
        agencyAvgCTR: platformStats?.medianCTR ?? null,
        estimatedMonthlySpend: Math.round(estimatedMonthlySpend * 100) / 100,
        confidence,
      })
    }
  }

  // Sort by score descending, then by client name for stability
  recommendations.sort((a, b) => b.score - a.score || a.clientName.localeCompare(b.clientName))

  return recommendations.slice(0, limit)
}
