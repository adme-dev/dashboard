/**
 * On-demand sync utilities for single-campaign breakdowns and creatives.
 * Called when a user expands a campaign row and no data exists yet.
 * Much lighter than the bulk sync — targets one campaign at a time.
 */
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { computeMetrics } from '~~/server/utils/analyticsMetrics'
import { unwrapMetaImageUrl } from '~~/server/utils/metaImage'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow,
} from '~~/server/utils/googleCredentialProfiles'
import type { PolicyIssue } from '~~/server/utils/adDiagnostics'

const BREAKDOWN_PLATFORMS = ['meta', 'google_ads']

/**
 * Refresh Google OAuth token if expired or about to expire (within 5 min).
 * Updates the DB and returns the new access token, or null if no refresh needed.
 */
async function refreshGoogleTokenIfNeeded(
  conn: { access_token: string; refresh_token: string | null; token_expires_at: string | null; google_credential_profile_id?: string | null },
  connectionId: string
): Promise<string | null> {
  if (!conn.refresh_token || !conn.token_expires_at) return null
  const expiresAt = new Date(conn.token_expires_at)
  if (expiresAt.getTime() >= Date.now() + 5 * 60 * 1000) return null // still valid

  try {
    const { refreshGoogleToken } = await import('~~/server/utils/googleAdsClient')
    const config = useRuntimeConfig()
    const refreshed = await refreshGoogleToken(conn.refresh_token, config.googleClientId, config.googleClientSecret)
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000)
    await persistGoogleCredentialRefresh({
      connectionId,
      profileId: conn.google_credential_profile_id || null,
      accessToken: refreshed.access_token,
      expiresAt: newExpiry,
    })
    return refreshed.access_token
  } catch (err: any) {
    console.error(`[OnDemandSync] Failed to refresh Google token for connection ${connectionId}:`, err.message)
    return null
  }
}

export interface ExtraMetrics {
  frequency: number | null
  reach: number | null
  landingPageViews: number | null
  videoViews: number | null
  videoThruplay: number | null
  impressionShare: number | null
  lostImpressionShareBudget: number | null
  lostImpressionShareRank: number | null
  qualityRanking: string | null
  engagementRateRanking: string | null
  conversionRateRanking: string | null
  // Engagement metrics
  engagements: number | null
  interactions: number | null
  interactionRate: number | null
  postReactions: number | null
  postComments: number | null
  postShares: number | null
  linkClicks: number | null
  postSaves: number | null
  // Video funnel (percentages 0-100)
  videoP25Rate: number | null
  videoP50Rate: number | null
  videoP75Rate: number | null
  videoP100Rate: number | null
  // Google Search auction metrics
  searchAbsoluteTopIs: number | null
  searchClickShare: number | null
  // Objective-aware cost per result
  costPerResult: number | null
  resultType: string | null
}

export interface BreakdownResult {
  breakdowns: Record<string, any[]>
  hasBreakdowns: boolean
  syncedRows: number
  extraMetrics: ExtraMetrics
}

export interface CreativeResult {
  creatives: Array<{ id: string; type: string; thumbnailUrl: string | null; title: string | null; body: string | null }>
  hasCreatives: boolean
  syncedRows: number
  /** Provider fetch error, when the upstream call failed (rows may still be served from cache). */
  error?: string | null
}

export interface AdPerformanceSyncResult {
  syncedRows: number
  available: boolean
}

export interface DeliveryDiagnosticSyncResult {
  available: boolean
  platform: 'meta' | 'google' | null
  servingSynced: boolean
  impressionShareSynced: boolean
  error: string | null
}

/**
 * Sync breakdowns for a single campaign from the platform API.
 * Returns the breakdown data in the same shape as breakdowns.get.ts.
 */
const EMPTY_EXTRA_METRICS: ExtraMetrics = {
  frequency: null, reach: null, landingPageViews: null,
  videoViews: null, videoThruplay: null,
  impressionShare: null, lostImpressionShareBudget: null, lostImpressionShareRank: null,
  qualityRanking: null, engagementRateRanking: null, conversionRateRanking: null,
  engagements: null, interactions: null, interactionRate: null,
  postReactions: null, postComments: null, postShares: null, linkClicks: null, postSaves: null,
  videoP25Rate: null, videoP50Rate: null, videoP75Rate: null, videoP100Rate: null,
  searchAbsoluteTopIs: null, searchClickShare: null,
  costPerResult: null, resultType: null,
}

