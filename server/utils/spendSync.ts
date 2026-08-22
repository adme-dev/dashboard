/**
 * Spend Sync — shared logic for Meta and Google Ads spend syncing.
 *
 * Extracted from the API endpoints so it can be called from both
 * the HTTP handler (direct) and the queue consumer (background).
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { getCachedBinding } from '~~/server/utils/email'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow,
} from '~~/server/utils/googleCredentialProfiles'
import type { H3Event } from 'h3'
import { sanitizeSpendSyncFailureReason } from '~~/server/utils/spendSyncFailureSanitizer'
import { applySpendCoverageGate, recordSourceCampaignCount } from '~~/server/utils/spendSyncJobs'

// ─── Meta Spend Sync ────────────────────────────────────────────

interface MetaConn {
  id: string
  client_id: string | null
  account_id: string
  account_name: string
  access_token: string
  metadata: any
}
interface AccountMapping {
  connection_id: string
  campaign_id: string | null
  campaign_name_pattern: string | null
  xero_client_name: string
  xero_client_code: string | null
}
type SyncResult = {
  synced: number
  totalSpend: number
  failures: Array<{ account: string; reason: string }>
  /** G-2: per-source coverage warnings (any decrease vs the previous successful run). */
  coverageWarnings?: string[]
}

/**
 * Sync a single Meta ad account. This is the unit of work for the per-account
 * queue chunking — it's small enough to finish inside one Cloudflare Queue
 * consumer invocation even on the slower neon() HTTP DB path. Per-account Graph
 * errors are returned as failures (never thrown) so the caller can fan-in.
 */
