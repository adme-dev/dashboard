/**
 * Spend Sync — shared logic for Meta and Google Ads spend syncing.
 *
 * Extracted from the API endpoints so it can be called from both
 * the HTTP handler (direct) and the queue consumer (background).
 */

import { queryRows, queryOne } from '~~/server/utils/db'

// ─── Meta Spend Sync ────────────────────────────────────────────

export async function syncMetaSpend(month: number, year: number): Promise<{ synced: number; totalSpend: number }> {
  const { getCampaignInsights, getCampaignDailyInsights, extractConversions, extractRevenue } = await import('~~/server/utils/metaClient')

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
      let commissionRate = 0
      const mapping = findMapping(mappings, conn.id, campaign.campaign_id, campaign.campaign_name)
      if (mapping) {
        const client = await queryOne<{ id: string; media_commission_rate: string | null }>(
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR code = $2 LIMIT 1`,
          [mapping.xero_client_name, mapping.xero_client_code]
        )
        clientId = client?.id || null
        commissionRate = parseFloat(client?.media_commission_rate || '0') || 0
      }

      const conversions = extractConversions(campaign.actions)
      const revenue = extractRevenue(campaign.action_values)
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
             commission_rate = CASE WHEN $8 > 0 THEN $8 ELSE media_spend.commission_rate END,
             revenue = $9,
             synced_at = NOW(), updated_at = NOW()
           WHERE id = $7`,
          [spend, campaign.campaign_name || null, impressions, clicks, conversions, clientId, existing.id, commissionRate, revenue]
        )
      } else {
        // Check for rolling budget from previous month
        const rolled = await getRollingBudget(clientId, 'meta', period)
        const budgetVal = rolled ? rolled.budget : 0
        const rollingVal = rolled ? rolled.rolling : false

        await queryOne(
          `INSERT INTO media_spend (
             client_id, platform, period, budget_allocated, actual_spend,
             commission_rate, connection_id, campaign_id, campaign_name,
             impressions, clicks, conversions, budget_rolling, revenue, synced_at
           ) VALUES ($1, 'meta', $2, $11, $3, $4, $5, $6, $7, $8, $9, $10, $12, $13, NOW())
           RETURNING id`,
          [clientId, period, spend, commissionRate, conn.id, campaign.campaign_id || null, campaign.campaign_name || null, impressions, clicks, conversions, budgetVal, rollingVal, revenue]
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
            `INSERT INTO daily_spend (media_spend_id, spend_date, spend, impressions, clicks, conversions, revenue)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (media_spend_id, spend_date)
             DO UPDATE SET spend = $3, impressions = $4, clicks = $5, conversions = $6, revenue = $7`,
            [mediaSpendId, day.date_start, parseFloat(day.spend || '0'), parseInt(day.impressions || '0', 10), parseInt(day.clicks || '0', 10), extractConversions(day.actions), extractRevenue(day.action_values)]
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
      let commissionRate = 0
      const mapping = findMapping(mappings, conn.id, campaign.campaignId, campaign.campaignName)
      if (mapping) {
        const client = await queryOne<{ id: string; media_commission_rate: string | null }>(
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR code = $2 LIMIT 1`,
          [mapping.xero_client_name, mapping.xero_client_code]
        )
        clientId = client?.id || null
        commissionRate = parseFloat(client?.media_commission_rate || '0') || 0
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
             commission_rate = CASE WHEN $10 > 0 THEN $10 ELSE media_spend.commission_rate END,
             revenue = $11,
             synced_at = NOW(), updated_at = NOW()
           WHERE id = $9`,
          [campaign.spend, campaign.campaignName || null, campaign.impressions, campaign.clicks, campaign.conversions, clientId, campaign.channelType || null, campaign.status || null, existing.id, commissionRate, campaign.conversionsValue || 0]
        )
      } else {
        // Check for rolling budget from previous month
        const rolled = await getRollingBudget(clientId, 'google_ads', period)
        const budgetVal = rolled ? rolled.budget : 0
        const rollingVal = rolled ? rolled.rolling : false

        await queryOne(
          `INSERT INTO media_spend (
             client_id, platform, period, budget_allocated, actual_spend,
             commission_rate, connection_id, campaign_id, campaign_name,
             impressions, clicks, conversions, campaign_type, campaign_status, budget_rolling, revenue, synced_at
           ) VALUES ($1, 'google_ads', $2, $13, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $14, $15, NOW())
           RETURNING id`,
          [clientId, period, campaign.spend, commissionRate, conn.id, campaign.campaignId || null, campaign.campaignName || null, campaign.impressions, campaign.clicks, campaign.conversions, campaign.channelType || null, campaign.status || null, budgetVal, rollingVal, campaign.conversionsValue || 0]
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
            `INSERT INTO daily_spend (media_spend_id, spend_date, spend, impressions, clicks, conversions, revenue)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (media_spend_id, spend_date)
             DO UPDATE SET spend = $3, impressions = $4, clicks = $5, conversions = $6, revenue = $7`,
            [mediaSpendId, day.date, day.spend, day.impressions, day.clicks, day.conversions, day.conversionsValue || 0]
          )
        }
      }
    } catch (err: any) {
      console.error(`[GoogleSync] Daily spend failed for ${conn.account_name}:`, err.message)
    }
  }

  return { synced: totalSynced, totalSpend: Math.round(totalSpend * 100) / 100 }
}