export async function syncCampaignBreakdowns(mediaSpendId: string): Promise<BreakdownResult> {
  const empty: BreakdownResult = { breakdowns: { age: [], gender: [], device: [], geo: [], placement: [], hourly: [], city: [], region: [], device_model: [], story_type: [] }, hasBreakdowns: false, syncedRows: 0, extraMetrics: { ...EMPTY_EXTRA_METRICS } }

  const campaign = await queryOne<{
    id: string; platform: string; campaign_id: string; connection_id: string; period: string; campaign_type: string | null
  }>(
    `SELECT id, platform, campaign_id, connection_id, period, campaign_type FROM media_spend WHERE id = $1`,
    [mediaSpendId]
  )
  if (!campaign || !campaign.connection_id || !campaign.campaign_id) return empty
  if (!BREAKDOWN_PLATFORMS.includes(campaign.platform)) return empty

  const conn = await queryOne<GoogleCredentialRow & {
    access_token: string; account_id: string; metadata: any
    refresh_token: string | null; token_expires_at: string | null
  }>(
    `SELECT sc.id, sc.access_token, sc.account_id, sc.metadata, sc.refresh_token, sc.token_expires_at,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
     FROM social_connections sc
     ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
     WHERE sc.id = $1`,
    [campaign.connection_id]
  )
  if (!conn) return empty

  // Refresh Google token if expired (same logic as spendSync.ts)
  if (campaign.platform === 'google_ads') {
    const credential = await resolveGoogleCredential(conn)
    conn.access_token = credential.accessToken
    conn.refresh_token = credential.refreshToken
    conn.token_expires_at = credential.tokenExpiresAt
    conn.google_credential_profile_id = credential.profileId
    const freshToken = await refreshGoogleTokenIfNeeded(conn, campaign.connection_id)
    if (freshToken) conn.access_token = freshToken
  }

  const [yearStr, monthStr] = campaign.period.split('-')
  const month = parseInt(monthStr || '', 10)
  const year = parseInt(yearStr || '', 10)

  const allRows: Array<{ dimensionType: string; dimensionValue: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number }> = []
  const extraMetrics: ExtraMetrics = { ...EMPTY_EXTRA_METRICS }

  try {
    if (campaign.platform === 'meta') {
      await fetchMetaBreakdowns(conn, campaign.campaign_id, month, year, allRows)
      await fetchMetaScalarMetrics(conn, campaign.campaign_id, month, year, extraMetrics)
    } else if (campaign.platform === 'google_ads') {
      await fetchGoogleBreakdowns(conn, campaign.campaign_id, month, year, allRows)
      await fetchGoogleScalarMetrics(conn, campaign.campaign_id, month, year, extraMetrics, campaign.campaign_type)
    }
  } catch (err: any) {
    console.error(`[OnDemandSync] Sync failed for ${campaign.platform}:`, err.message)
  }

  // Upsert breakdowns into DB
  for (const row of allRows) {
    try {
      await queryOne(
        `INSERT INTO spend_breakdowns (media_spend_id, dimension_type, dimension_value, spend, impressions, clicks, conversions, revenue)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (media_spend_id, dimension_type, dimension_value)
         DO UPDATE SET spend = $4, impressions = $5, clicks = $6, conversions = $7, revenue = $8`,
        [mediaSpendId, row.dimensionType, row.dimensionValue, row.spend, row.impressions, row.clicks, row.conversions, row.revenue]
      )
    } catch (err: any) {
      console.warn(`[OnDemandSync] Breakdown upsert failed:`, err.message)
    }
  }

  // Persist scalar + engagement metrics to media_spend row (graceful if migration 041 not applied)
  const hasAnyMetric = Object.values(extraMetrics).some(v => v != null)
  if (hasAnyMetric) {
    try {
      await execute(
        `UPDATE media_spend SET
          frequency = $2, reach = $3, landing_page_views = $4,
          video_views = $5, video_thruplay = $6,
          impression_share = $7, lost_impression_share_budget = $8, lost_impression_share_rank = $9,
          quality_ranking = $10, engagement_rate_ranking = $11, conversion_rate_ranking = $12,
          engagements = $13, interactions = $14, interaction_rate = $15,
          post_reactions = $16, post_comments = $17, post_shares = $18,
          link_clicks = $19, post_saves = $20,
          video_p25_rate = $21, video_p50_rate = $22, video_p75_rate = $23, video_p100_rate = $24,
          search_absolute_top_is = $25, search_click_share = $26,
          cost_per_result = $27, result_type = $28
         WHERE id = $1`,
        [
          mediaSpendId,
          extraMetrics.frequency, extraMetrics.reach, extraMetrics.landingPageViews,
          extraMetrics.videoViews, extraMetrics.videoThruplay,
          extraMetrics.impressionShare, extraMetrics.lostImpressionShareBudget, extraMetrics.lostImpressionShareRank,
          extraMetrics.qualityRanking, extraMetrics.engagementRateRanking, extraMetrics.conversionRateRanking,
          extraMetrics.engagements, extraMetrics.interactions, extraMetrics.interactionRate,
          extraMetrics.postReactions, extraMetrics.postComments, extraMetrics.postShares,
          extraMetrics.linkClicks, extraMetrics.postSaves,
          extraMetrics.videoP25Rate, extraMetrics.videoP50Rate, extraMetrics.videoP75Rate, extraMetrics.videoP100Rate,
          extraMetrics.searchAbsoluteTopIs, extraMetrics.searchClickShare,
          extraMetrics.costPerResult, extraMetrics.resultType,
        ]
      )
    } catch (err: any) {
      // Migration 041 may not be applied yet — columns don't exist
      console.warn(`[OnDemandSync] Extra metrics update failed (migration 041 pending?):`, err.message)
    }
  }

  // Format response
  const breakdowns: Record<string, any[]> = { age: [], gender: [], device: [], geo: [], placement: [], hourly: [], city: [], region: [], device_model: [], story_type: [] }
  for (const r of allRows) {
    if (breakdowns[r.dimensionType]) {
      const metrics = computeMetrics(r.spend, r.impressions, r.clicks, r.conversions, r.revenue)
      breakdowns[r.dimensionType]!.push({
        dimensionValue: r.dimensionValue,
        spend: r.spend, impressions: r.impressions, clicks: r.clicks,
        conversions: r.conversions, revenue: r.revenue,
        ...metrics,
      })
    }
  }
  // Sort non-hourly by spend desc, hourly by hour asc
  for (const key of Object.keys(breakdowns)) {
    if (key === 'hourly') {
      breakdowns[key]!.sort((a: any, b: any) => {
        const hourA = parseInt(a.dimensionValue, 10)
        const hourB = parseInt(b.dimensionValue, 10)
        return hourA - hourB
      })
    } else {
      breakdowns[key]!.sort((a: any, b: any) => b.spend - a.spend)
    }
  }

  return { breakdowns, hasBreakdowns: allRows.length > 0, syncedRows: allRows.length, extraMetrics }
}

/**
 * Sync creatives for a single campaign from the platform API.
 */
