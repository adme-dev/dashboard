/**
 * Spend Sync — shared logic for Meta and Google Ads spend syncing.
 *
 * Extracted from the API endpoints so it can be called from both
 * the HTTP handler (direct) and the queue consumer (background).
 */

import { queryRows, queryOne } from '~~/server/utils/db'

// ─── Meta Spend Sync ────────────────────────────────────────────

export async function syncMetaSpend(month: number, year: number): Promise<{ synced: number; totalSpend: number }> {
  const { getCampaignInsights, getCampaignDailyInsights, extractConversions } = await import('~~/server/utils/metaClient')

  const period = `${year}-${String(month).padStart(2, '0')}`

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

  if (connections.length === 0) return { synced: 0, totalSpend: 0 }

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

      let clientId: string | null = null
      const mapping = findMapping(mappings, conn.id, campaign.campaign_id, campaign.campaign_name)
      if (mapping) {
        const client = await queryOne<{ id: string }>(
          `SELECT id FROM agency_clients WHERE name = $1 OR code = $2 LIMIT 1`,
          [mapping.xero_client_name, mapping.xero_client_code]
        )
        clientId = client?.id || null
      }

      const conversions = extractConversions(campaign.actions)
      const impressions = parseInt(campaign.impressions || '0', 10)
      const clicks = parseInt(campaign.clicks || '0', 10)

      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM media_spend
         WHERE connection_id = $1 AND platform = 'meta' AND period = $2 AND campaign_id = $3`,
        [conn.id, period, campaign.campaign_id]
      )

      if (existing) {
        await queryOne(
          `UPDATE media_spend SET
             actual_spend = $1, campaign_name = $2, impressions = $3, clicks = $4,
             conversions = $5, client_id = COALESCE($6, media_spend.client_id),
             synced_at = NOW(), updated_at = NOW()
           WHERE id = $7`,
          [spend, campaign.campaign_name || null, impressions, clicks, conversions, clientId, existing.id]
        )
      } else {
        await queryOne(
          `INSERT INTO media_spend (
             client_id, platform, period, budget_allocated, actual_spend,
             commission_rate, connection_id, campaign_id, campaign_name,
             impressions, clicks, conversions, synced_at
           ) VALUES ($1, 'meta', $2, 0, $3, 0, $4, $5, $6, $7, $8, $9, NOW())
           RETURNING id`,
          [clientId, period, spend, conn.id, campaign.campaign_id || null, campaign.campaign_name || null, impressions, clicks, conversions]
        )
      }

      totalSynced++
    }

    // Daily spend pass
    try {
      const dailyInsights = await getCampaignDailyInsights(actId, conn.access_token, month, year)
      if (dailyInsights.length > 0) {
        const spendRows = await queryRows<{ id: string; campaign_id: string }>(
          `SELECT id, campaign_id FROM media_spend
           WHERE connection_id = $1 AND platform = 'meta' AND period = $2 AND campaign_id IS NOT NULL`,
          [conn.id, period]
        )
        const campaignToSpendId = new Map(spendRows.map(r => [r.campaign_id, r.id]))

        for (const day of dailyInsights) {
          const mediaSpendId = campaignToSpendId.get(day.campaign_id || '')
          if (!mediaSpendId) continue

          await queryOne(
            `INSERT INTO daily_spend (media_spend_id, spend_date, spend, impressions, clicks, conversions)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (media_spend_id, spend_date)
             DO UPDATE SET spend = $3, impressions = $4, clicks = $5, conversions = $6`,
            [mediaSpendId, day.date_start, parseFloat(day.spend || '0'), parseInt(day.impressions || '0', 10), parseInt(day.clicks || '0', 10), extractConversions(day.actions)]
          )
        }
      }
    } catch (err: any) {
      console.error(`[MetaSync] Daily spend failed for ${conn.account_name}:`, err.message)
    }
  }

  return { synced: totalSynced, totalSpend: Math.round(totalSpend * 100) / 100 }
}

// ─── Google Spend Sync ──────────────────────────────────────────

export async function syncGoogleSpend(month: number, year: number): Promise<{ synced: number; totalSpend: number }> {
  const { getMonthlySpend, getDailySpend, refreshGoogleToken, listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')

  const period = `${year}-${String(month).padStart(2, '0')}`
  const config = useRuntimeConfig()

  const connections = await queryRows<{
    id: string
    account_id: string
    account_name: string
    access_token: string
    refresh_token: string | null
    token_expires_at: string | null
    metadata: any
  }>(
    `SELECT id, account_id, account_name, access_token, refresh_token, token_expires_at, metadata
     FROM social_connections
     WHERE platform = 'google' AND status = 'active'`
  )

  if (connections.length === 0) return { synced: 0, totalSpend: 0 }

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

  let mccId: string | undefined
  const firstConn = connections[0]!
  try {
    const accessibleIds = await listAccessibleCustomers(firstConn.access_token, config.googleDeveloperToken)
    const connAccountIds = new Set(connections.map(c => c.account_id.replace(/-/g, '')))
    mccId = accessibleIds.find(id => !connAccountIds.has(id)) || accessibleIds[0] || undefined
  } catch (err: any) {
    console.warn(`[GoogleSync] Could not detect MCC:`, err.message)
  }

  let totalSynced = 0
  let totalSpend = 0

  for (const conn of connections) {
    let accessToken = conn.access_token
    if (conn.refresh_token && conn.token_expires_at) {
      const expiresAt = new Date(conn.token_expires_at)
      if (expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
        try {
          const refreshed = await refreshGoogleToken(conn.refresh_token, config.googleClientId, config.googleClientSecret)
          accessToken = refreshed.access_token
          const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000)
          await queryOne(
            `UPDATE social_connections SET access_token = $1, token_expires_at = $2, updated_at = NOW() WHERE id = $3`,
            [accessToken, newExpiry, conn.id]
          )
        } catch (err: any) {
          console.error(`[GoogleSync] Failed to refresh token for ${conn.account_name}:`, err.message)
          continue
        }
      }
    }

    let campaigns
    try {
      campaigns = await getMonthlySpend(conn.account_id, accessToken, config.googleDeveloperToken, month, year, mccId)
    } catch (err: any) {
      console.error(`[GoogleSync] Failed to fetch spend for ${conn.account_name}:`, err.message)
      continue
    }

    for (const campaign of campaigns) {
      if (campaign.spend === 0) continue
      totalSpend += campaign.spend

      let clientId: string | null = null
      const mapping = findMapping(mappings, conn.id, campaign.campaignId, campaign.campaignName)
      if (mapping) {
        const client = await queryOne<{ id: string }>(
          `SELECT id FROM agency_clients WHERE name = $1 OR code = $2 LIMIT 1`,
          [mapping.xero_client_name, mapping.xero_client_code]
        )
        clientId = client?.id || null
      }

      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM media_spend
         WHERE connection_id = $1 AND platform = 'google_ads' AND period = $2 AND campaign_id = $3`,
        [conn.id, period, campaign.campaignId]
      )

      if (existing) {
        await queryOne(
          `UPDATE media_spend SET
             actual_spend = $1, campaign_name = $2, impressions = $3, clicks = $4,
             conversions = $5, client_id = COALESCE($6, media_spend.client_id),
             campaign_type = $7, campaign_status = $8,
             synced_at = NOW(), updated_at = NOW()
           WHERE id = $9`,
          [campaign.spend, campaign.campaignName || null, campaign.impressions, campaign.clicks, campaign.conversions, clientId, campaign.channelType || null, campaign.status || null, existing.id]
        )
      } else {
        await queryOne(
          `INSERT INTO media_spend (
             client_id, platform, period, budget_allocated, actual_spend,
             commission_rate, connection_id, campaign_id, campaign_name,
             impressions, clicks, conversions, campaign_type, campaign_status, synced_at
           ) VALUES ($1, 'google_ads', $2, 0, $3, 0, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
           RETURNING id`,
          [clientId, period, campaign.spend, conn.id, campaign.campaignId || null, campaign.campaignName || null, campaign.impressions, campaign.clicks, campaign.conversions, campaign.channelType || null, campaign.status || null]
        )
      }

      totalSynced++
    }

    // Daily spend pass
    try {
      const dailyRows = await getDailySpend(conn.account_id, accessToken, config.googleDeveloperToken, month, year, mccId)
      if (dailyRows.length > 0) {
        const spendRows = await queryRows<{ id: string; campaign_id: string }>(
          `SELECT id, campaign_id FROM media_spend
           WHERE connection_id = $1 AND platform = 'google_ads' AND period = $2 AND campaign_id IS NOT NULL`,
          [conn.id, period]
        )
        const campaignToSpendId = new Map(spendRows.map(r => [r.campaign_id, r.id]))

        for (const day of dailyRows) {
          const mediaSpendId = campaignToSpendId.get(day.campaignId)
          if (!mediaSpendId) continue

          await queryOne(
            `INSERT INTO daily_spend (media_spend_id, spend_date, spend, impressions, clicks, conversions)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (media_spend_id, spend_date)
             DO UPDATE SET spend = $3, impressions = $4, clicks = $5, conversions = $6`,
            [mediaSpendId, day.date, day.spend, day.impressions, day.clicks, day.conversions]
          )
        }
      }
    } catch (err: any) {
      console.error(`[GoogleSync] Daily spend failed for ${conn.account_name}:`, err.message)
    }
  }

  return { synced: totalSynced, totalSpend: Math.round(totalSpend * 100) / 100 }
}

// ─── Shared Helpers ─────────────────────────────────────────────

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
  const exactMatch = mappings.find(
    m => m.connection_id === connectionId && m.campaign_id && m.campaign_id === campaignId
  )
  if (exactMatch) return exactMatch

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

  const accountMatch = mappings.find(
    m => m.connection_id === connectionId && !m.campaign_id && !m.campaign_name_pattern
  )
  return accountMatch || null
}