// ─── TikTok Spend Sync ──────────────────────────────────────────

export async function syncTikTokSpend(month: number, year: number): Promise<{ synced: number; totalSpend: number }> {
  const { getTiktokCampaignInsights, getTiktokCampaignDailyInsights } = await import('~~/server/utils/tiktokClient')

  const period = `${year}-${String(month).padStart(2, '0')}`

  const connections = await queryRows<{
    id: string
    account_id: string
    account_name: string
    access_token: string
    metadata: any
  }>(
    `SELECT id, account_id, account_name, access_token, metadata
     FROM social_connections
     WHERE platform = 'tiktok' AND status = 'active'`
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
    const advertiserId = conn.account_id

    let campaigns
    try {
      campaigns = await getTiktokCampaignInsights(advertiserId, conn.access_token, month, year)
    } catch (err: any) {
      console.error(`[TikTokSync] Failed to fetch insights for ${conn.account_name}:`, err.message)
      continue
    }

    for (const campaign of campaigns) {
      const spend = parseFloat(campaign.spend || '0')
      if (spend === 0) continue

      totalSpend += spend

      let clientId: string | null = null
      let commissionRate = 0
      const mapping = findMapping(mappings, conn.id, campaign.campaign_id, campaign.campaign_name)
      if (mapping) {
        const client = await queryOne<{ id: string; media_commission_rate: string | null }>(
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR code = $2 LIMIT 1`,
          [mapping.xero_client_name, mapping.xero_client_code]
        )
        clientId = client?.id || null
        commissionRate = parseFloat(client?.media_commission_rate || '0') || 0
      }

      const impressions = parseInt(campaign.impressions || '0', 10)
      const clicks = parseInt(campaign.clicks || '0', 10)
      const conversions = parseInt(campaign.conversions || '0', 10)

      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM media_spend
         WHERE connection_id = $1 AND platform = 'tiktok' AND period = $2 AND campaign_id = $3`,
        [conn.id, period, campaign.campaign_id]
      )

      if (existing) {
        await queryOne(
          `UPDATE media_spend SET
             actual_spend = $1, campaign_name = $2, impressions = $3, clicks = $4,
             conversions = $5, client_id = COALESCE($6, media_spend.client_id),
             commission_rate = CASE WHEN $8 > 0 THEN $8 ELSE media_spend.commission_rate END,
             synced_at = NOW(), updated_at = NOW()
           WHERE id = $7`,
          [spend, campaign.campaign_name || null, impressions, clicks, conversions, clientId, existing.id, commissionRate]
        )
      } else {
        const rolled = await getRollingBudget(clientId, 'tiktok', period)
        const budgetVal = rolled ? rolled.budget : 0
        const rollingVal = rolled ? rolled.rolling : false

        await queryOne(
          `INSERT INTO media_spend (
             client_id, platform, period, budget_allocated, actual_spend,
             commission_rate, connection_id, campaign_id, campaign_name,
             impressions, clicks, conversions, budget_rolling, synced_at
           ) VALUES ($1, 'tiktok', $2, $11, $3, $4, $5, $6, $7, $8, $9, $10, $12, NOW())
           RETURNING id`,
          [clientId, period, spend, commissionRate, conn.id, campaign.campaign_id || null, campaign.campaign_name || null, impressions, clicks, conversions, budgetVal, rollingVal]
        )
      }

      totalSynced++
    }

    // Daily spend pass
    try {
      const dailyInsights = await getTiktokCampaignDailyInsights(advertiserId, conn.access_token, month, year)
      if (dailyInsights.length > 0) {
        const spendRows = await queryRows<{ id: string; campaign_id: string }>(
          `SELECT id, campaign_id FROM media_spend
           WHERE connection_id = $1 AND platform = 'tiktok' AND period = $2 AND campaign_id IS NOT NULL`,
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
            [mediaSpendId, day.date, parseFloat(day.spend || '0'), parseInt(day.impressions || '0', 10), parseInt(day.clicks || '0', 10), parseInt(day.conversions || '0', 10)]
          )
        }
      }
    } catch (err: any) {
      console.error(`[TikTokSync] Daily spend failed for ${conn.account_name}:`, err.message)
    }
  }

  return { synced: totalSynced, totalSpend: Math.round(totalSpend * 100) / 100 }
}