export async function syncCampaignCreatives(mediaSpendId: string): Promise<CreativeResult> {
  const empty: CreativeResult = { creatives: [], hasCreatives: false, syncedRows: 0 }

  const campaign = await queryOne<{
    id: string; platform: string; campaign_id: string; connection_id: string
  }>(
    `SELECT id, platform, campaign_id, connection_id FROM media_spend WHERE id = $1`,
    [mediaSpendId]
  )
  if (!campaign || !campaign.connection_id || !campaign.campaign_id) return empty
  if (campaign.platform !== 'meta' && campaign.platform !== 'google_ads') return empty

  const conn = await queryOne<GoogleCredentialRow & {
    access_token: string; account_id: string; metadata: any
    refresh_token: string | null; token_expires_at: string | null
  }>(
    `SELECT sc.id, sc.access_token, sc.account_id, sc.metadata, sc.refresh_token, sc.token_expires_at,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
     FROM social_connections sc
     ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
     WHERE sc.id = $1`,
    [campaign.connection_id]
  )
  if (!conn) return empty

  // Refresh Google token if expired
  if (campaign.platform === 'google_ads') {
    const credential = await resolveGoogleCredential(conn)
    conn.access_token = credential.accessToken
    conn.refresh_token = credential.refreshToken
    conn.token_expires_at = credential.tokenExpiresAt
    conn.google_credential_profile_id = credential.profileId
    const freshToken = await refreshGoogleTokenIfNeeded(conn, campaign.connection_id)
    if (freshToken) conn.access_token = freshToken
  }

  let upserted = 0
  let fetchError: string | null = null

  try {
    if (campaign.platform === 'meta') {
      const { getCampaignCreatives } = await import('~~/server/utils/metaClient')
      const creatives = await getCampaignCreatives(campaign.campaign_id, conn.access_token)
      for (const c of creatives) {
        await queryOne(
          `INSERT INTO campaign_creatives (media_spend_id, creative_id, ad_id, ad_name, creative_type, thumbnail_url, title, body, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (media_spend_id, creative_id)
           DO UPDATE SET ad_id = $3, ad_name = $4, creative_type = $5, thumbnail_url = $6, title = $7, body = $8, synced_at = NOW()`,
          [mediaSpendId, c.creativeId, c.adId, c.adName, c.type, c.thumbnailUrl, c.title, c.body]
        )
        upserted++
      }
    } else if (campaign.platform === 'google_ads') {
      const { getCampaignAdAssets, listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')
      const config = useRuntimeConfig()

      // Prefer the configured manager id (same resolution as syncCampaignAdPerformance); only guess via
      // listAccessibleCustomers when nothing is configured. Without login-customer-id, GAQL against a
      // manager-linked account fails and Google creatives silently never populate.
      let mccId: string | undefined = conn.metadata?.managerCustomerId || config.googleAdsLoginCustomerId || undefined
      if (!mccId) {
        try {
          const accessibleIds = await listAccessibleCustomers(conn.access_token, config.googleDeveloperToken)
          const cleanAccountId = conn.account_id.replace(/-/g, '')
          mccId = accessibleIds.find((id: string) => id !== cleanAccountId) || undefined
        } catch { /* ignore */ }
      }

      const assets = await getCampaignAdAssets(conn.account_id, conn.access_token, config.googleDeveloperToken, campaign.campaign_id, mccId)
      for (const a of assets) {
        await queryOne(
          `INSERT INTO campaign_creatives (media_spend_id, creative_id, ad_id, ad_name, creative_type, thumbnail_url, title, body, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (media_spend_id, creative_id)
           DO UPDATE SET ad_id = $3, ad_name = $4, creative_type = $5, thumbnail_url = $6, title = $7, body = $8, synced_at = NOW()`,
          [mediaSpendId, a.creativeId, a.adId, a.adName, a.type, a.thumbnailUrl, a.title, a.body]
        )
        upserted++
      }
    }
  } catch (err: any) {
    fetchError = err?.message || String(err)
    console.error(`[OnDemandSync] Creative fetch failed for ${campaign.platform}:`, fetchError)
  }

  // Read back from DB to return. Upgrade legacy stored 64x64 emg-wrapper URLs to
  // full-res at read time so existing rows render sharp without a re-sync.
  const rows = await queryRows<any>(
    `SELECT id, creative_id, creative_type, thumbnail_url, title, body
     FROM campaign_creatives WHERE media_spend_id = $1
     ORDER BY synced_at DESC LIMIT 10`,
    [mediaSpendId]
  )

  return {
    creatives: rows.map(r => ({
      id: r.id,
      type: r.creative_type,
      thumbnailUrl: unwrapMetaImageUrl(r.thumbnail_url),
      title: r.title,
      body: r.body,
    })),
    hasCreatives: rows.length > 0,
    syncedRows: upserted,
    error: fetchError,
  }
}

/** Read-through sync for ad-level fatigue metrics used by the Godmode MCP. */
export async function syncCampaignAdPerformance(
  mediaSpendId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<AdPerformanceSyncResult> {
  const campaign = await queryOne<{
    id: string
    platform: string
    campaign_id: string
    connection_id: string
  }>(
    `SELECT id, platform, campaign_id, connection_id FROM media_spend WHERE id = $1`,
    [mediaSpendId],
  )
  if (!campaign?.connection_id || !campaign.campaign_id || !BREAKDOWN_PLATFORMS.includes(campaign.platform)) {
    return { syncedRows: 0, available: false }
  }

  const conn = await queryOne<GoogleCredentialRow & {
    access_token: string
    account_id: string
    metadata: any
    refresh_token: string | null
    token_expires_at: string | null
  }>(
    `SELECT sc.id, sc.access_token, sc.account_id, sc.metadata, sc.refresh_token, sc.token_expires_at,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
       FROM social_connections sc
       ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
      WHERE sc.id = $1`,
    [campaign.connection_id],
  )
  if (!conn) return { syncedRows: 0, available: false }

  let rows: Array<{
    adId: string
    adName: string | null
    creativeId?: string | null
    spend: number
    impressions: number
    clicks: number
    conversions: number
    reach: number | null
    frequency: number | null
    firstServedDate: string | null
    lastServedDate: string | null
    adSetId?: string | null
    adSetName?: string | null
    cpm?: number | null
    adSetMetricsSyncedAt?: string | null
    adSetMetricsUnavailableReason?: string | null
    approvalStatus?: string | null
    providerApprovalStatus?: string | null
    approvalReviewStatus?: string | null
    policyIssues?: PolicyIssue[] | null
    approvalSyncedAt?: string | null
    approvalUnavailableReason?: string | null
    learningStage?: string | null
    providerLearningStage?: string | null
    learningStageSyncedAt?: string | null
    learningStageUnavailableReason?: string | null
  }> = []

  try {
    if (campaign.platform === 'meta') {
      const { getMetaCampaignAdPerformance } = await import('~~/server/utils/metaClient')
      rows = await getMetaCampaignAdPerformance(campaign.campaign_id, conn.access_token, rangeStart, rangeEnd)
    } else {
      const credential = await resolveGoogleCredential(conn)
      conn.access_token = credential.accessToken
      conn.refresh_token = credential.refreshToken
      conn.token_expires_at = credential.tokenExpiresAt
      conn.google_credential_profile_id = credential.profileId
      const freshToken = await refreshGoogleTokenIfNeeded(conn, campaign.connection_id)
      if (freshToken) conn.access_token = freshToken
      const { getGoogleCampaignAdPerformance } = await import('~~/server/utils/googleAdsClient')
      const config = useRuntimeConfig()
      const managerId = conn.metadata?.managerCustomerId || config.googleAdsLoginCustomerId || undefined
      rows = await getGoogleCampaignAdPerformance(
        conn.account_id,
        conn.access_token,
        config.googleDeveloperToken,
        campaign.campaign_id,
        rangeStart,
        rangeEnd,
        managerId,
      )
    }
  } catch (error: any) {
    console.warn(`[OnDemandSync] Ad performance fetch failed for ${campaign.platform}:`, error?.message)
    return { syncedRows: 0, available: false }
  }

  for (const row of rows) {
    await execute(
      `INSERT INTO ad_performance_snapshots (
         media_spend_id, ad_id, creative_id, ad_name, range_start, range_end, spend,
         impressions, clicks, conversions, reach, frequency,
         first_served_date, last_served_date, synced_at,
         ad_set_id, ad_set_name, cpm, ad_set_metrics_synced_at, ad_set_metrics_unavailable_reason,
         approval_status, provider_approval_status, approval_review_status, policy_issues,
         approval_synced_at, approval_unavailable_reason,
         learning_stage, provider_learning_stage, learning_stage_synced_at, learning_stage_unavailable_reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),
                 $15,$16,$17,$18::timestamptz,$19,$20,$21,$22,$23::jsonb,$24::timestamptz,$25,
                 $26,$27,$28::timestamptz,$29)
       ON CONFLICT (media_spend_id, ad_id, range_start, range_end)
       DO UPDATE SET creative_id=$3, ad_name=$4, spend=$7, impressions=$8, clicks=$9,
                     conversions=$10, reach=$11,
                     frequency=CASE WHEN $18::timestamptz IS NOT NULL OR $15 IS NULL THEN $12 ELSE ad_performance_snapshots.frequency END,
                     first_served_date=$13, last_served_date=$14,
                     ad_set_id=COALESCE($15, ad_performance_snapshots.ad_set_id),
                     ad_set_name=COALESCE($16, ad_performance_snapshots.ad_set_name),
                     cpm=CASE WHEN $18::timestamptz IS NOT NULL THEN $17 ELSE ad_performance_snapshots.cpm END,
                     ad_set_metrics_synced_at=COALESCE($18::timestamptz, ad_performance_snapshots.ad_set_metrics_synced_at),
                     ad_set_metrics_unavailable_reason=$19,
                     approval_status=CASE WHEN $24::timestamptz IS NOT NULL THEN $20 ELSE ad_performance_snapshots.approval_status END,
                     provider_approval_status=CASE WHEN $24::timestamptz IS NOT NULL THEN $21 ELSE ad_performance_snapshots.provider_approval_status END,
                     approval_review_status=CASE WHEN $24::timestamptz IS NOT NULL THEN $22 ELSE ad_performance_snapshots.approval_review_status END,
                     policy_issues=CASE WHEN $24::timestamptz IS NOT NULL THEN $23::jsonb ELSE ad_performance_snapshots.policy_issues END,
                     approval_synced_at=COALESCE($24::timestamptz, ad_performance_snapshots.approval_synced_at),
                     approval_unavailable_reason=$25,
                     learning_stage=CASE WHEN $28::timestamptz IS NOT NULL THEN $26 ELSE ad_performance_snapshots.learning_stage END,
                     provider_learning_stage=CASE WHEN $28::timestamptz IS NOT NULL THEN $27 ELSE ad_performance_snapshots.provider_learning_stage END,
                     learning_stage_synced_at=COALESCE($28::timestamptz, ad_performance_snapshots.learning_stage_synced_at),
                     learning_stage_unavailable_reason=$29,
                     synced_at=NOW()`,
      [
        mediaSpendId, row.adId, row.creativeId ?? null, row.adName, rangeStart, rangeEnd, row.spend,
        row.impressions, row.clicks, row.conversions, row.reach, row.frequency,
        row.firstServedDate, row.lastServedDate,
        row.adSetId ?? null, row.adSetName ?? null, row.cpm ?? null,
        row.adSetMetricsSyncedAt ?? null, row.adSetMetricsUnavailableReason ?? null,
        row.approvalStatus ?? null, row.providerApprovalStatus ?? null, row.approvalReviewStatus ?? null,
        row.policyIssues == null ? null : JSON.stringify(row.policyIssues),
        row.approvalSyncedAt ?? null, row.approvalUnavailableReason ?? null,
        row.learningStage ?? null, row.providerLearningStage ?? null,
        row.learningStageSyncedAt ?? null, row.learningStageUnavailableReason ?? null,
      ],
    )
  }
  return { syncedRows: rows.length, available: true }
}

/** Refresh only provider delivery diagnostics for one persisted campaign; never mutates provider state. */
export async function syncCampaignDeliveryDiagnostics(mediaSpendId: string): Promise<DeliveryDiagnosticSyncResult> {
  const campaign = await queryOne<{
    id: string
    platform: string
    campaign_id: string
    connection_id: string
    period: string
  }>(
    `SELECT id, platform, campaign_id, connection_id, period
       FROM media_spend
      WHERE id = $1`,
    [mediaSpendId],
  )
  const platform = campaign?.platform === 'meta' ? 'meta' : campaign?.platform === 'google_ads' ? 'google' : null
  if (!campaign?.connection_id || !campaign.campaign_id || !platform) {
    return { available: false, platform, servingSynced: false, impressionShareSynced: false, error: 'Campaign diagnostics are not supported for this row.' }
  }
  const conn = await queryOne<GoogleCredentialRow & {
    access_token: string
    account_id: string
    metadata: any
    refresh_token: string | null
    token_expires_at: string | null
  }>(
    `SELECT sc.id, sc.access_token, sc.account_id, sc.metadata, sc.refresh_token, sc.token_expires_at,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
       FROM social_connections sc
       ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
      WHERE sc.id = $1`,
    [campaign.connection_id],
  )
  if (!conn) return { available: false, platform, servingSynced: false, impressionShareSynced: false, error: 'Advertising connection not found.' }

  try {
    if (platform === 'meta') {
      const { getMetaCampaignDiagnostic } = await import('~~/server/utils/metaClient')
      const diagnostic = await getMetaCampaignDiagnostic(campaign.campaign_id, conn.access_token)
      await execute(
        `UPDATE media_spend SET
           serving_status = $2,
           serving_status_reasons = $3::text[],
           provider_serving_status_reasons = $4::text[],
           serving_status_synced_at = $5::timestamptz,
           serving_status_unavailable_reason = NULL
         WHERE id = $1`,
        [
          mediaSpendId,
          diagnostic.servingStatus,
          diagnostic.servingStatusReasons,
          diagnostic.providerServingStatusReasons,
          diagnostic.servingSyncedAt,
        ],
      )
      return { available: true, platform, servingSynced: true, impressionShareSynced: false, error: null }
    }

    const credential = await resolveGoogleCredential(conn)
    conn.access_token = credential.accessToken
    conn.refresh_token = credential.refreshToken
    conn.token_expires_at = credential.tokenExpiresAt
    conn.google_credential_profile_id = credential.profileId
    const freshToken = await refreshGoogleTokenIfNeeded(conn, campaign.connection_id)
    if (freshToken) conn.access_token = freshToken
    const config = useRuntimeConfig()
    const managerId = conn.metadata?.managerCustomerId || config.googleAdsLoginCustomerId || undefined
    const parsedYear = Number(campaign.period.split('-')[0])
    const parsedMonth = Number(campaign.period.split('-')[1])
    const safeYear = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear()
    const safeMonth = Number.isFinite(parsedMonth) ? parsedMonth : new Date().getMonth() + 1
    const since = `${safeYear}-${String(safeMonth).padStart(2, '0')}-01`
    const until = `${safeYear}-${String(safeMonth).padStart(2, '0')}-${String(new Date(safeYear, safeMonth, 0).getDate()).padStart(2, '0')}`
    const { getGoogleCampaignDiagnostics } = await import('~~/server/utils/googleAdsClient')
    const diagnostic = (await getGoogleCampaignDiagnostics(
      conn.account_id,
      conn.access_token,
      config.googleDeveloperToken,
      since,
      until,
      campaign.campaign_id,
      managerId,
    ))[0]
    if (!diagnostic) throw new Error('No Google diagnostic row returned for this campaign.')
    const percent = (value: number | null) => value == null ? null : value * 100
    await execute(
      `UPDATE media_spend SET
         serving_status = CASE WHEN $5::timestamptz IS NOT NULL THEN $2 ELSE serving_status END,
         serving_status_reasons = CASE WHEN $5::timestamptz IS NOT NULL THEN $3::text[] ELSE serving_status_reasons END,
         provider_serving_status_reasons = CASE WHEN $5::timestamptz IS NOT NULL THEN $4::text[] ELSE provider_serving_status_reasons END,
         serving_status_synced_at = COALESCE($5::timestamptz, serving_status_synced_at),
         serving_status_unavailable_reason = $6,
         impression_share = CASE WHEN $10::timestamptz IS NOT NULL THEN $7 ELSE impression_share END,
         lost_impression_share_budget = CASE WHEN $10::timestamptz IS NOT NULL THEN $8 ELSE lost_impression_share_budget END,
         lost_impression_share_rank = CASE WHEN $10::timestamptz IS NOT NULL THEN $9 ELSE lost_impression_share_rank END,
         impression_share_synced_at = COALESCE($10::timestamptz, impression_share_synced_at),
         impression_share_unavailable_reason = $11
       WHERE id = $1`,
      [
        mediaSpendId,
        diagnostic.servingStatus,
        diagnostic.servingStatusReasons,
        diagnostic.providerServingStatusReasons,
        diagnostic.servingSyncedAt,
        diagnostic.servingUnavailableReason,
        percent(diagnostic.impressionShare),
        percent(diagnostic.lostImpressionShareBudget),
        percent(diagnostic.lostImpressionShareRank),
        diagnostic.impressionShareSyncedAt,
        diagnostic.impressionShareUnavailableReason,
      ],
    )
    return {
      available: true,
      platform,
      servingSynced: diagnostic.servingSyncedAt != null,
      impressionShareSynced: diagnostic.impressionShareSyncedAt != null,
      error: diagnostic.servingUnavailableReason || diagnostic.impressionShareUnavailableReason,
    }
  } catch (error) {
    const { sanitizeDiagnosticError } = await import('~~/server/utils/adDiagnostics')
    const reason = sanitizeDiagnosticError(error)
    await execute(
      `UPDATE media_spend SET
         serving_status_unavailable_reason = $2,
         impression_share_unavailable_reason = CASE WHEN platform = 'google_ads' THEN $2 ELSE impression_share_unavailable_reason END
       WHERE id = $1`,
      [mediaSpendId, reason],
    ).catch(() => undefined)
    return { available: false, platform, servingSynced: false, impressionShareSynced: false, error: reason }
  }
}

// ─── Meta breakdown fetch (campaign-level) ──────────────

async function fetchMetaBreakdowns(
  conn: { access_token: string; account_id: string; metadata: any },
  campaignId: string,
  month: number,
  year: number,
  allRows: Array<{ dimensionType: string; dimensionValue: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number }>
) {
  const { extractConversions, extractRevenue, getMonthRange } = await import('~~/server/utils/metaClient')
  const { since, until } = getMonthRange(month, year)
  const { ofetch } = await import('ofetch')

  const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0'
  const dimensionMap: Record<string, string> = {
    age: 'age', gender: 'gender', device: 'impression_device', geo: 'country',
    placement: 'publisher_platform',
    hourly: 'hourly_stats_aggregated_by_advertiser_time_zone',
    story_type: 'platform_position',
  }

  for (const [dimType, metaBreakdown] of Object.entries(dimensionMap)) {
    try {
      const res: { data: any[] } = await ofetch(`${META_GRAPH_BASE}/${campaignId}/insights`, {
        method: 'GET',
        query: {
          fields: 'spend,impressions,clicks,actions,action_values',
          time_range: JSON.stringify({ since, until }),
          breakdowns: metaBreakdown,
          access_token: conn.access_token,
          limit: '500',
        },
      })

      for (const item of res.data || []) {
        let dv = item[metaBreakdown] || 'unknown'
        if (dimType === 'age') dv = normalizeAge(dv)
        else if (dimType === 'gender') dv = normalizeGender(dv)
        else if (dimType === 'device') dv = normalizeDevice(dv)
        else if (dimType === 'placement') dv = normalizePlacement(dv)
        else if (dimType === 'hourly') dv = normalizeMetaHour(dv)
        else if (dimType === 'story_type') dv = normalizeStoryType(dv)

        allRows.push({
          dimensionType: dimType,
          dimensionValue: dv,
          spend: parseFloat(item.spend || '0'),
          impressions: parseInt(item.impressions || '0', 10),
          clicks: parseInt(item.clicks || '0', 10),
          conversions: extractConversions(item.actions),
          revenue: extractRevenue(item.action_values),
        })
      }
    } catch (err: any) {
      console.warn(`[OnDemandSync] Meta ${dimType} failed:`, err.message)
    }
  }
}

// ─── Google breakdown fetch (campaign-filtered) ─────────
// v23: age/gender use dedicated view resources; device/placement/hourly use campaign resource;
// geo/city/region use user_location_view. Results aggregated to campaign level.

async function fetchGoogleBreakdowns(
  conn: { access_token: string; account_id: string; metadata: any },
  campaignId: string,
  month: number,
  year: number,
  allRows: Array<{ dimensionType: string; dimensionValue: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number }>
) {
  const { gaqlQuery, listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')
  const { getMonthRange } = await import('~~/server/utils/metaClient')
  const config = useRuntimeConfig()
  const { since, until } = getMonthRange(month, year)

  let mccId: string | undefined
  try {
    const accessibleIds = await listAccessibleCustomers(conn.access_token, config.googleDeveloperToken)
    const cleanAccountId = conn.account_id.replace(/-/g, '')
    mccId = accessibleIds.find((id: string) => id !== cleanAccountId) || undefined
  } catch { /* ignore */ }

  const cleanCampaignId = String(campaignId).replace(/[^0-9]/g, '')
  const dateFilter = `segments.date BETWEEN '${since}' AND '${until}'`

  const parseMetrics = (r: any) => {
    const costMicros = r.metrics?.costMicros || '0'
    return {
      spend: parseInt(costMicros, 10) / 1_000_000,
      impressions: parseInt(r.metrics?.impressions || '0', 10),
      clicks: parseInt(r.metrics?.clicks || '0', 10),
      conversions: parseFloat(r.metrics?.conversions || '0'),
      revenue: parseFloat(r.metrics?.conversionsValue || '0'),
    }
  }

  // Helper to aggregate rows by dimension value (multiple ad groups / dates per value)
  const aggregateRows = (results: any[], extractDv: (r: any) => string, dimType: string) => {
    const agg: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }> = {}
    for (const r of results) {
      const dv = extractDv(r)
      if (dv === 'unknown') continue
      const m = parseMetrics(r)
      if (!agg[dv]) agg[dv] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
      agg[dv].spend += m.spend
      agg[dv].impressions += m.impressions
      agg[dv].clicks += m.clicks
      agg[dv].conversions += m.conversions
      agg[dv].revenue += m.revenue
    }
    for (const [dv, m] of Object.entries(agg)) {
      allRows.push({ dimensionType: dimType, dimensionValue: dv, ...m })
    }
  }

  const metricsFields = 'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value'

  // ── Age: age_range_view (v23 — segments.age_range_type not compatible with campaign) ──
  try {
    const ageMap: Record<string, string> = { AGE_RANGE_18_24: '18-24', AGE_RANGE_25_34: '25-34', AGE_RANGE_35_44: '35-44', AGE_RANGE_45_54: '45-54', AGE_RANGE_55_64: '55-64', AGE_RANGE_65_UP: '65+', AGE_RANGE_UNDETERMINED: 'unknown' }
    const results = await gaqlQuery(conn.account_id, conn.access_token, config.googleDeveloperToken,
      `SELECT ad_group_criterion.age_range.type, ${metricsFields} FROM age_range_view WHERE campaign.id = ${cleanCampaignId} AND ${dateFilter}`, mccId)
    aggregateRows(results, (r) => ageMap[r.adGroupCriterion?.ageRange?.type] || 'unknown', 'age')
  } catch (err: any) { console.warn(`[OnDemandSync] Google age failed:`, err.message) }

  // ── Gender: gender_view ──
  try {
    const genderMap: Record<string, string> = { MALE: 'male', FEMALE: 'female', UNDETERMINED: 'unknown' }
    const results = await gaqlQuery(conn.account_id, conn.access_token, config.googleDeveloperToken,
      `SELECT ad_group_criterion.gender.type, ${metricsFields} FROM gender_view WHERE campaign.id = ${cleanCampaignId} AND ${dateFilter}`, mccId)
    aggregateRows(results, (r) => genderMap[r.adGroupCriterion?.gender?.type] || 'unknown', 'gender')
  } catch (err: any) { console.warn(`[OnDemandSync] Google gender failed:`, err.message) }

  // ── Device: campaign resource (works in v23) ──
  try {
    const deviceMap: Record<string, string> = { MOBILE: 'mobile', DESKTOP: 'desktop', TABLET: 'tablet', CONNECTED_TV: 'connected_tv', OTHER: 'other' }
    const results = await gaqlQuery(conn.account_id, conn.access_token, config.googleDeveloperToken,
      `SELECT segments.device, ${metricsFields} FROM campaign WHERE campaign.id = ${cleanCampaignId} AND ${dateFilter}`, mccId)
    aggregateRows(results, (r) => deviceMap[r.segments?.device] || 'other', 'device')
  } catch (err: any) { console.warn(`[OnDemandSync] Google device failed:`, err.message) }

  // ── Placement (ad network type): campaign resource ──
  try {
    const netMap: Record<string, string> = { SEARCH: 'Search', CONTENT: 'Display', YOUTUBE_SEARCH: 'YouTube Search', YOUTUBE_WATCH: 'YouTube', MIXED: 'Mixed' }
    const results = await gaqlQuery(conn.account_id, conn.access_token, config.googleDeveloperToken,
      `SELECT segments.ad_network_type, ${metricsFields} FROM campaign WHERE campaign.id = ${cleanCampaignId} AND ${dateFilter}`, mccId)
    aggregateRows(results, (r) => netMap[r.segments?.adNetworkType] || r.segments?.adNetworkType || 'unknown', 'placement')
  } catch (err: any) { console.warn(`[OnDemandSync] Google placement failed:`, err.message) }

  // ── Hourly: campaign resource (aggregate across dates) ──
  try {
    const results = await gaqlQuery(conn.account_id, conn.access_token, config.googleDeveloperToken,
      `SELECT segments.hour, ${metricsFields} FROM campaign WHERE campaign.id = ${cleanCampaignId} AND ${dateFilter}`, mccId)
    aggregateRows(results, (r) => String(r.segments?.hour ?? 'unknown'), 'hourly')
  } catch (err: any) { console.warn(`[OnDemandSync] Google hourly failed:`, err.message) }

  // ── Geo (country): geographic_view.country_criterion_id ──
  // segments.geo_target_country is NOT compatible with geographic_view.
  // geographic_view has its own country_criterion_id field for country-level aggregation.
  try {
    const geoResults = await gaqlQuery(conn.account_id, conn.access_token, config.googleDeveloperToken,
      `SELECT campaign.id, geographic_view.country_criterion_id, ${metricsFields} FROM geographic_view WHERE campaign.id = ${cleanCampaignId} AND ${dateFilter}`, mccId)

    const geoAgg: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }> = {}
    for (const r of geoResults) {
      const countryId = String(r.geographicView?.countryCriterionId || '')
      if (!countryId) continue
      const m = parseMetrics(r)
      if (!geoAgg[countryId]) geoAgg[countryId] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
      geoAgg[countryId].spend += m.spend
      geoAgg[countryId].impressions += m.impressions
      geoAgg[countryId].clicks += m.clicks
      geoAgg[countryId].conversions += m.conversions
      geoAgg[countryId].revenue += m.revenue
    }
    const geoIds = Object.keys(geoAgg)
    if (geoIds.length > 0) {
      const nameMap = await resolveGeoNames(conn.account_id, conn.access_token, config.googleDeveloperToken, geoIds, mccId)
      for (const [geoId, agg] of Object.entries(geoAgg)) {
        const info = nameMap.get(geoId)
        if (!info || agg.spend < 0.01) continue
        allRows.push({ dimensionType: 'geo', dimensionValue: info.name || `Location ${geoId}`, ...agg })
      }
    }
  } catch (err: any) { console.warn(`[OnDemandSync] Google geo failed:`, err.message) }

  // ── City & Region: user_location_view with geo_target segments ──
  // GAQL requires campaign.id in SELECT when filtering by it in WHERE.
  for (const geoSegment of ['city', 'region'] as const) {
    try {
      const segmentField = geoSegment === 'city' ? 'segments.geo_target_city' : 'segments.geo_target_region'
      const responseKey = geoSegment === 'city' ? 'geoTargetCity' : 'geoTargetRegion'
      const geoResults = await gaqlQuery(conn.account_id, conn.access_token, config.googleDeveloperToken,
        `SELECT campaign.id, ${segmentField}, ${metricsFields} FROM user_location_view WHERE campaign.id = ${cleanCampaignId} AND ${dateFilter}`, mccId)

      const locAgg: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }> = {}
      for (const r of geoResults) {
        const geoConstant = r.segments?.[responseKey] || ''
        const geoId = String(geoConstant).replace(/[^0-9]/g, '')
        if (!geoId) continue

        const m = parseMetrics(r)
        if (!locAgg[geoId]) locAgg[geoId] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
        locAgg[geoId].spend += m.spend
        locAgg[geoId].impressions += m.impressions
        locAgg[geoId].clicks += m.clicks
        locAgg[geoId].conversions += m.conversions
        locAgg[geoId].revenue += m.revenue
      }

      const geoIds = Object.keys(locAgg)
      if (geoIds.length > 0) {
        const nameMap = await resolveGeoNames(conn.account_id, conn.access_token, config.googleDeveloperToken, geoIds, mccId)
        for (const [geoId, agg] of Object.entries(locAgg)) {
          const info = nameMap.get(geoId)
          if (!info || agg.spend < 0.01) continue
          allRows.push({ dimensionType: geoSegment, dimensionValue: info.name || `Location ${geoId}`, ...agg })
        }
      }
    } catch (err: any) {
      console.warn(`[OnDemandSync] Google ${geoSegment} geo failed:`, err.message)
    }
  }
}