export async function syncMetaSpendAccount(conn: MetaConn, month: number, year: number, mappings: AccountMapping[]): Promise<SyncResult> {
  const {
    getCampaignInsights,
    getCampaignInsightsById,
    getCampaignDailyInsights,
    getCampaignDailyInsightsById,
    getCampaigns,
    mapMetaCampaignMeta,
    extractConversions,
    extractRevenue,
  } = await import('~~/server/utils/metaClient')
  const period = `${year}-${String(month).padStart(2, '0')}`
  const failures: Array<{ account: string; reason: string }> = []
  let totalSynced = 0
  let totalSpend = 0

  const actId = conn.metadata?.actId || `act_${conn.account_id}`
  const connectionClient = conn.client_id
    ? await queryOne<{ id: string; media_commission_rate: string | null }>(
        `SELECT id, media_commission_rate FROM agency_clients WHERE id = $1 LIMIT 1`,
        [conn.client_id]
      )
    : null

  let campaigns
  try {
    campaigns = await getCampaignInsights(actId, conn.access_token, month, year)
  } catch (err: any) {
    console.error(
      `[MetaSync] Failed to fetch insights for ${conn.account_name}:`,
      sanitizeSpendSyncFailureReason(err?.message)
    )
    const gErr = err?.data?.error
    const reason = gErr
      ? `${gErr.message || 'Graph error'}${gErr.code ? ` (#${gErr.code})` : ''}`
      : (err?.message || 'Unknown error')
    failures.push({ account: conn.account_name, reason: sanitizeSpendSyncFailureReason(reason) })
    return { synced: 0, totalSpend: 0, failures }
  }

  let usedCampaignNodeFallback = false
  let knownCampaigns: Array<{ campaign_id: string, campaign_name: string | null }> = []

  // Meta can return HTTP 200 + an empty collection for account-level insights
  // from datacenter egress under a restricted app access tier while direct
  // /{campaignId}/insights reads still work. Re-read only campaign IDs already
  // known for this exact connection/period; never discover or broaden scope here.
  if (!campaigns || campaigns.length === 0) {
    knownCampaigns = await queryRows<{ campaign_id: string, campaign_name: string | null }>(
      `SELECT DISTINCT campaign_id, campaign_name
         FROM media_spend
        WHERE connection_id = $1
          AND platform = 'meta'
          AND period = $2
          AND campaign_id IS NOT NULL`,
      [conn.id, period]
    )
    const fallbackInsights = []
    for (const known of knownCampaigns) {
      try {
        const insight = await getCampaignInsightsById(known.campaign_id, conn.access_token, month, year)
        if (insight) {
          fallbackInsights.push({
            ...insight,
            campaign_id: insight.campaign_id || known.campaign_id,
            campaign_name: insight.campaign_name || known.campaign_name || undefined,
          })
        }
      } catch (err: any) {
        console.warn('[MetaSync] Direct campaign fallback failed:', sanitizeSpendSyncFailureReason(err?.message))
      }
    }
    if (fallbackInsights.length > 0) {
      campaigns = fallbackInsights
      usedCampaignNodeFallback = true
      console.warn(`[MetaSync] Account-level insights were empty; refreshed ${fallbackInsights.length} known campaign(s) through bounded campaign-node reads.`)
    } else if (knownCampaigns.length > 0) {
      failures.push({ account: conn.account_name, reason: 'Empty insights for an account with prior spend — likely access-tier/egress block, not a genuine $0' })
    }
    if (!campaigns || campaigns.length === 0) return { synced: 0, totalSpend: 0, failures }
  }

  // G-2 coverage gate: compare this source's RETURNED row count with its previous successful run
  // BEFORE persisting anything. A >5% shrink halts the persist step for this source — the existing
  // rows stay untouched — and surfaces a structured failure instead of silently narrowing coverage.
  const coverageWarnings: string[] = []
  const coverage = await applySpendCoverageGate({
    platform: 'meta',
    sourceKey: conn.id,
    sourceLabel: conn.account_name,
    currentCount: campaigns.length
  })
  if (coverage.warning) coverageWarnings.push(`${conn.account_name}: ${coverage.warning}`)
  if (coverage.halted) {
    failures.push({ account: conn.account_name, reason: sanitizeSpendSyncFailureReason(coverage.warning || 'coverage halt') })
    return { synced: 0, totalSpend: 0, failures, coverageWarnings }
  }

  // Enrich with campaign-level metadata (status, end date, bid strategy, budget type).
  // One call per account; non-fatal on failure.
  const campaignMetaById = new Map<string, ReturnType<typeof mapMetaCampaignMeta>>()
  try {
    const campObjs = await getCampaigns(actId, conn.access_token)
    for (const c of campObjs) campaignMetaById.set(c.id, mapMetaCampaignMeta(c))
  } catch (err: any) {
    console.warn(
      `[MetaSync] Campaign metadata fetch failed for ${conn.account_name}:`,
      sanitizeSpendSyncFailureReason(err?.message)
    )
  }

  for (const campaign of campaigns) {
    const spend = parseFloat(campaign.spend || '0')
    if (spend === 0) continue

    totalSpend += spend

    let clientId: string | null = connectionClient?.id || conn.client_id || null
    let commissionRate = parseFloat(connectionClient?.media_commission_rate || '0') || 0
    const mapping = findMapping(mappings, conn.id, campaign.campaign_id, campaign.campaign_name)
    if (mapping) {
      const client = await queryOne<{ id: string; media_commission_rate: string | null }>(
        `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR (xero_contact_id IS NOT NULL AND xero_contact_id = $2) LIMIT 1`,
        [mapping.xero_client_name, mapping.xero_client_code]
      )
      if (client) {
        clientId = client.id
        commissionRate = parseFloat(client.media_commission_rate || '0') || 0
      }
    }

    const conversions = extractConversions(campaign.actions)
    const revenue = extractRevenue(campaign.action_values)
    const impressions = parseInt(campaign.impressions || '0', 10)
    const clicks = parseInt(campaign.clicks || '0', 10)

    const cmeta = campaign.campaign_id ? (campaignMetaById.get(campaign.campaign_id) || null) : null

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
           campaign_status = COALESCE($10, media_spend.campaign_status),
           end_date = COALESCE($11, media_spend.end_date),
           bid_strategy = COALESCE($12, media_spend.bid_strategy),
           budget_type = COALESCE($13, media_spend.budget_type),
           synced_at = NOW(), updated_at = NOW()
         WHERE id = $7`,
        [spend, campaign.campaign_name || null, impressions, clicks, conversions, clientId, existing.id, commissionRate, revenue,
         cmeta?.status || null, cmeta?.endDate || null, cmeta?.bidStrategy || null, cmeta?.budgetType || null]
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
           impressions, clicks, conversions, budget_rolling, revenue,
           campaign_status, end_date, bid_strategy, budget_type, synced_at
         ) VALUES ($1, 'meta', $2, $11, $3, $4, $5, $6, $7, $8, $9, $10, $12, $13, $14, $15, $16, $17, NOW())
         RETURNING id`,
        [clientId, period, spend, commissionRate, conn.id, campaign.campaign_id || null, campaign.campaign_name || null, impressions, clicks, conversions, budgetVal, rollingVal, revenue,
         cmeta?.status || null, cmeta?.endDate || null, cmeta?.bidStrategy || null, cmeta?.budgetType || null]
      )
    }

    totalSynced++
  }

  // Daily spend pass
  try {
    const dailyInsights = []
    if (usedCampaignNodeFallback) {
      for (const known of knownCampaigns) {
        try {
          dailyInsights.push(...await getCampaignDailyInsightsById(known.campaign_id, conn.access_token, month, year))
        } catch (err: any) {
          console.warn('[MetaSync] Direct daily campaign fallback failed:', sanitizeSpendSyncFailureReason(err?.message))
        }
      }
    } else {
      dailyInsights.push(...await getCampaignDailyInsights(actId, conn.access_token, month, year))
    }
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
    console.error(
      `[MetaSync] Daily spend failed for ${conn.account_name}:`,
      sanitizeSpendSyncFailureReason(err?.message)
    )
  }

  // Persist succeeded (not halted) → this run becomes the next coverage baseline for the source.
  await recordSourceCampaignCount('meta', conn.id, period, campaigns.length)

  return { synced: totalSynced, totalSpend: Math.round(totalSpend * 100) / 100, failures, coverageWarnings }
}

