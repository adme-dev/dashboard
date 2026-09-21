import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { cachedFetch } from '~~/server/utils/kv'

// Only server-owned route wrappers choose a provider. Never derive SQL/cache
// namespaces from request input or widen Google/Meta's distinct read contracts.
const providers = ['linkedin', 'microsoft_ads', 'pinterest', 'snapchat', 'tiktok', 'twitter'] as const
type SocialAccountProvider = typeof providers[number]
function requireProvider(platform: SocialAccountProvider) {
  if (!providers.includes(platform)) throw new Error('Unsupported social account provider')
}

export const socialMapClientHandler = eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)

  if (!body?.connectionId || !body?.xeroClientName) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId and xeroClientName are required' })
  }

  // Verify connection exists
  const conn = await queryOne(
    `SELECT id FROM social_connections WHERE id = $1`,
    [body.connectionId]
  )
  if (!conn) {
    throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  }

  // Check for existing mapping (to update rather than duplicate)
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM ad_account_client_map
     WHERE connection_id = $1
       AND COALESCE(campaign_id, '') = COALESCE($2, '')
       AND COALESCE(campaign_name_pattern, '') = COALESCE($3, '')`,
    [body.connectionId, body.campaignId || null, body.campaignNamePattern || null]
  )

  if (existing) {
    // Update existing mapping
    await queryOne(
      `UPDATE ad_account_client_map SET
         xero_client_name = $1,
         xero_client_code = $2
       WHERE id = $3
       RETURNING id`,
      [body.xeroClientName, body.xeroClientCode || null, existing.id]
    )
    return { id: existing.id, updated: true }
  }

  // Create new mapping
  const row = await queryOne<{ id: string }>(
    `INSERT INTO ad_account_client_map (connection_id, campaign_id, campaign_name_pattern, xero_client_name, xero_client_code)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      body.connectionId,
      body.campaignId || null,
      body.campaignNamePattern || null,
      body.xeroClientName,
      body.xeroClientCode || null
    ]
  )

  return { id: row!.id, updated: false }
})

export function createSocialAccountsHandler(platform: SocialAccountProvider) {
  requireProvider(platform)
  return eventHandler(async (event) => {
    await requireAuth(event)

    const accounts = await queryRows<Record<string, unknown> & { mapped_clients: string }>(
      `SELECT
       sc.id,
       sc.account_id,
       sc.account_name,
       sc.status,
       sc.token_expires_at,
       sc.scopes,
       sc.metadata,
       sc.connected_by,
       sc.created_at,
       sc.updated_at,
       tm.name AS connected_by_name,
       (SELECT MAX(synced_at) FROM media_spend WHERE connection_id = sc.id) AS last_synced_at,
       (SELECT COUNT(*) FROM ad_account_client_map WHERE connection_id = sc.id) AS mapped_clients
     FROM social_connections sc
     LEFT JOIN team_members tm ON sc.connected_by = tm.id
     WHERE sc.platform = '${platform}'
     ORDER BY sc.account_name ASC`
    )

    return accounts.map(a => ({
      id: a.id,
      accountId: a.account_id,
      accountName: a.account_name,
      status: a.status,
      tokenExpiresAt: a.token_expires_at,
      scopes: a.scopes || [],
      metadata: a.metadata || {},
      connectedBy: a.connected_by,
      connectedByName: a.connected_by_name,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      lastSyncedAt: a.last_synced_at,
      mappedClients: parseInt(a.mapped_clients, 10) || 0
    }))
  })
}