// ─── Google geo name resolver ───────────────────────────

async function resolveGeoNames(
  customerId: string,
  token: string,
  developerToken: string,
  geoIds: string[],
  mccId?: string
): Promise<Map<string, { name: string; targetType: string; countryCode: string }>> {
  const { gaqlQuery } = await import('~~/server/utils/googleAdsClient')
  const nameMap = new Map<string, { name: string; targetType: string; countryCode: string }>()

  // Batch resolve — query up to 100 at a time
  const batches: string[][] = []
  for (let i = 0; i < geoIds.length; i += 100) {
    batches.push(geoIds.slice(i, i + 100))
  }

  for (const batch of batches) {
    try {
      const resourceNames = batch.map(id => `'geoTargetConstants/${id}'`).join(',')
      const query = `
        SELECT geo_target_constant.canonical_name,
               geo_target_constant.country_code,
               geo_target_constant.target_type,
               geo_target_constant.resource_name
        FROM geo_target_constant
        WHERE geo_target_constant.resource_name IN (${resourceNames})
      `
      const results = await gaqlQuery(customerId, token, developerToken, query, mccId)
      for (const r of results) {
        const rn = r.geoTargetConstant?.resourceName || ''
        const id = rn.replace(/[^0-9]/g, '')
        if (id) {
          nameMap.set(id, {
            name: r.geoTargetConstant?.canonicalName || '',
            targetType: r.geoTargetConstant?.targetType || '',
            countryCode: r.geoTargetConstant?.countryCode || '',
          })
        }
      }
    } catch (err: any) {
      console.warn(`[OnDemandSync] Geo name resolution failed:`, err.message)
    }
  }

  return nameMap
}