/** Sync one Meta account by connection id — the per-account queue chunk entry point. */
export async function syncMetaSpendByConnectionId(connectionId: string, month: number, year: number): Promise<SyncResult> {
  const conn = await queryOne<MetaConn>(
    `SELECT id, client_id, account_id, access_token, account_name, metadata
     FROM social_connections
     WHERE id = $1 AND platform = 'meta' AND status = 'active'`,
    [connectionId]
  )
  if (!conn) return { synced: 0, totalSpend: 0, failures: [] }

  const mappings = await queryRows<AccountMapping>(
    `SELECT connection_id, campaign_id, campaign_name_pattern, xero_client_name, xero_client_code
     FROM ad_account_client_map WHERE connection_id = $1`,
    [connectionId]
  )

  return syncMetaSpendAccount(conn, month, year, mappings)
}

/** List active Meta connection ids — used to fan out per-account queue messages. */
export async function listMetaConnectionIds(): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(
    `SELECT id FROM social_connections WHERE platform = 'meta' AND status = 'active'`
  )
  return rows.map(r => r.id)
}

export async function syncMetaSpend(month: number, year: number): Promise<SyncResult> {
  const connections = await queryRows<MetaConn>(
    `SELECT id, client_id, account_id, access_token, account_name, metadata
     FROM social_connections
     WHERE platform = 'meta' AND status = 'active'`
  )
  if (connections.length === 0) return { synced: 0, totalSpend: 0, failures: [] }

  const mappings = await queryRows<AccountMapping>(
    `SELECT connection_id, campaign_id, campaign_name_pattern, xero_client_name, xero_client_code
     FROM ad_account_client_map`
  )

  let totalSynced = 0
  let totalSpend = 0
  const failures: Array<{ account: string; reason: string }> = []
  const coverageWarnings: string[] = []

  for (const conn of connections) {
    const connMappings = mappings.filter(m => m.connection_id === conn.id)
    const r = await syncMetaSpendAccount(conn, month, year, connMappings)
    totalSynced += r.synced
    totalSpend += r.totalSpend
    failures.push(...r.failures)
    coverageWarnings.push(...(r.coverageWarnings || []))
  }

  return { synced: totalSynced, totalSpend: Math.round(totalSpend * 100) / 100, failures, coverageWarnings }
}

// ─── Google Spend Sync ──────────────────────────────────────────

/**
 * Resolve the Google Ads `login-customer-id` (manager / MCC) to send when
 * querying a client account's spend. Client accounts under a manager MUST
 * carry the manager's id in this header or the API returns 403
 * USER_PERMISSION_DENIED. A configured GOOGLE_ADS_LOGIN_CUSTOMER_ID always
 * wins; otherwise the manager is auto-detected as an accessible customer that
 * isn't itself one of the connected client accounts. Dashes are stripped.
 *
 * The previous logic detected one id from a single arbitrary connection and
 * reused it for every account; when accounts spanned managers (or the heuristic
 * picked a non-manager id) almost every account 403'd. Connected account ids
 * are expected to already be dash-stripped.
 */
export function resolveGoogleManagerId(opts: {
  configured?: string | null
  accessibleIds?: string[]
  connectionAccountIds?: Set<string>
}): string | undefined {
  const norm = (s: string) => s.replace(/-/g, '')
  const configured = opts.configured ? norm(opts.configured) : ''
  if (configured) return configured
  const accessible = (opts.accessibleIds || []).map(norm).filter(Boolean)
  const connected = opts.connectionAccountIds || new Set<string>()
  return accessible.find(id => !connected.has(id)) || accessible[0] || undefined
}

interface GoogleConnRow extends GoogleCredentialRow {
  id: string
  client_id: string | null
  account_id: string
  account_name: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  metadata: any
}

async function hydrateGoogleConnection(row: GoogleConnRow): Promise<GoogleConnRow> {
  const credential = await resolveGoogleCredential(row)
  return {
    ...row,
    access_token: credential.accessToken,
    refresh_token: credential.refreshToken,
    token_expires_at: credential.tokenExpiresAt,
    google_credential_profile_id: credential.profileId,
  }
}

interface GoogleSyncCtx {
  month: number
  year: number
  period: string
  mccId: string | undefined
  mappings: Array<{ connection_id: string; campaign_id: string | null; campaign_name_pattern: string | null; xero_client_name: string; xero_client_code: string | null }>
  config: GoogleAdsRuntimeConfig
}

interface GoogleAdsRuntimeConfig {
  googleClientId: string
  googleClientSecret: string
  googleDeveloperToken: string
  googleAdsLoginCustomerId: string
}

type CloudflareContext = {
  cloudflare?: {
    env?: Record<string, unknown>
  }
}