export function createSocialAccountSpendHandler(platform: SocialAccountProvider) {
  requireProvider(platform)
  return eventHandler(async (event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const now = new Date()
    const month = parseInt(String(query.month)) || (now.getMonth() + 1)
    const year = parseInt(String(query.year)) || now.getFullYear()
    const period = `${year}-${String(month).padStart(2, '0')}`

    const cacheKey = `spend:${platform}:accounts:${period}`

    return cachedFetch(event, cacheKey, 300, async () => {
      const rows = await queryRows<{
        id: string
        account_id: string
        account_name: string
        status: string
        metadata: unknown
        client_id: string | null
        client_name: string | null
        total_spend: string
        total_budget: string
        total_impressions: string
        total_clicks: string
        total_conversions: string
        total_commission: string
        max_commission_rate: string | null
        campaign_count: number
        last_synced_at: string | null
      }>(
        `SELECT sc.id, sc.account_id, sc.account_name, sc.status, sc.metadata,
         sc.client_id, ac.name as client_name,
         COALESCE(SUM(ms.actual_spend), 0) as total_spend,
         COALESCE(SUM(ms.budget_allocated), 0) as total_budget,
         COALESCE(SUM(ms.impressions), 0) as total_impressions,
         COALESCE(SUM(ms.clicks), 0) as total_clicks,
         COALESCE(SUM(ms.conversions), 0) as total_conversions,
         COALESCE(SUM(ms.commission_amount), 0) as total_commission,
         MAX(ms.commission_rate) as max_commission_rate,
         COUNT(ms.id)::int as campaign_count,
         MAX(ms.synced_at) as last_synced_at
       FROM social_connections sc
       LEFT JOIN agency_clients ac ON ac.id = sc.client_id
       LEFT JOIN media_spend ms ON ms.connection_id = sc.id AND ms.period = $1
       WHERE sc.platform = '${platform}' AND sc.status = 'active'
       GROUP BY sc.id, ac.name
       ORDER BY COALESCE(SUM(ms.actual_spend), 0) DESC`,
        [period]
      )

      return rows.map(r => ({
        id: r.id,
        accountId: r.account_id,
        accountName: r.account_name,
        status: r.status,
        metadata: r.metadata,
        clientId: r.client_id,
        clientName: r.client_name,
        totalSpend: parseFloat(r.total_spend) || 0,
        totalBudget: parseFloat(r.total_budget) || 0,
        totalImpressions: parseInt(r.total_impressions) || 0,
        totalClicks: parseInt(r.total_clicks) || 0,
        totalConversions: parseFloat(r.total_conversions) || 0,
        totalCommission: parseFloat(r.total_commission) || 0,
        commissionRate: parseFloat(r.max_commission_rate || '0') || 0,
        campaignCount: r.campaign_count,
        lastSyncedAt: r.last_synced_at
      }))
    })
  })
}

export function createSocialAccountCampaignsHandler(platform: SocialAccountProvider) {
  requireProvider(platform)
  return eventHandler(async (event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const connectionId = String(query.connectionId || '')
    if (!connectionId) {
      throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
    }

    const now = new Date()
    const month = parseInt(String(query.month)) || (now.getMonth() + 1)
    const year = parseInt(String(query.year)) || now.getFullYear()
    const period = `${year}-${String(month).padStart(2, '0')}`

    const rows = await queryRows<{
      id: string
      campaign_id: string
      campaign_name: string
      actual_spend: number
      budget_allocated: number
      budget_rolling: boolean
      impressions: number
      clicks: number
      conversions: number
      commission_rate: number | null
      campaign_type: string | null
      campaign_status: string | null
      synced_at: string | null
    }>(
      `SELECT id, campaign_id, campaign_name, actual_spend, budget_allocated, COALESCE(budget_rolling, false) as budget_rolling,
       commission_rate, impressions, clicks,
       conversions, campaign_type, campaign_status, synced_at
     FROM media_spend
     WHERE connection_id = $1 AND period = $2 AND platform = '${platform}'
     ORDER BY actual_spend DESC`,
      [connectionId, period]
    )

    return rows.map(r => ({
      id: r.id,
      campaignId: r.campaign_id || r.id,
      campaignName: r.campaign_name,
      spend: r.actual_spend,
      budget: r.budget_allocated,
      rolling: r.budget_rolling,
      commissionRate: r.commission_rate || 0,
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: r.conversions,
      campaignType: r.campaign_type,
      campaignStatus: r.campaign_status,
      syncedAt: r.synced_at
    }))
  })
}