// ─── Meta scalar metrics fetch ──────────────────────────

// Meta objective → primary action type for cost-per-result
const META_OBJECTIVE_ACTION_MAP: Record<string, { actionType: string; label: string }> = {
  OUTCOME_TRAFFIC: { actionType: 'link_click', label: 'Cost per Click' },
  OUTCOME_LEADS: { actionType: 'lead', label: 'Cost per Lead' },
  OUTCOME_SALES: { actionType: 'purchase', label: 'Cost per Purchase' },
  OUTCOME_ENGAGEMENT: { actionType: 'post_engagement', label: 'Cost per Engagement' },
  OUTCOME_AWARENESS: { actionType: 'landing_page_view', label: 'Cost per LPV' },
  OUTCOME_APP_PROMOTION: { actionType: 'app_install', label: 'Cost per Install' },
  LINK_CLICKS: { actionType: 'link_click', label: 'Cost per Click' },
  LEAD_GENERATION: { actionType: 'lead', label: 'Cost per Lead' },
  CONVERSIONS: { actionType: 'purchase', label: 'Cost per Purchase' },
  POST_ENGAGEMENT: { actionType: 'post_engagement', label: 'Cost per Engagement' },
  VIDEO_VIEWS: { actionType: 'video_view', label: 'Cost per View' },
  REACH: { actionType: 'landing_page_view', label: 'Cost per LPV' },
  BRAND_AWARENESS: { actionType: 'landing_page_view', label: 'Cost per LPV' },
}