export function resolveGoogleAdsRuntimeConfig(runtimeConfig?: Partial<GoogleAdsRuntimeConfig>, event?: H3Event): GoogleAdsRuntimeConfig {
  const config = runtimeConfig ?? (useRuntimeConfig() as Partial<GoogleAdsRuntimeConfig>)
  const read = (runtimeKey: keyof GoogleAdsRuntimeConfig, envKey: string): string => {
    const requestBinding = event
      ? (event.context as CloudflareContext).cloudflare?.env?.[envKey]
      : undefined
    if (typeof requestBinding === 'string') return requestBinding
    return getCachedBinding(envKey) || String(config[runtimeKey] || '') || process.env[envKey] || ''
  }

  return {
    googleClientId: read('googleClientId', 'GOOGLE_CLIENT_ID'),
    googleClientSecret: read('googleClientSecret', 'GOOGLE_CLIENT_SECRET'),
    googleDeveloperToken: read('googleDeveloperToken', 'GOOGLE_DEVELOPER_TOKEN'),
    googleAdsLoginCustomerId: read('googleAdsLoginCustomerId', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID')
  }
}

/**
 * Sync ONE Google connection's spend. This is the per-account loop body lifted
 * out of syncGoogleSpend so a single account can run as its own queue chunk.
 * Per-account errors are caught into `failures` (never thrown) so the queue
 * fan-in stays exactly-once.
 */
async function processGoogleConnection(
  conn: GoogleConnRow,
  ctx: GoogleSyncCtx,
  deps: { refreshGoogleToken: any; getMonthlySpend: any; getDailySpend: any }
): Promise<SyncResult> {
  const failures: Array<{ account: string; reason: string }> = []
  let synced = 0
  let totalSpend = 0
  const { config, mccId, month, year, period, mappings } = ctx
  const { refreshGoogleToken, getMonthlySpend, getDailySpend } = deps
  const connectionClient = conn.client_id
    ? await queryOne<{ id: string; media_commission_rate: string | null }>(
        `SELECT id, media_commission_rate FROM agency_clients WHERE id = $1 LIMIT 1`,
        [conn.client_id]
      )
    : null

  let accessToken = conn.access_token
  if (conn.refresh_token && conn.token_expires_at) {
    const expiresAt = new Date(conn.token_expires_at)
    if (expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      try {
        const refreshed = await refreshGoogleToken(conn.refresh_token, config.googleClientId, config.googleClientSecret)
        accessToken = refreshed.access_token
        const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000)
        await persistGoogleCredentialRefresh({
          connectionId: conn.id,
          profileId: conn.google_credential_profile_id || null,
          accessToken,
          expiresAt: newExpiry,
        })
      } catch (err: any) {
        console.error(`[GoogleSync] Failed to refresh token for ${conn.account_name}:`, err.message)
        failures.push({ account: conn.account_name, reason: `Token refresh failed: ${err?.message || 'unknown'}` })
        return { synced, totalSpend: Math.round(totalSpend * 100) / 100, failures }
      }
    }
  }

  let campaigns
  // Explicit runtime config remains authoritative. Otherwise use the manager
  // recorded for this credential profile/account pair before legacy detection.
  const accountMccId = config.googleAdsLoginCustomerId
    ? mccId
    : (conn.metadata?.managerCustomerId || mccId)
  let effectiveMccId = accountMccId
  try {
    try {
      campaigns = await getMonthlySpend(conn.account_id, accessToken, config.googleDeveloperToken, month, year, accountMccId)
    } catch (err: any) {
      const status = err?.status || err?.statusCode
      // A 403 under a manager context can also mean this account is directly
      // owned (not a child of the MCC) — retry once without the manager
      // header before recording a failure.
      if (status === 403 && accountMccId) {
        campaigns = await getMonthlySpend(conn.account_id, accessToken, config.googleDeveloperToken, month, year, undefined)
        effectiveMccId = undefined
      } else {
        throw err
      }
    }
  } catch (err: any) {
    console.error(`[GoogleSync] Failed to fetch spend for ${conn.account_name}:`, err.message)
    const status = err?.status || err?.statusCode
    const reason = status === 403 ? 'Access denied (403) — check ad-account access / manager link'
      : status === 400 ? 'Bad request (400)'
      : status ? `Error ${status}`
      : (err?.message || 'Unknown error')
    failures.push({ account: conn.account_name, reason })
    return { synced, totalSpend: Math.round(totalSpend * 100) / 100, failures }
  }

  // G-2 coverage gate: a >5% shrink vs this source's previous successful run halts the persist
  // step (existing rows untouched); any decrease is surfaced as a warning. See spendSyncJobs.ts.
  const coverageWarnings: string[] = []
  const coverage = await applySpendCoverageGate({
    platform: 'google',
    sourceKey: conn.id,
    sourceLabel: conn.account_name,
    currentCount: campaigns.length
  })
  if (coverage.warning) coverageWarnings.push(`${conn.account_name}: ${coverage.warning}`)
  if (coverage.halted) {
    failures.push({ account: conn.account_name, reason: coverage.warning || 'coverage halt' })
    return { synced, totalSpend: Math.round(totalSpend * 100) / 100, failures, coverageWarnings }
  }

  for (const campaign of campaigns) {
    if (campaign.spend === 0) continue
    totalSpend += campaign.spend

    let clientId: string | null = connectionClient?.id || conn.client_id || null
    let commissionRate = parseFloat(connectionClient?.media_commission_rate || '0') || 0
    const mapping = findMapping(mappings, conn.id, campaign.campaignId, campaign.campaignName)
    if (mapping) {
      const client = await queryOne<{ id: string; media_commission_rate: string | null }>(
        `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR (xero_contact_id IS NOT NULL AND xero_contact_id = $2) LIMIT 1`,
        [mapping.xero_client_name, mapping.xero_client_code]
      )
      if (client) {
        clientId = client.id
        commissionRate = parseFloat(client.media_commission_rate || '0') || 0
      }
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
           end_date = COALESCE($12, media_spend.end_date),
           bid_strategy = COALESCE($13, media_spend.bid_strategy),
           budget_type = COALESCE($14, media_spend.budget_type),
           synced_at = NOW(), updated_at = NOW()
         WHERE id = $9`,
        [campaign.spend, campaign.campaignName || null, campaign.impressions, campaign.clicks, campaign.conversions, clientId, campaign.channelType || null, campaign.status || null, existing.id, commissionRate, campaign.conversionsValue || 0, campaign.endDate || null, campaign.bidStrategy || null, campaign.budgetType || null]
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
           impressions, clicks, conversions, campaign_type, campaign_status, budget_rolling, revenue, end_date, bid_strategy, budget_type, synced_at
         ) VALUES ($1, 'google_ads', $2, $13, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $14, $15, $16, $17, $18, NOW())
         RETURNING id`,
        [clientId, period, campaign.spend, commissionRate, conn.id, campaign.campaignId || null, campaign.campaignName || null, campaign.impressions, campaign.clicks, campaign.conversions, campaign.channelType || null, campaign.status || null, budgetVal, rollingVal, campaign.conversionsValue || 0, campaign.endDate || null, campaign.bidStrategy || null, campaign.budgetType || null]
      )
    }

    synced++
  }

  // Daily spend pass
  try {
    const dailyRows = await getDailySpend(conn.account_id, accessToken, config.googleDeveloperToken, month, year, effectiveMccId)
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

  // Persist succeeded (not halted) → this run becomes the next coverage baseline for the source.
  await recordSourceCampaignCount('google', conn.id, period, campaigns.length)

  return { synced, totalSpend: Math.round(totalSpend * 100) / 100, failures, coverageWarnings }
}

