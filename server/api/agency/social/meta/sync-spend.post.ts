import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { getCampaignInsights, extractConversions } from '~~/server/utils/metaClient'

/**
 * POST /api/agency/social/meta/sync-spend
 * Pulls campaign-level spend from Meta API and upserts into media_spend
 * Body: { month?: number, year?: number }
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const now = new Date()
  const month = body?.month || now.getMonth() + 1
  const year = body?.year || now.getFullYear()
  const period = `${year}-${String(month).padStart(2, '0')}`

  // Get all active Meta connections
  const connections = await queryRows<{
    id: string
    account_id: string
    account_name: string
    access_token: string
    metadata: any
  }>(
    `SELECT id, account_id, access_token, account_name, metadata
     FROM social_connections
     WHERE platform = 'meta' AND status = 'active'`
  )

  if (connections.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No active Meta connections found' })
  }

  // Get all client mappings
  const mappings = await queryRows<{
    connection_id: string
    campaign_id: string | null
    campaign_name_pattern: string | null
    xero_client_name: string
    xero_client_code: string | null
  }>(
    `SELECT connection_id, campaign_id, campaign_name_pattern, xero_client_name, xero_client_code
     FROM ad_account_client_map`
  )

  let totalSynced = 0
  let totalSpend = 0

  for (const conn of connections) {
    const actId = conn.metadata?.actId || `act_${conn.account_id}`

    let campaigns
    try {
      campaigns = await getCampaignInsights(actId, conn.access_token, month, year)
    } catch (err: any) {
      console.error(`[MetaSync] Failed to fetch insights for ${conn.account_name}:`, err.message)
      continue
    }

    for (const campaign of campaigns) {
      const spend = parseFloat(campaign.spend || '0')
      if (spend === 0) continue

      totalSpend += spend

      // Find client mapping for this campaign
      const mapping = findMapping(mappings, conn.id, campaign.campaign_id, campaign.campaign_name)

      // Resolve client_id from xero_client_name
      let clientId: string | null = null
      if (mapping) {
        const client = await queryOne<{ id: string }>(
          `SELECT id FROM agency_clients WHERE name = $1 OR code = $2 LIMIT 1`,
          [mapping.xero_client_name, mapping.xero_client_code]
        )
        clientId = client?.id || null
      }

      if (!clientId) {
        // Skip campaigns that don't map to a known client
        continue
      }

      const conversions = extractConversions(campaign.actions)
      const impressions = parseInt(campaign.impressions || '0', 10)
      const clicks = parseInt(campaign.clicks || '0', 10)

      // Check if a row already exists for this client + platform + period + campaign
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM media_spend
         WHERE client_id = $1 AND platform = 'meta' AND period = $2 AND campaign_id = $3`,
        [clientId, period, campaign.campaign_id]
      )

      if (existing) {
        await queryOne(
          `UPDATE media_spend SET
             actual_spend = $1,
             campaign_name = $2,
             impressions = $3,
             clicks = $4,
             conversions = $5,
             connection_id = $6,
             synced_at = NOW(),
             updated_at = NOW()
           WHERE id = $7`,
          [spend, campaign.campaign_name || null, impressions, clicks, conversions, conn.id, existing.id]
        )
      } else {
        await queryOne(
          `INSERT INTO media_spend (
             client_id, platform, period, budget_allocated, actual_spend,
             commission_rate, connection_id, campaign_id, campaign_name,
             impressions, clicks, conversions, synced_at
           )
           VALUES ($1, 'meta', $2, 0, $3, 0, $4, $5, $6, $7, $8, $9, NOW())
           RETURNING id`,
          [clientId, period, spend, conn.id, campaign.campaign_id || null, campaign.campaign_name || null, impressions, clicks, conversions]
        )
      }

      totalSynced++
    }
  }

  return {
    synced: totalSynced,
    accounts: connections.length,
    totalSpend: Math.round(totalSpend * 100) / 100
  }
})

/**
 * Find the best matching client mapping for a campaign
 */
function findMapping(
  mappings: Array<{
    connection_id: string
    campaign_id: string | null
    campaign_name_pattern: string | null
    xero_client_name: string
    xero_client_code: string | null
  }>,
  connectionId: string,
  campaignId?: string,
  campaignName?: string
) {
  // Priority 1: Exact campaign ID match for this connection
  const exactMatch = mappings.find(
    m => m.connection_id === connectionId && m.campaign_id && m.campaign_id === campaignId
  )
  if (exactMatch) return exactMatch

  // Priority 2: Campaign name pattern match for this connection
  if (campaignName) {
    const patternMatch = mappings.find(m => {
      if (m.connection_id !== connectionId || !m.campaign_name_pattern) return false
      try {
        return new RegExp(m.campaign_name_pattern, 'i').test(campaignName)
      } catch {
        return false
      }
    })
    if (patternMatch) return patternMatch
  }

  // Priority 3: Account-level mapping (no campaign_id or pattern)
  const accountMatch = mappings.find(
    m => m.connection_id === connectionId && !m.campaign_id && !m.campaign_name_pattern
  )
  return accountMatch || null
}