async function fetchMetaScalarMetrics(
  conn: { access_token: string; account_id: string; metadata: any },
  campaignId: string,
  month: number,
  year: number,
  metrics: ExtraMetrics
) {
  const { getMonthRange } = await import('~~/server/utils/metaClient')
  const { since, until } = getMonthRange(month, year)
  const { ofetch } = await import('ofetch')
  const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0'

  // Campaign-level insights: frequency, reach, actions, video metrics, engagement
  try {
    const res: { data: any[] } = await ofetch(`${META_GRAPH_BASE}/${campaignId}/insights`, {
      method: 'GET',
      query: {
        fields: 'frequency,reach,actions,cost_per_action_type,video_thru_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions',
        time_range: JSON.stringify({ since, until }),
        access_token: conn.access_token,
      },
    })
    const item = res.data?.[0]
    if (item) {
      metrics.frequency = item.frequency ? parseFloat(item.frequency) : null
      metrics.reach = item.reach ? parseInt(item.reach, 10) : null

      // Extract action types from the actions array
      if (Array.isArray(item.actions)) {
        const getAction = (type: string) => {
          const a = item.actions.find((a: any) => a.action_type === type)
          return a ? parseInt(a.value, 10) : null
        }

        metrics.landingPageViews = getAction('landing_page_view')
        metrics.videoViews = getAction('video_view')
        metrics.linkClicks = getAction('link_click')
        metrics.postSaves = getAction('onsite_conversion.post_save')
        metrics.postComments = getAction('comment')
        metrics.postShares = getAction('post')
        metrics.postReactions = getAction('post_reaction')

        // Total engagements (Meta's aggregate)
        metrics.engagements = getAction('post_engagement')
      }

      // ThruPlay from video_thru_play_actions
      if (Array.isArray(item.video_thru_play_actions)) {
        const tp = item.video_thru_play_actions.find((a: any) => a.action_type === 'video_view')
        metrics.videoThruplay = tp ? parseInt(tp.value, 10) : null
      }

      // Video funnel — compute rates from counts
      const videoViewCount = metrics.videoViews
      if (videoViewCount && videoViewCount > 0) {
        const getVideoAction = (arr: any[]) => {
          if (!Array.isArray(arr)) return null
          const a = arr.find((a: any) => a.action_type === 'video_view')
          return a ? parseInt(a.value, 10) : null
        }
        const p25 = getVideoAction(item.video_p25_watched_actions)
        const p50 = getVideoAction(item.video_p50_watched_actions)
        const p75 = getVideoAction(item.video_p75_watched_actions)
        const p100 = getVideoAction(item.video_p100_watched_actions)

        if (p25 != null) metrics.videoP25Rate = Math.min((p25 / videoViewCount) * 100, 100)
        if (p50 != null) metrics.videoP50Rate = Math.min((p50 / videoViewCount) * 100, 100)
        if (p75 != null) metrics.videoP75Rate = Math.min((p75 / videoViewCount) * 100, 100)
        if (p100 != null) metrics.videoP100Rate = Math.min((p100 / videoViewCount) * 100, 100)
      }
    }
  } catch (err: any) {
    console.warn(`[OnDemandSync] Meta scalar metrics failed:`, err.message)
  }

  // Ad-level quality rankings (take first ad's rankings)
  try {
    const res: { data: any[] } = await ofetch(`${META_GRAPH_BASE}/${campaignId}/insights`, {
      method: 'GET',
      query: {
        fields: 'quality_ranking,engagement_rate_ranking,conversion_rate_ranking',
        time_range: JSON.stringify({ since, until }),
        level: 'ad',
        limit: '1',
        access_token: conn.access_token,
      },
    })
    const item = res.data?.[0]
    if (item) {
      metrics.qualityRanking = item.quality_ranking || null
      metrics.engagementRateRanking = item.engagement_rate_ranking || null
      metrics.conversionRateRanking = item.conversion_rate_ranking || null
    }
  } catch (err: any) {
    console.warn(`[OnDemandSync] Meta quality rankings failed:`, err.message)
  }

  // Fetch campaign objective for cost-per-result derivation
  try {
    const campRes: any = await ofetch(`${META_GRAPH_BASE}/${campaignId}`, {
      method: 'GET',
      query: { fields: 'objective', access_token: conn.access_token },
    })
    const objective = campRes?.objective
    if (objective) {
      const mapping = META_OBJECTIVE_ACTION_MAP[objective]
      if (mapping) {
        metrics.resultType = mapping.label
        // Try cost_per_action_type first (from the insights we already fetched)
        // Refetch insights just for cost_per_action_type if not cached
        try {
          const cpaRes: { data: any[] } = await ofetch(`${META_GRAPH_BASE}/${campaignId}/insights`, {
            method: 'GET',
            query: {
              fields: 'cost_per_action_type,actions',
              time_range: JSON.stringify({ since, until }),
              access_token: conn.access_token,
            },
          })
          const cpaItem = cpaRes.data?.[0]
          if (cpaItem?.cost_per_action_type) {
            const cpa = cpaItem.cost_per_action_type.find((a: any) => a.action_type === mapping.actionType)
            if (cpa) {
              metrics.costPerResult = parseFloat(cpa.value)
            }
          }
          // Fallback: compute from actions + total spend if cost_per_action_type didn't have the type
          if (metrics.costPerResult == null && cpaItem?.actions) {
            const action = cpaItem.actions.find((a: any) => a.action_type === mapping.actionType)
            if (action) {
              const actionCount = parseInt(action.value, 10)
              // We need total spend — get from frequency/reach fetch or re-fetch
              if (actionCount > 0) {
                // Fetch spend from a lightweight insights call
                const spendRes: { data: any[] } = await ofetch(`${META_GRAPH_BASE}/${campaignId}/insights`, {
                  method: 'GET',
                  query: { fields: 'spend', time_range: JSON.stringify({ since, until }), access_token: conn.access_token },
                })
                const totalSpend = parseFloat(spendRes.data?.[0]?.spend || '0')
                if (totalSpend > 0) {
                  metrics.costPerResult = totalSpend / actionCount
                }
              }
            }
          }
        } catch { /* cost per result derivation failed — non-critical */ }
      }
    }
  } catch (err: any) {
    console.warn(`[OnDemandSync] Meta objective fetch failed:`, err.message)
  }
}