// ─── LinkedIn Spend Sync ────────────────────────────────────────

export async function syncLinkedinSpend(month: number, year: number): Promise<{ synced: number; totalSpend: number }> {
  const { getLinkedInCampaignInsights, getLinkedInCampaignDailyInsights, refreshLinkedInToken } = await import('~~/server/utils/linkedinClient')

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
     WHERE platform = 'linkedin' AND status = 'active'`
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
    let accessToken = conn.access_token

    // Refresh token if expired (LinkedIn tokens expire in ~60 days)
    if (conn.refresh_token && conn.token_expires_at) {
      const expiresAt = new Date(conn.token_expires_at)
      if (expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
        try {
          const refreshed = await refreshLinkedInToken(conn.refresh_token, config.linkedinClientId, config.linkedinClientSecret)
          accessToken = refreshed.access_token
          const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000)
          await queryOne(
            `UPDATE social_connections SET access_token = $1, refresh_token = COALESCE($2, refresh_token), token_expires_at = $3, updated_at = NOW() WHERE id = $4`,
            [accessToken, refreshed.refresh_token || null, newExpiry, conn.id]
          )
        } catch (err: any) {
          console.error(`[LinkedInSync] Failed to refresh token for ${conn.account_name}:`, err.message)
          continue
        }
      }
    }

    const accountId = conn.account_id

    let campaigns
    try {
      campaigns = await getLinkedInCampaignInsights(accountId, accessToken, month, year)
    } catch (err: any) {
      console.error(`[LinkedInSync] Failed to fetch insights for ${conn.account_name}:`, err.message)
      continue
    }

    for (const campaign of campaigns) {
      const spend = parseFloat(campaign.spend || '0')
      if (spend === 0) continue

      totalSpend += spend

      let clientId: string | null = null
      let commissionRate = 0
      const mapping = findMapping(mappings, conn.id, campaign.campaign_id, campaign.campaign_name)
      if (mapping) {
        const client = await queryOne<{ id: string; media_commission_rate: string | null }>(
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR code = $2 LIMIT 1`,
          [mapping.xero_client_name, mapping.xero_client_code]
        )
        clientId = client?.id || null
        commissionRate = parseFloat(client?.media_commission_rate || '0') || 0
      }

      const impressions = parseInt(campaign.impressions || '0', 10)
      const clicks = parseInt(campaign.clicks || '0', 10)
      const conversions = parseInt(campaign.conversions || '0', 10)

      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM media_spend
         WHERE connection_id = $1 AND platform = 'linkedin' AND period = $2 AND campaign_id = $3`,
        [conn.id, period, campaign.campaign_id]
      )

      if (existing) {
        await queryOne(
          `UPDATE media_spend SET
             actual_spend = $1, campaign_name = $2, impressions = $3, clicks = $4,
             conversions = $5, client_id = COALESCE($6, media_spend.client_id),
             commission_rate = CASE WHEN $8 > 0 THEN $8 ELSE media_spend.commission_rate END,
             synced_at = NOW(), updated_at = NOW()
           WHERE id = $7`,
          [spend, campaign.campaign_name || null, impressions, clicks, conversions, clientId, existing.id, commissionRate]
        )
      } else {
        const rolled = await getRollingBudget(clientId, 'linkedin', period)
        const budgetVal = rolled ? rolled.budget : 0
        const rollingVal = rolled ? rolled.rolling : false

        await queryOne(
          `INSERT INTO media_spend (
             client_id, platform, period, budget_allocated, actual_spend,
             commission_rate, connection_id, campaign_id, campaign_name,
             impressions, clicks, conversions, budget_rolling, synced_at
           ) VALUES ($1, 'linkedin', $2, $11, $3, $4, $5, $6, $7, $8, $9, $10, $12, NOW())
           RETURNING id`,
          [clientId, period, spend, commissionRate, conn.id, campaign.campaign_id || null, campaign.campaign_name || null, impressions, clicks, conversions, budgetVal, rollingVal]
        )
      }

      totalSynced++
    }

    // Daily spend pass
    try {
      const dailyInsights = await getLinkedInCampaignDailyInsights(accountId, accessToken, month, year)
      if (dailyInsights.length > 0) {
        const spendRows = await queryRows<{ id: string; campaign_id: string }>(
          `SELECT id, campaign_id FROM media_spend
           WHERE connection_id = $1 AND platform = 'linkedin' AND period = $2 AND campaign_id IS NOT NULL`,
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
            [mediaSpendId, day.date, parseFloat(day.spend || '0'), parseInt(day.impressions || '0', 10), parseInt(day.clicks || '0', 10), parseInt(day.conversions || '0', 10)]
          )
        }
      }
    } catch (err: any) {
      console.error(`[LinkedInSync] Daily spend failed for ${conn.account_name}:`, err.message)
    }
  }

  return { synced: totalSynced, totalSpend: Math.round(totalSpend * 100) / 100 }
}

// ─── Pinterest Spend Sync ───────────────────────────────────────

export async function syncPinterestSpend(month: number, year: number): Promise<{ synced: number; totalSpend: number }> {
  const { getPinterestCampaignInsights, getPinterestDailyInsights, refreshPinterestToken } = await import('~~/server/utils/pinterestClient')

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
     WHERE platform = 'pinterest' AND status = 'active'`
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
    // Refresh token if expired (Pinterest access tokens last ~1hr)
    let accessToken = conn.access_token
    if (conn.refresh_token && conn.token_expires_at) {
      const expiresAt = new Date(conn.token_expires_at)
      if (expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
        try {
          const refreshed = await refreshPinterestToken(conn.refresh_token, config.pinterestAppId, config.pinterestAppSecret)
          accessToken = refreshed.access_token
          const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000)
          await queryOne(
            `UPDATE social_connections SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = NOW() WHERE id = $4`,
            [accessToken, refreshed.refresh_token, newExpiry, conn.id]
          )
        } catch (err: any) {
          console.error(`[PinterestSync] Failed to refresh token for ${conn.account_name}:`, err.message)
          continue
        }
      }
    }

    let campaigns
    try {
      campaigns = await getPinterestCampaignInsights(conn.account_id, accessToken, month, year)
    } catch (err: any) {
      console.error(`[PinterestSync] Failed to fetch insights for ${conn.account_name}:`, err.message)
      continue
    }

    for (const campaign of campaigns) {
      const spend = parseFloat(campaign.spend || '0')
      if (spend === 0) continue

      totalSpend += spend

      let clientId: string | null = null
      let commissionRate = 0
      const mapping = findMapping(mappings, conn.id, campaign.campaign_id, campaign.campaign_name)
      if (mapping) {
        const client = await queryOne<{ id: string; media_commission_rate: string | null }>(
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR code = $2 LIMIT 1`,
          [mapping.xero_client_name, mapping.xero_client_code]
        )
        clientId = client?.id || null
        commissionRate = parseFloat(client?.media_commission_rate || '0') || 0
      }

      const impressions = parseInt(campaign.impressions || '0', 10)
      const clicks = parseInt(campaign.clicks || '0', 10)
      const conversions = parseInt(campaign.conversions || '0', 10)

      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM media_spend
         WHERE connection_id = $1 AND platform = 'pinterest' AND period = $2 AND campaign_id = $3`,
        [conn.id, period, campaign.campaign_id]
      )

      if (existing) {
        await queryOne(
          `UPDATE media_spend SET
             actual_spend = $1, campaign_name = $2, impressions = $3, clicks = $4,
             conversions = $5, client_id = COALESCE($6, media_spend.client_id),
             commission_rate = CASE WHEN $8 > 0 THEN $8 ELSE media_spend.commission_rate END,
             synced_at = NOW(), updated_at = NOW()
           WHERE id = $7`,
          [spend, campaign.campaign_name || null, impressions, clicks, conversions, clientId, existing.id, commissionRate]
        )
      } else {
        const rolled = await getRollingBudget(clientId, 'pinterest', period)
        const budgetVal = rolled ? rolled.budget : 0
        const rollingVal = rolled ? rolled.rolling : false

        await queryOne(
          `INSERT INTO media_spend (
             client_id, platform, period, budget_allocated, actual_spend,
             commission_rate, connection_id, campaign_id, campaign_name,
             impressions, clicks, conversions, budget_rolling, synced_at
           ) VALUES ($1, 'pinterest', $2, $11, $3, $4, $5, $6, $7, $8, $9, $10, $12, NOW())
           RETURNING id`,
          [clientId, period, spend, commissionRate, conn.id, campaign.campaign_id || null, campaign.campaign_name || null, impressions, clicks, conversions, budgetVal, rollingVal]
        )
      }

      totalSynced++
    }

    // Daily spend pass
    try {
      const dailyInsights = await getPinterestDailyInsights(conn.account_id, accessToken, month, year)
      if (dailyInsights.length > 0) {
        const spendRows = await queryRows<{ id: string; campaign_id: string }>(
          `SELECT id, campaign_id FROM media_spend
           WHERE connection_id = $1 AND platform = 'pinterest' AND period = $2 AND campaign_id IS NOT NULL`,
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
            [mediaSpendId, day.date, parseFloat(day.spend || '0'), parseInt(day.impressions || '0', 10), parseInt(day.clicks || '0', 10), parseInt(day.conversions || '0', 10)]
          )
        }
      }
    } catch (err: any) {
      console.error(`[PinterestSync] Daily spend failed for ${conn.account_name}:`, err.message)
    }
  }

  return { synced: totalSynced, totalSpend: Math.round(totalSpend * 100) / 100 }
}