export async function syncGoogleSpend(month: number, year: number): Promise<SyncResult> {
  const { getMonthlySpend, getDailySpend, refreshGoogleToken, listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')
  const failures: Array<{ account: string; reason: string }> = []

  const period = `${year}-${String(month).padStart(2, '0')}`
  const config = resolveGoogleAdsRuntimeConfig()

  const rawConnections = await queryRows<GoogleConnRow>(
    `SELECT sc.id, sc.client_id, sc.account_id, sc.account_name, sc.access_token,
            sc.refresh_token, sc.token_expires_at, sc.metadata,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
     FROM social_connections sc
     ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
     WHERE sc.platform = 'google' AND sc.status = 'active'`
  )
  const connections = await Promise.all(rawConnections.map(hydrateGoogleConnection))

  if (connections.length === 0) return { synced: 0, totalSpend: 0, failures }

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
  const connAccountIds = new Set(connections.map(c => c.account_id.replace(/-/g, '')))
  const configuredMcc = config.googleAdsLoginCustomerId || ''
  if (configuredMcc) {
    mccId = resolveGoogleManagerId({ configured: configuredMcc })
  } else {
    const firstConn = connections[0]!
    try {
      const accessibleIds = await listAccessibleCustomers(firstConn.access_token, config.googleDeveloperToken)
      mccId = resolveGoogleManagerId({ accessibleIds, connectionAccountIds: connAccountIds })
    } catch (err: any) {
      console.warn(`[GoogleSync] Could not detect MCC:`, err.message)
    }
  }

  let totalSynced = 0
  let totalSpend = 0
  const coverageWarnings: string[] = []

  const deps = { refreshGoogleToken, getMonthlySpend, getDailySpend }
  const ctx: GoogleSyncCtx = { month, year, period, mccId, mappings, config }
  for (const conn of connections) {
    const r = await processGoogleConnection(conn, ctx, deps)
    totalSynced += r.synced
    totalSpend += r.totalSpend
    failures.push(...r.failures)
    coverageWarnings.push(...(r.coverageWarnings || []))
  }

  // Breakdowns + creatives are now fetched on-demand (see onDemandSync.ts)

  return { synced: totalSynced, totalSpend: Math.round(totalSpend * 100) / 100, failures, coverageWarnings }
}

/**
 * Sync ONE Google connection's spend — the per-account queue chunk. Mirrors
 * syncMetaSpendByConnectionId. Catches per-account errors into `failures` so the
 * queue fan-in stays exactly-once (rarely throws).
 */
export async function syncGoogleSpendByConnectionId(connectionId: string, month: number, year: number): Promise<SyncResult> {
  const { refreshGoogleToken, getMonthlySpend, getDailySpend, listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')
  const period = `${year}-${String(month).padStart(2, '0')}`
  const config = resolveGoogleAdsRuntimeConfig()

  const rawConn = await queryOne<GoogleConnRow>(
    `SELECT sc.id, sc.client_id, sc.account_id, sc.account_name, sc.access_token,
            sc.refresh_token, sc.token_expires_at, sc.metadata,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
     FROM social_connections sc
     ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
     WHERE sc.id = $1 AND sc.platform = 'google' AND sc.status = 'active'`,
    [connectionId]
  )
  if (!rawConn) return { synced: 0, totalSpend: 0, failures: [{ account: connectionId, reason: 'connection not found' }] }
  const conn = await hydrateGoogleConnection(rawConn)

  const mappings = await queryRows<GoogleSyncCtx['mappings'][number]>(
    `SELECT connection_id, campaign_id, campaign_name_pattern, xero_client_name, xero_client_code FROM ad_account_client_map`
  )

  // Resolve the manager id once for this account (configured MCC wins, else detect).
  const configuredMcc = config.googleAdsLoginCustomerId || ''
  let mccId: string | undefined
  if (configuredMcc) {
    mccId = resolveGoogleManagerId({ configured: configuredMcc })
  } else if (conn.metadata?.managerCustomerId) {
    mccId = resolveGoogleManagerId({ configured: conn.metadata.managerCustomerId })
  } else {
    try {
      const accessibleIds = await listAccessibleCustomers(conn.access_token, config.googleDeveloperToken)
      // Exclude ALL connected google accounts (not just this one) so the detected
      // manager matches what syncGoogleSpend's bulk path resolves — otherwise a
      // sibling client account could be mistaken for the manager (wrong header → 403).
      const allGoogle = await queryRows<{ account_id: string }>(
        `SELECT account_id FROM social_connections WHERE platform = 'google' AND status = 'active'`
      )
      mccId = resolveGoogleManagerId({ accessibleIds, connectionAccountIds: new Set(allGoogle.map(r => r.account_id.replace(/-/g, ''))) })
    } catch { /* leave undefined; processGoogleConnection retries without mcc on 403 */ }
  }

  const ctx: GoogleSyncCtx = { month, year, period, mccId, mappings, config }
  return processGoogleConnection(conn, ctx, { refreshGoogleToken, getMonthlySpend, getDailySpend })
}

/** Active Google connection ids — mirror of listMetaConnectionIds. */
export async function listGoogleConnectionIds(): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(
    `SELECT id FROM social_connections WHERE platform = 'google' AND status = 'active'`
  )
  return rows.map(r => r.id)
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
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR (xero_contact_id IS NOT NULL AND xero_contact_id = $2) LIMIT 1`,
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
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR (xero_contact_id IS NOT NULL AND xero_contact_id = $2) LIMIT 1`,
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
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR (xero_contact_id IS NOT NULL AND xero_contact_id = $2) LIMIT 1`,
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

  // Breakdowns are now fetched on-demand (see onDemandSync.ts)

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
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR (xero_contact_id IS NOT NULL AND xero_contact_id = $2) LIMIT 1`,
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
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR (xero_contact_id IS NOT NULL AND xero_contact_id = $2) LIMIT 1`,
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
          `SELECT id, media_commission_rate FROM agency_clients WHERE name = $1 OR (xero_contact_id IS NOT NULL AND xero_contact_id = $2) LIMIT 1`,
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

  // Breakdowns are now fetched on-demand (see onDemandSync.ts)

  return { synced: totalSynced, totalSpend: Math.round(totalSpend * 100) / 100 }
}

// ─── Breakdown Sync (Meta, Google, Microsoft, Pinterest) ────────

interface BreakdownRow {
  campaignId: string
  dimensionType: string
  dimensionValue: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
}

/** Normalize dimension values across platforms to consistent labels */
function normalizeAge(val: string): string {
  const v = val.toLowerCase().replace(/[^0-9+-]/g, '')
  const map: Record<string, string> = {
    '1824': '18-24', '2534': '25-34', '3544': '35-44',
    '4554': '45-54', '5564': '55-64', '65+': '65+',
  }
  return map[v] || val
}

function normalizeGender(val: string): string {
  const v = val.toLowerCase()
  if (v === 'male' || v === 'm') return 'male'
  if (v === 'female' || v === 'f') return 'female'
  return 'unknown'
}

function normalizeDevice(val: string): string {
  const v = val.toLowerCase()
  if (v.includes('mobile') || v === 'smartphone' || v === 'iphone' || v === 'android') return 'mobile'
  if (v.includes('tablet') || v === 'ipad') return 'tablet'
  if (v.includes('desktop') || v === 'computer') return 'desktop'
  return v || 'other'
}

const BREAKDOWN_PLATFORMS = ['meta', 'google_ads', 'microsoft_ads', 'pinterest'] as const

/**
 * Sync demographic/geographic/device breakdowns for all supported platforms.
 * Called after main campaign sync completes.
 */
export async function syncBreakdowns(platform: string, connectionId: string, month: number, year: number): Promise<number> {
  if (!BREAKDOWN_PLATFORMS.includes(platform as any)) return 0

  const period = `${year}-${String(month).padStart(2, '0')}`

  // Get all media_spend IDs for this connection/period
  const spendRows = await queryRows<{ id: string; campaign_id: string }>(
    `SELECT id, campaign_id FROM media_spend
     WHERE connection_id = $1 AND platform = $2 AND period = $3 AND campaign_id IS NOT NULL`,
    [connectionId, platform, period]
  )
  if (spendRows.length === 0) return 0

  const campaignToSpendId = new Map(spendRows.map(r => [r.campaign_id, r.id]))

  // Get connection info
  const conn = await queryOne<GoogleCredentialRow & { access_token: string; account_id: string; metadata: any; refresh_token: string | null; token_expires_at: string | null }>(
    `SELECT sc.id, sc.access_token, sc.account_id, sc.metadata, sc.refresh_token, sc.token_expires_at,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
     FROM social_connections sc
     ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
     WHERE sc.id = $1`,
    [connectionId]
  )
  if (!conn) return 0
  if (platform === 'google_ads') {
    const credential = await resolveGoogleCredential(conn)
    conn.access_token = credential.accessToken
    conn.refresh_token = credential.refreshToken
    conn.token_expires_at = credential.tokenExpiresAt
    conn.google_credential_profile_id = credential.profileId
  }

  let allRows: BreakdownRow[] = []

  try {
    if (platform === 'meta') {
      const { getBreakdownInsights } = await import('~~/server/utils/metaClient')
      const actId = conn.metadata?.actId || `act_${conn.account_id}`
      const dimensionMap = { age: 'age', gender: 'gender', device: 'impression_device', geo: 'country' } as const

      for (const [dimType, metaBreakdown] of Object.entries(dimensionMap)) {
        try {
          const rows = await getBreakdownInsights(actId, conn.access_token, month, year, metaBreakdown as any)
          for (const r of rows) {
            let dv = r.dimensionValue
            if (dimType === 'age') dv = normalizeAge(dv)
            else if (dimType === 'gender') dv = normalizeGender(dv)
            else if (dimType === 'device') dv = normalizeDevice(dv)
            allRows.push({ ...r, dimensionType: dimType, dimensionValue: dv })
          }
        } catch (err: any) {
          console.warn(`[BreakdownSync] Meta ${dimType} failed:`, err.message)
        }
      }
    } else if (platform === 'google_ads') {
      const { getBreakdownData } = await import('~~/server/utils/googleAdsClient')
      const config = useRuntimeConfig()
      const segments = ['age', 'gender', 'device', 'geo'] as const

      // Detect MCC for login-customer-id
      let mccId: string | undefined = conn.metadata?.managerCustomerId || config.googleAdsLoginCustomerId || undefined // metadata → configured MCC → discovery
      try {
        if (!mccId) {
          const { listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')
          const accessibleIds = await listAccessibleCustomers(conn.access_token, config.googleDeveloperToken)
          const cleanAccountId = conn.account_id.replace(/-/g, '')
          mccId = accessibleIds.find(id => id !== cleanAccountId) || undefined
        }
      } catch { /* ignore */ }

      for (const seg of segments) {
        try {
          const rows = await getBreakdownData(conn.account_id, conn.access_token, config.googleDeveloperToken, month, year, seg, mccId)
          allRows.push(...rows.map(r => ({ ...r, dimensionType: seg })))
        } catch (err: any) {
          console.warn(`[BreakdownSync] Google ${seg} failed:`, err.message)
        }
      }
    } else if (platform === 'microsoft_ads') {
      const { getBreakdownReport } = await import('~~/server/utils/microsoftAdsClient')
      const config = useRuntimeConfig()

      // AgeGender report produces both age and gender rows
      try {
        const ageGenderRows = await getBreakdownReport(conn.account_id, conn.access_token, config.microsoftAdsDeveloperToken, month, year, 'AgeGender')
        allRows.push(...ageGenderRows.map(r => ({ campaignId: r.campaignId, dimensionType: r.dimensionType, dimensionValue: r.dimensionValue, spend: r.spend, impressions: r.impressions, clicks: r.clicks, conversions: r.conversions, revenue: r.revenue })))
      } catch (err: any) { console.warn('[BreakdownSync] Microsoft AgeGender failed:', err.message) }

      try {
        const deviceRows = await getBreakdownReport(conn.account_id, conn.access_token, config.microsoftAdsDeveloperToken, month, year, 'Device')
        allRows.push(...deviceRows.map(r => ({ campaignId: r.campaignId, dimensionType: 'device', dimensionValue: r.dimensionValue, spend: r.spend, impressions: r.impressions, clicks: r.clicks, conversions: r.conversions, revenue: r.revenue })))
      } catch (err: any) { console.warn('[BreakdownSync] Microsoft Device failed:', err.message) }

      try {
        const geoRows = await getBreakdownReport(conn.account_id, conn.access_token, config.microsoftAdsDeveloperToken, month, year, 'Geographic')
        allRows.push(...geoRows.map(r => ({ campaignId: r.campaignId, dimensionType: 'geo', dimensionValue: r.dimensionValue, spend: r.spend, impressions: r.impressions, clicks: r.clicks, conversions: r.conversions, revenue: r.revenue })))
      } catch (err: any) { console.warn('[BreakdownSync] Microsoft Geo failed:', err.message) }
    } else if (platform === 'pinterest') {
      const { getBreakdownAnalytics } = await import('~~/server/utils/pinterestClient')
      const dimensionMap = { age: 'AGE_BUCKET', gender: 'GENDER', device: 'TARGETING_TYPE', geo: 'GEO_TARGETING' } as const

      for (const [dimType, pinBreakdown] of Object.entries(dimensionMap)) {
        try {
          const rows = await getBreakdownAnalytics(conn.account_id, conn.access_token, month, year, pinBreakdown as any)
          allRows.push(...rows.map(r => ({
            campaignId: r.campaignId,
            dimensionType: dimType,
            dimensionValue: dimType === 'age' ? normalizeAge(r.dimensionValue) : dimType === 'gender' ? normalizeGender(r.dimensionValue) : dimType === 'device' ? normalizeDevice(r.dimensionValue) : r.dimensionValue,
            spend: r.spend, impressions: r.impressions, clicks: r.clicks, conversions: r.conversions, revenue: 0,
          })))
        } catch (err: any) {
          console.warn(`[BreakdownSync] Pinterest ${dimType} failed:`, err.message)
        }
      }
    }
  } catch (err: any) {
    console.error(`[BreakdownSync] ${platform} breakdown sync failed:`, err.message)
    return 0
  }

  // Upsert all breakdown rows
  let upserted = 0
  for (const row of allRows) {
    const mediaSpendId = campaignToSpendId.get(row.campaignId)
    if (!mediaSpendId) continue

    try {
      await queryOne(
        `INSERT INTO spend_breakdowns (media_spend_id, dimension_type, dimension_value, spend, impressions, clicks, conversions, revenue)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (media_spend_id, dimension_type, dimension_value)
         DO UPDATE SET spend = $4, impressions = $5, clicks = $6, conversions = $7, revenue = $8`,
        [mediaSpendId, row.dimensionType, row.dimensionValue, row.spend, row.impressions, row.clicks, row.conversions, row.revenue]
      )
      upserted++
    } catch (err: any) {
      console.warn(`[BreakdownSync] Upsert failed for ${row.dimensionType}/${row.dimensionValue}:`, err.message)
    }
  }

  return upserted
}

// ─── Creative Sync (Meta, Google) ───────────────────────────────

/**
 * Sync ad creatives for campaigns. Only Meta and Google support this.
 */
export async function syncCreatives(platform: string, connectionId: string, month: number, year: number): Promise<number> {
  if (platform !== 'meta' && platform !== 'google_ads') return 0

  const period = `${year}-${String(month).padStart(2, '0')}`

  const spendRows = await queryRows<{ id: string; campaign_id: string }>(
    `SELECT id, campaign_id FROM media_spend
     WHERE connection_id = $1 AND platform = $2 AND period = $3 AND campaign_id IS NOT NULL`,
    [connectionId, platform, period]
  )
  if (spendRows.length === 0) return 0

  const conn = await queryOne<GoogleCredentialRow & { access_token: string; account_id: string; metadata: any }>(
    `SELECT sc.id, sc.access_token, sc.refresh_token, sc.token_expires_at,
            sc.account_id, sc.metadata,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
     FROM social_connections sc
     ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
     WHERE sc.id = $1`,
    [connectionId]
  )
  if (!conn) return 0
  if (platform === 'google_ads') {
    const credential = await resolveGoogleCredential(conn)
    conn.access_token = credential.accessToken
    conn.refresh_token = credential.refreshToken
    conn.token_expires_at = credential.tokenExpiresAt
    conn.google_credential_profile_id = credential.profileId
  }

  let upserted = 0

  if (platform === 'meta') {
    const { getCampaignCreatives } = await import('~~/server/utils/metaClient')

    for (const row of spendRows) {
      try {
        const creatives = await getCampaignCreatives(row.campaign_id, conn.access_token)
        for (const c of creatives) {
          await queryOne(
            `INSERT INTO campaign_creatives (media_spend_id, creative_id, creative_type, thumbnail_url, title, body, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (media_spend_id, creative_id)
             DO UPDATE SET creative_type = $3, thumbnail_url = $4, title = $5, body = $6, synced_at = NOW()`,
            [row.id, c.creativeId, c.type, c.thumbnailUrl, c.title, c.body]
          )
          upserted++
        }
      } catch (err: any) {
        console.warn(`[CreativeSync] Meta campaign ${row.campaign_id}:`, err.message)
      }
    }
  } else if (platform === 'google_ads') {
    const { getCampaignAdAssets } = await import('~~/server/utils/googleAdsClient')
    const config = useRuntimeConfig()

    let mccId: string | undefined = conn.metadata?.managerCustomerId || config.googleAdsLoginCustomerId || undefined // metadata → configured MCC → discovery
    try {
      if (!mccId) {
        const { listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')
        const accessibleIds = await listAccessibleCustomers(conn.access_token, config.googleDeveloperToken)
        const cleanAccountId = conn.account_id.replace(/-/g, '')
        mccId = accessibleIds.find(id => id !== cleanAccountId) || undefined
      }
    } catch { /* ignore */ }

    for (const row of spendRows) {
      try {
        const assets = await getCampaignAdAssets(conn.account_id, conn.access_token, config.googleDeveloperToken, row.campaign_id, mccId)
        for (const a of assets) {
          await queryOne(
            `INSERT INTO campaign_creatives (media_spend_id, creative_id, ad_id, ad_name, creative_type, thumbnail_url, title, body, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
             ON CONFLICT (media_spend_id, creative_id)
             DO UPDATE SET ad_id = $3, ad_name = $4, creative_type = $5, thumbnail_url = $6, title = $7, body = $8, synced_at = NOW()`,
            [row.id, a.creativeId, a.adId, a.adName, a.type, a.thumbnailUrl, a.title, a.body]
          )
          upserted++
        }
      } catch (err: any) {
        console.warn(`[CreativeSync] Google campaign ${row.campaign_id}:`, err.message)
      }
    }
  }

  return upserted
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