// ─── Google scalar metrics fetch ────────────────────────

// Google channel type → result label for cost-per-result
const GOOGLE_CHANNEL_RESULT_MAP: Record<string, string> = {
  SEARCH: 'Cost per Conv.',
  DISPLAY: 'Cost per Conv.',
  SHOPPING: 'Cost per Conv.',
  VIDEO: 'Cost per View',
  PERFORMANCE_MAX: 'Cost per Conv.',
  DEMAND_GEN: 'Cost per Conv.',
  LOCAL: 'Cost per Conv.',
  SMART: 'Cost per Conv.',
}

async function fetchGoogleScalarMetrics(
  conn: { access_token: string; account_id: string; metadata: any },
  campaignId: string,
  month: number,
  year: number,
  metrics: ExtraMetrics,
  campaignType?: string | null
) {
  const { gaqlQuery, listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')
  const { getMonthRange } = await import('~~/server/utils/metaClient')
  const config = useRuntimeConfig()
  const { since, until } = getMonthRange(month, year)
  const cleanCampaignId = String(campaignId).replace(/[^0-9]/g, '')

  let mccId: string | undefined
  try {
    const accessibleIds = await listAccessibleCustomers(conn.access_token, config.googleDeveloperToken)
    const cleanAccountId = conn.account_id.replace(/-/g, '')
    mccId = accessibleIds.find((id: string) => id !== cleanAccountId) || undefined
  } catch { /* ignore */ }

  // Split scalar metrics into separate queries — mixing search-specific metrics
  // (impression_share) with video-specific metrics (quartile rates) causes 400 in v23.

  let totalVideoViews = 0
  let totalEngagements = 0
  let totalInteractions = 0
  let totalCostMicros = 0
  let totalConversions = 0
  const isAccum = [] as number[]
  const absTopIsAccum = [] as number[]
  const clickShareAccum = [] as number[]
  const lostBudgetAccum = [] as number[]
  const lostRankAccum = [] as number[]
  const intRateAccum = [] as number[]
  const quartileAccum = { p25: [] as number[], p50: [] as number[], p75: [] as number[], p100: [] as number[] }

  // Query 1: Core metrics (cost, conversions, interactions — universally compatible)
  try {
    const coreResults = await gaqlQuery(conn.account_id, conn.access_token, config.googleDeveloperToken,
      `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks,
              metrics.conversions, metrics.interactions
       FROM campaign
       WHERE campaign.id = ${cleanCampaignId} AND segments.date BETWEEN '${since}' AND '${until}'`, mccId)
    for (const r of coreResults) {
      if (r.metrics?.interactions) totalInteractions += parseInt(r.metrics.interactions, 10)
      if (r.metrics?.costMicros) totalCostMicros += parseInt(r.metrics.costMicros, 10)
      if (r.metrics?.conversions) totalConversions += parseFloat(r.metrics.conversions)
    }
  } catch (err: any) { console.warn(`[OnDemandSync] Google core metrics failed:`, err.message) }

  // Query 1b: Engagements (may not be available for all campaign types in v23)
  // Note: metrics.video_views is unrecognized in v23 on campaign resource.
  // Video view data comes from video quartile rates (Query 3) instead.
  try {
    const engResults = await gaqlQuery(conn.account_id, conn.access_token, config.googleDeveloperToken,
      `SELECT metrics.engagements
       FROM campaign
       WHERE campaign.id = ${cleanCampaignId} AND segments.date BETWEEN '${since}' AND '${until}'`, mccId)
    for (const r of engResults) {
      if (r.metrics?.engagements) totalEngagements += parseInt(r.metrics.engagements, 10)
    }
  } catch { /* engagements metric not available for this campaign type */ }

  // Query 2: Search-specific metrics (only valid for Search/Shopping campaigns)
  try {
    const searchResults = await gaqlQuery(conn.account_id, conn.access_token, config.googleDeveloperToken,
      `SELECT metrics.search_impression_share, metrics.search_budget_lost_impression_share,
              metrics.search_rank_lost_impression_share, metrics.search_absolute_top_impression_share,
              metrics.search_click_share
       FROM campaign
       WHERE campaign.id = ${cleanCampaignId} AND segments.date BETWEEN '${since}' AND '${until}'`, mccId)
    for (const r of searchResults) {
      if (r.metrics?.searchImpressionShare != null) isAccum.push(parseFloat(r.metrics.searchImpressionShare) * 100)
      if (r.metrics?.searchAbsoluteTopImpressionShare != null) absTopIsAccum.push(parseFloat(r.metrics.searchAbsoluteTopImpressionShare) * 100)
      if (r.metrics?.searchClickShare != null) clickShareAccum.push(parseFloat(r.metrics.searchClickShare) * 100)
      if (r.metrics?.searchBudgetLostImpressionShare != null) lostBudgetAccum.push(parseFloat(r.metrics.searchBudgetLostImpressionShare) * 100)
      if (r.metrics?.searchRankLostImpressionShare != null) lostRankAccum.push(parseFloat(r.metrics.searchRankLostImpressionShare) * 100)
    }
  } catch (err: any) { console.warn(`[OnDemandSync] Google search metrics failed:`, err.message) }

  // Query 3: Video-specific metrics (only valid for Video campaigns)
  try {
    const videoResults = await gaqlQuery(conn.account_id, conn.access_token, config.googleDeveloperToken,
      `SELECT metrics.video_quartile_p25_rate, metrics.video_quartile_p50_rate,
              metrics.video_quartile_p75_rate, metrics.video_quartile_p100_rate
       FROM campaign
       WHERE campaign.id = ${cleanCampaignId} AND segments.date BETWEEN '${since}' AND '${until}'`, mccId)
    for (const r of videoResults) {
      if (r.metrics?.videoQuartileP25Rate != null) quartileAccum.p25.push(parseFloat(r.metrics.videoQuartileP25Rate))
      if (r.metrics?.videoQuartileP50Rate != null) quartileAccum.p50.push(parseFloat(r.metrics.videoQuartileP50Rate))
      if (r.metrics?.videoQuartileP75Rate != null) quartileAccum.p75.push(parseFloat(r.metrics.videoQuartileP75Rate))
      if (r.metrics?.videoQuartileP100Rate != null) quartileAccum.p100.push(parseFloat(r.metrics.videoQuartileP100Rate))
    }
  } catch (err: any) { console.warn(`[OnDemandSync] Google video metrics failed:`, err.message) }

  // Aggregate results from all three queries
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null

  metrics.videoViews = totalVideoViews > 0 ? totalVideoViews : null
  metrics.engagements = totalEngagements > 0 ? totalEngagements : null
  metrics.interactions = totalInteractions > 0 ? totalInteractions : null
  metrics.impressionShare = avg(isAccum)
  metrics.searchAbsoluteTopIs = avg(absTopIsAccum)
  metrics.searchClickShare = avg(clickShareAccum)
  metrics.lostImpressionShareBudget = avg(lostBudgetAccum)
  metrics.lostImpressionShareRank = avg(lostRankAccum)
  metrics.interactionRate = avg(intRateAccum)

  // Video quartile rates (Google returns 0-1 range, convert to 0-100)
  const avgPct = (arr: number[]) => arr.length > 0 ? (arr.reduce((s, v) => s + v, 0) / arr.length) * 100 : null
  metrics.videoP25Rate = avgPct(quartileAccum.p25)
  metrics.videoP50Rate = avgPct(quartileAccum.p50)
  metrics.videoP75Rate = avgPct(quartileAccum.p75)
  metrics.videoP100Rate = avgPct(quartileAccum.p100)

  // Cost per result — use channel type to determine label
  const channelKey = (campaignType || '').toUpperCase()
  const resultLabel = GOOGLE_CHANNEL_RESULT_MAP[channelKey]
  if (resultLabel && totalConversions > 0) {
    metrics.costPerResult = (totalCostMicros / 1_000_000) / totalConversions
    metrics.resultType = resultLabel
  } else if (channelKey === 'VIDEO' && totalVideoViews > 0) {
    metrics.costPerResult = (totalCostMicros / 1_000_000) / totalVideoViews
    metrics.resultType = 'Cost per View'
  }
}

// ─── Normalizers ────────────────────────────────────────

function normalizeAge(val: string): string {
  const v = val.replace(/[^0-9+]/g, '')
  const map: Record<string, string> = { '1824': '18-24', '2534': '25-34', '3544': '35-44', '4554': '45-54', '5564': '55-64', '65+': '65+' }
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
  if (v.includes('mobile') || v === 'smartphone' || v === 'iphone' || v === 'android' || v === 'android_smartphone') return 'mobile'
  if (v.includes('tablet') || v === 'ipad') return 'tablet'
  if (v.includes('desktop') || v === 'computer') return 'desktop'
  return v || 'other'
}

function normalizePlacement(val: string): string {
  const map: Record<string, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    messenger: 'Messenger',
    audience_network: 'Audience Network',
    an: 'Audience Network',
  }
  return map[val.toLowerCase()] || val
}

/**
 * Normalize Meta platform_position (Feed, Stories, Reels, etc.)
 */
function normalizeStoryType(val: string): string {
  const map: Record<string, string> = {
    feed: 'Feed',
    story: 'Stories',
    reels: 'Reels',
    an_classic: 'Audience Network',
    instant_article: 'Instant Article',
    marketplace: 'Marketplace',
    search: 'Search',
    video_feeds: 'Video Feeds',
    right_hand_column: 'Right Column',
    instagram_explore: 'Explore',
    instagram_profile_feed: 'Profile Feed',
    instagram_reels: 'Reels',
    instagram_stories: 'Stories',
    facebook_reels: 'FB Reels',
    facebook_stories: 'FB Stories',
    instream_video: 'In-Stream Video',
    rewarded_video: 'Rewarded Video',
  }
  return map[val.toLowerCase()] || val.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Normalize Meta hourly breakdown value.
 * Meta returns "00:00:00 - 00:59:59" format, we extract just the hour as "0"-"23".
 */
function normalizeMetaHour(val: string): string {
  // Extract the leading hour number
  const match = val.match(/^(\d{1,2}):/)
  if (match) return String(parseInt(match[1]!, 10))
  return val
}