// ─── Snapchat Spend Sync ────────────────────────────────────────

export async function syncSnapchatSpend(month: number, year: number): Promise<{ synced: number; totalSpend: number }> {
  const { getSnapchatCampaignStats, getSnapchatCampaignDailyStats, refreshSnapchatToken } = await import('~~/server/utils/snapchatClient')

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
     WHERE platform = 'snapchat' AND status = 'active'`
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
    // Snapchat tokens expire after 30 min — refresh if needed
    let accessToken = conn.access_token
    if (conn.refresh_token && conn.token_expires_at) {
      const expiresAt = new Date(conn.token_expires_at)
      if (expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
        try {
          const refreshed = await refreshSnapchatToken(conn.refresh_token, config.snapchatClientId, config.snapchatClientSecret)
          accessToken = refreshed.access_token
          const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000)
          await queryOne(
            `UPDATE social_connections SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = NOW() WHERE id = $4`,
            [accessToken, refreshed.refresh_token, newExpiry, conn.id]
          )
        } catch (err: any) {
          console.error(`[SnapchatSync] Failed to refresh token for ${conn.account_name}:`, err.message)
          continue
        }
      }
    }

    let campaigns
    try {
      campaigns = await getSnapchatCampaignStats(conn.account_id, accessToken, month, year)
    } catch (err: any) {
      console.error(`[SnapchatSync] Failed to fetch insights for ${conn.account_name}:`, err.message)
      continue
    }

    for (const campaign of campaigns) {
      // Spend is already converted from microcurrency in the client
      const spend = parseFloat(campaign.spend || '0')
      if (spend === 0) continue

      totalSpend += spend

      let clientId: string | null = null
      let commissionRate = 0
      const mapping = findMapping(mappings, conn.id, campaign.campaign_id, campaign.campaign_name)
      if (mapping) {
        const client = await queryOne<{ id: string; media_commission_rate: string | null }>(
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR code = $2 LIMIT 1`,
          [mapping.xero_client_name, mapping.xero_client_code]
        )
        clientId = client?.id || null
        commissionRate = parseFloat(client?.media_commission_rate || '0') || 0
      }

      const impressions = parseInt(campaign.impressions || '0', 10)
      const clicks = parseInt(campaign.clicks || '0', 10)       // swipes → clicks
      const conversions = parseInt(campaign.conversions || '0', 10)

      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM media_spend
         WHERE connection_id = $1 AND platform = 'snapchat' AND period = $2 AND campaign_id = $3`,
        [conn.id, period, campaign.campaign_id]
      )

      if (existing) {
        await queryOne(
          `UPDATE media_spend SET
             actual_spend = $1, campaign_name = $2, impressions = $3, clicks = $4,
             conversions = $5, client_id = COALESCE($6, media_spend.client_id),
             commission_rate = CASE WHEN $8 > 0 THEN $8 ELSE media_spend.commission_rate END,
             synced_at = NOW(), updated_at = NOW()
           WHERE id = $7`,
          [spend, campaign.campaign_name || null, impressions, clicks, conversions, clientId, existing.id, commissionRate]
        )
      } else {
        const rolled = await getRollingBudget(clientId, 'snapchat', period)
        const budgetVal = rolled ? rolled.budget : 0
        const rollingVal = rolled ? rolled.rolling : false

        await queryOne(
          `INSERT INTO media_spend (
             client_id, platform, period, budget_allocated, actual_spend,
             commission_rate, connection_id, campaign_id, campaign_name,
             impressions, clicks, conversions, budget_rolling, synced_at
           ) VALUES ($1, 'snapchat', $2, $11, $3, $4, $5, $6, $7, $8, $9, $10, $12, NOW())
           RETURNING id`,
          [clientId, period, spend, commissionRate, conn.id, campaign.campaign_id || null, campaign.campaign_name || null, impressions, clicks, conversions, budgetVal, rollingVal]
        )
      }

      totalSynced++
    }

    // Daily spend pass
    try {
      const dailyInsights = await getSnapchatCampaignDailyStats(conn.account_id, accessToken, month, year)
      if (dailyInsights.length > 0) {
        const spendRows = await queryRows<{ id: string; campaign_id: string }>(
          `SELECT id, campaign_id FROM media_spend
           WHERE connection_id = $1 AND platform = 'snapchat' AND period = $2 AND campaign_id IS NOT NULL`,
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
            [mediaSpendId, day.date, parseFloat(day.spend || '0'), parseInt(day.impressions || '0', 10), parseInt(day.clicks || '0', 10), parseInt(day.conversions || '0', 10)]
          )
        }
      }
    } catch (err: any) {
      console.error(`[SnapchatSync] Daily spend failed for ${conn.account_name}:`, err.message)
    }
  }

  return { synced: totalSynced, totalSpend: Math.round(totalSpend * 100) / 100 }
}

// ─── Twitter (X) Spend Sync ─────────────────────────────────────

export async function syncTwitterSpend(month: number, year: number): Promise<{ synced: number; totalSpend: number }> {
  const { getTwitterCampaignStats, getTwitterCampaignDailyStats, refreshTwitterToken } = await import('~~/server/utils/twitterClient')

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
     WHERE platform = 'twitter' AND status = 'active'`
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
    // Refresh token if expired
    let accessToken = conn.access_token
    if (conn.refresh_token && conn.token_expires_at) {
      const expiresAt = new Date(conn.token_expires_at)
      if (expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
        try {
          const refreshed = await refreshTwitterToken(conn.refresh_token, config.twitterClientId, config.twitterClientSecret)
          accessToken = refreshed.access_token
          const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000)
          await queryOne(
            `UPDATE social_connections SET access_token = $1, refresh_token = COALESCE($2, refresh_token), token_expires_at = $3, updated_at = NOW() WHERE id = $4`,
            [accessToken, refreshed.refresh_token || null, newExpiry, conn.id]
          )
        } catch (err: any) {
          console.error(`[TwitterSync] Failed to refresh token for ${conn.account_name}:`, err.message)
          continue
        }
      }
    }

    let campaigns
    try {
      campaigns = await getTwitterCampaignStats(conn.account_id, accessToken, month, year)
    } catch (err: any) {
      console.error(`[TwitterSync] Failed to fetch stats for ${conn.account_name}:`, err.message)
      continue
    }

    for (const campaign of campaigns) {
      // Spend is already converted from micros in twitterClient
      if (campaign.spend === 0) continue

      totalSpend += campaign.spend

      let clientId: string | null = null
      let commissionRate = 0
      const mapping = findMapping(mappings, conn.id, campaign.campaign_id, campaign.campaign_name)
      if (mapping) {
        const client = await queryOne<{ id: string; media_commission_rate: string | null }>(
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR code = $2 LIMIT 1`,
          [mapping.xero_client_name, mapping.xero_client_code]
        )
        clientId = client?.id || null
        commissionRate = parseFloat(client?.media_commission_rate || '0') || 0
      }

      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM media_spend
         WHERE connection_id = $1 AND platform = 'twitter' AND period = $2 AND campaign_id = $3`,
        [conn.id, period, campaign.campaign_id]
      )

      if (existing) {
        await queryOne(
          `UPDATE media_spend SET
             actual_spend = $1, campaign_name = $2, impressions = $3, clicks = $4,
             conversions = $5, client_id = COALESCE($6, media_spend.client_id),
             commission_rate = CASE WHEN $8 > 0 THEN $8 ELSE media_spend.commission_rate END,
             synced_at = NOW(), updated_at = NOW()
           WHERE id = $7`,
          [campaign.spend, campaign.campaign_name || null, campaign.impressions, campaign.clicks, campaign.conversions, clientId, existing.id, commissionRate]
        )
      } else {
        const rolled = await getRollingBudget(clientId, 'twitter', period)
        const budgetVal = rolled ? rolled.budget : 0
        const rollingVal = rolled ? rolled.rolling : false

        await queryOne(
          `INSERT INTO media_spend (
             client_id, platform, period, budget_allocated, actual_spend,
             commission_rate, connection_id, campaign_id, campaign_name,
             impressions, clicks, conversions, budget_rolling, synced_at
           ) VALUES ($1, 'twitter', $2, $11, $3, $4, $5, $6, $7, $8, $9, $10, $12, NOW())
           RETURNING id`,
          [clientId, period, campaign.spend, commissionRate, conn.id, campaign.campaign_id || null, campaign.campaign_name || null, campaign.impressions, campaign.clicks, campaign.conversions, budgetVal, rollingVal]
        )
      }

      totalSynced++
    }

    // Daily spend pass
    try {
      const dailyStats = await getTwitterCampaignDailyStats(conn.account_id, accessToken, month, year)
      if (dailyStats.length > 0) {
        const spendRows = await queryRows<{ id: string; campaign_id: string }>(
          `SELECT id, campaign_id FROM media_spend
           WHERE connection_id = $1 AND platform = 'twitter' AND period = $2 AND campaign_id IS NOT NULL`,
          [conn.id, period]
        )
        const campaignToSpendId = new Map(spendRows.map(r => [r.campaign_id, r.id]))

        for (const day of dailyStats) {
          const mediaSpendId = campaignToSpendId.get(day.campaign_id || '')
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
      console.error(`[TwitterSync] Daily spend failed for ${conn.account_name}:`, err.message)
    }
  }

  return { synced: totalSynced, totalSpend: Math.round(totalSpend * 100) / 100 }
}

// ─── Microsoft Ads Spend Sync ───────────────────────────────────

export async function syncMicrosoftSpend(month: number, year: number): Promise<{ synced: number; totalSpend: number }> {
  const { getMicrosoftCampaignInsights, getMicrosoftDailyInsights, refreshMicrosoftToken } = await import('~~/server/utils/microsoftAdsClient')

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
     WHERE platform = 'microsoft_ads' AND status = 'active'`
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
    let accessToken = conn.access_token

    // Refresh token if expired
    if (conn.refresh_token && conn.token_expires_at) {
      const expiresAt = new Date(conn.token_expires_at)
      if (expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
        try {
          const refreshed = await refreshMicrosoftToken(conn.refresh_token, config.microsoftAdsClientId, config.microsoftAdsClientSecret)
          accessToken = refreshed.access_token
          const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000)
          await queryOne(
            `UPDATE social_connections SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = NOW() WHERE id = $4`,
            [accessToken, refreshed.refresh_token, newExpiry, conn.id]
          )
        } catch (err: any) {
          console.error(`[MicrosoftSync] Failed to refresh token for ${conn.account_name}:`, err.message)
          continue
        }
      }
    }

    const accountId = conn.account_id

    // Async reporting: submit → poll → download → parse (may take 10-30s)
    let campaigns
    try {
      campaigns = await getMicrosoftCampaignInsights(accountId, accessToken, config.microsoftAdsDeveloperToken, month, year)
    } catch (err: any) {
      console.error(`[MicrosoftSync] Failed to fetch insights for ${conn.account_name}:`, err.message)
      continue
    }

    for (const campaign of campaigns) {
      const spend = parseFloat(campaign.spend || '0')
      if (spend === 0) continue

      totalSpend += spend

      let clientId: string | null = null
      let commissionRate = 0
      const mapping = findMapping(mappings, conn.id, campaign.campaign_id, campaign.campaign_name)
      if (mapping) {
        const client = await queryOne<{ id: string; media_commission_rate: string | null }>(
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR code = $2 LIMIT 1`,
          [mapping.xero_client_name, mapping.xero_client_code]
        )
        clientId = client?.id || null
        commissionRate = parseFloat(client?.media_commission_rate || '0') || 0
      }

      const impressions = parseInt(campaign.impressions || '0', 10)
      const clicks = parseInt(campaign.clicks || '0', 10)
      const conversions = parseInt(campaign.conversions || '0', 10)

      const msRevenue = parseFloat(campaign.revenue || '0')

      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM media_spend
         WHERE connection_id = $1 AND platform = 'microsoft_ads' AND period = $2 AND campaign_id = $3`,
        [conn.id, period, campaign.campaign_id]
      )

      if (existing) {
        await queryOne(
          `UPDATE media_spend SET
             actual_spend = $1, campaign_name = $2, impressions = $3, clicks = $4,
             conversions = $5, client_id = COALESCE($6, media_spend.client_id),
             commission_rate = CASE WHEN $8 > 0 THEN $8 ELSE media_spend.commission_rate END,
             revenue = $9,
             synced_at = NOW(), updated_at = NOW()
           WHERE id = $7`,
          [spend, campaign.campaign_name || null, impressions, clicks, conversions, clientId, existing.id, commissionRate, msRevenue]
        )
      } else {
        const rolled = await getRollingBudget(clientId, 'microsoft_ads', period)
        const budgetVal = rolled ? rolled.budget : 0
        const rollingVal = rolled ? rolled.rolling : false

        await queryOne(
          `INSERT INTO media_spend (
             client_id, platform, period, budget_allocated, actual_spend,
             commission_rate, connection_id, campaign_id, campaign_name,
             impressions, clicks, conversions, budget_rolling, revenue, synced_at
           ) VALUES ($1, 'microsoft_ads', $2, $11, $3, $4, $5, $6, $7, $8, $9, $10, $12, $13, NOW())
           RETURNING id`,
          [clientId, period, spend, commissionRate, conn.id, campaign.campaign_id || null, campaign.campaign_name || null, impressions, clicks, conversions, budgetVal, rollingVal, msRevenue]
        )
      }

      totalSynced++
    }

    // Daily spend pass (also uses async reporting)
    try {
      const dailyInsights = await getMicrosoftDailyInsights(accountId, accessToken, config.microsoftAdsDeveloperToken, month, year)
      if (dailyInsights.length > 0) {
        const spendRows = await queryRows<{ id: string; campaign_id: string }>(
          `SELECT id, campaign_id FROM media_spend
           WHERE connection_id = $1 AND platform = 'microsoft_ads' AND period = $2 AND campaign_id IS NOT NULL`,
          [conn.id, period]
        )
        const campaignToSpendId = new Map(spendRows.map(r => [r.campaign_id, r.id]))

        for (const day of dailyInsights) {
          const mediaSpendId = campaignToSpendId.get(day.campaign_id || '')
          if (!mediaSpendId) continue

          await queryOne(
            `INSERT INTO daily_spend (media_spend_id, spend_date, spend, impressions, clicks, conversions, revenue)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (media_spend_id, spend_date)
             DO UPDATE SET spend = $3, impressions = $4, clicks = $5, conversions = $6, revenue = $7`,
            [mediaSpendId, day.date, parseFloat(day.spend || '0'), parseInt(day.impressions || '0', 10), parseInt(day.clicks || '0', 10), parseInt(day.conversions || '0', 10), parseFloat(day.revenue || '0')]
          )
        }
      }
    } catch (err: any) {
      console.error(`[MicrosoftSync] Daily spend failed for ${conn.account_name}:`, err.message)
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

/**
 * Look up rolling budget from the previous month for the same client+platform.
 * Returns { budget, rolling } if found, null otherwise.
 */
async function getRollingBudget(
  clientId: string | null,
  platform: string,
  currentPeriod: string
): Promise<{ budget: number; rolling: boolean } | null> {
  if (!clientId) return null
  // Calculate previous period
  const [y, m] = currentPeriod.split('-').map(Number) as [number, number]
  const prevMonth = m === 1 ? 12 : m - 1
  const prevYear = m === 1 ? y - 1 : y
  const prevPeriod = `${prevYear}-${String(prevMonth).padStart(2, '0')}`

  const prev = await queryOne<{ budget_allocated: string; budget_rolling: boolean }>(
    `SELECT budget_allocated, budget_rolling FROM media_spend
     WHERE client_id = $1 AND platform = $2 AND period = $3 AND budget_rolling = true AND budget_allocated > 0
     ORDER BY budget_allocated DESC LIMIT 1`,
    [clientId, platform, prevPeriod]
  )
  if (!prev) return null
  return { budget: parseFloat(prev.budget_allocated) || 0, rolling: true }
}
