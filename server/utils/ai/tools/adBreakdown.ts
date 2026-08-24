import { z } from 'zod'
import { queryOne, queryRows } from '~~/server/utils/db'
import { syncCampaignAdPerformance } from '~~/server/utils/onDemandSync'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { buildDataHealth, buildSyncFreshness, paginateWithCursor, evaluateHalt, PACING_HALT_HOURS } from './responseContract'
import { getSpendCoverageDeltas } from '~~/server/utils/spendSyncJobs'
import { diagnosticDataStatus, type PolicyIssue } from '~~/server/utils/adDiagnostics'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const params = z.object({
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  clientName: z.string().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  platform: z.enum(['meta', 'google']).optional(),
  sortBy: z.enum(['spend', 'frequency', 'ctr', 'cpc', 'leads', 'cpl', 'age']).default('frequency'),
  refresh: z.boolean().default(false),
  comparePrevious: z.boolean().default(false),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).superRefine((value, issue) => {
  if (!value.campaignId && !value.campaignName && !value.clientName) issue.addIssue({ code: 'custom', message: 'Provide campaignId, campaignName, or clientName.' })
  if (Boolean(value.startDate) !== Boolean(value.endDate)) issue.addIssue({ code: 'custom', message: 'startDate and endDate must be supplied together.' })
})
type Args = z.infer<typeof params>

type RawAdRecord = {
  adId: string
  adName: string | null
  campaignId: string
  campaignName: string | null
  clientName: string | null
  platform: 'meta' | 'google'
  creativeId: string | null
  creativeName: string | null
  spend: number
  impressions: number
  clicks: number
  conversions: number
  leadCount: number
  reach: number | null
  frequency: number | null
  cpm: number | null
  firstServedDate: string | null
  lastServedDate: string | null
  lastSyncedAt: string | null
  adSetId: string | null
  adSetName: string | null
  adSetMetricsAsOf: string | null
  adSetMetricsUnavailableReason: string | null
  approvalStatus: string | null
  providerApprovalStatus: string | null
  approvalReviewStatus: string | null
  policyIssues: PolicyIssue[] | null
  approvalAsOf: string | null
  approvalUnavailableReason: string | null
  learningStage: string | null
  providerLearningStage: string | null
  learningStageAsOf: string | null
  learningStageUnavailableReason: string | null
}

export type AdBreakdownDeps = {
  fetch: (args: Args, ctx: ToolContext) => Promise<{ records: RawAdRecord[], targetCount: number, available: boolean }>
  leadAttribution?: (args: Args, ctx: ToolContext) => Promise<{ totalSubmissions: number, adAttributed: number }>
  loadCoverageDeltas?: () => Promise<Record<string, unknown> | null>
  now?: () => Date
}

export async function getAdLeadAttributionSummary(
  args: Args,
  load: typeof queryOne = queryOne,
): Promise<{ totalSubmissions: number, adAttributed: number }> {
  const window = period(args)
  const conditions = [
    'l.deleted_at IS NULL',
    'l.is_test = false',
    'l.submitted_at >= $1::date',
    "l.submitted_at < $2::date + INTERVAL '1 day'",
  ]
  const values: unknown[] = [window.start, window.end]
  const add = (sql: string, value: unknown) => {
    values.push(value)
    conditions.push(sql.replace('?', `$${values.length}`))
  }
  if (args.platform) add('l.source = ?', args.platform)
  if (args.clientName) add('client.name ILIKE ?', `%${escapeLike(args.clientName)}%`)
  if (args.campaignId) add('l.campaign_id = ?', args.campaignId)
  if (args.campaignName) add(
    `EXISTS (
       SELECT 1 FROM media_spend matched
        WHERE matched.campaign_id = l.campaign_id
          AND matched.campaign_name ILIKE ?
     )`,
    `%${escapeLike(args.campaignName)}%`,
  )
  const row = await load<any>(
    `SELECT COUNT(*)::int AS total_submissions,
            COUNT(*) FILTER (WHERE l.ad_id IS NOT NULL)::int AS ad_attributed
       FROM leads l
       LEFT JOIN agency_clients client ON client.id = l.client_id
      WHERE ${conditions.join(' AND ')}`,
    values,
  )
  return {
    totalSubmissions: Number(row?.total_submissions || 0),
    adAttributed: Number(row?.ad_attributed || 0),
  }
}

function period(args: Args) {
  if (args.startDate && args.endDate) return { start: args.startDate, end: args.endDate }
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return { start: `${year}-${month}-01`, end: now.toISOString().slice(0, 10) }
}

function priorPeriod(window: { start: string, end: string }) {
  const start = Date.parse(`${window.start}T00:00:00Z`)
  const end = Date.parse(`${window.end}T00:00:00Z`)
  const days = Math.round((end - start) / 86_400_000) + 1
  const priorEnd = new Date(start - 86_400_000)
  const priorStart = new Date(priorEnd.getTime() - (days - 1) * 86_400_000)
  return { start: priorStart.toISOString().slice(0, 10), end: priorEnd.toISOString().slice(0, 10) }
}

function parsePolicyIssues(value: unknown): PolicyIssue[] | null {
  if (value == null) return null
  if (Array.isArray(value)) return value as PolicyIssue[]
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as PolicyIssue[] : null
  } catch {
    return null
  }
}

const defaultDeps: AdBreakdownDeps = {
  fetch: async (args) => {
    const window = period(args)
    const conditions: string[] = []
    const values: unknown[] = []
    const push = (sql: string, value: unknown) => { values.push(value); conditions.push(sql.replace('?', `$${values.length}`)) }
    if (args.campaignId) push('ms.campaign_id = ?', args.campaignId)
    if (args.campaignName) push('ms.campaign_name ILIKE ?', `%${escapeLike(args.campaignName)}%`)
    if (args.clientName) push('client.name ILIKE ?', `%${escapeLike(args.clientName)}%`)
    if (args.platform) push('ms.platform = ?', args.platform === 'google' ? 'google_ads' : 'meta')
    const targets = await queryRows<{ id: string }>(
      `SELECT DISTINCT ON (ms.connection_id, ms.campaign_id) ms.id
         FROM media_spend ms
         LEFT JOIN agency_clients client ON client.id = ms.client_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY ms.connection_id, ms.campaign_id, ms.synced_at DESC
        LIMIT 20`,
      values,
    )
    const targetIds = targets.map(target => target.id)
    if (!targetIds.length) return { records: [], targetCount: 0, available: true }
    const existing = await queryRows<{ n: number, diagnostic_n: number }>(
      `SELECT COUNT(DISTINCT aps.media_spend_id)::int AS n,
              COUNT(DISTINCT aps.media_spend_id) FILTER (
                WHERE aps.approval_synced_at >= NOW() - INTERVAL '24 hours'
                  AND (
                    ms.platform = 'google_ads'
                    OR (
                      aps.learning_stage_synced_at >= NOW() - INTERVAL '24 hours'
                      AND aps.ad_set_metrics_synced_at >= NOW() - INTERVAL '24 hours'
                    )
                  )
              )::int AS diagnostic_n
         FROM ad_performance_snapshots aps
         JOIN media_spend ms ON ms.id = aps.media_spend_id
        WHERE aps.media_spend_id = ANY($1) AND aps.range_start = $2 AND aps.range_end = $3`,
      [targetIds, window.start, window.end],
    )
    let available = true
    if (
      args.refresh
      || Number(existing[0]?.n || 0) < targetIds.length
      || Number(existing[0]?.diagnostic_n || 0) < targetIds.length
    ) {
      const syncs = await Promise.all(targetIds.map(id => syncCampaignAdPerformance(id, window.start, window.end)))
      available = syncs.some(sync => sync.available)
    }
    const rows = await queryRows<any>(
      `SELECT aps.*, ms.campaign_id, ms.campaign_name, ms.platform,
              client.name AS client_name, COALESCE(aps.creative_id, cc.creative_id) AS creative_id,
              COALESCE(cc.title, cc.ad_name) AS creative_name,
              COALESCE(leads.lead_count, 0)::int AS lead_count
         FROM ad_performance_snapshots aps
         JOIN media_spend ms ON ms.id = aps.media_spend_id
         LEFT JOIN agency_clients client ON client.id = ms.client_id
         LEFT JOIN LATERAL (
           SELECT creative_id, title, ad_name FROM campaign_creatives
            WHERE media_spend_id = ms.id AND ad_id = aps.ad_id
            ORDER BY synced_at DESC LIMIT 1
         ) cc ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS lead_count FROM leads l
            WHERE l.deleted_at IS NULL AND l.is_test = false AND l.ad_id = aps.ad_id
              AND l.submitted_at >= aps.range_start
              AND l.submitted_at < aps.range_end + INTERVAL '1 day'
         ) leads ON TRUE
        WHERE aps.media_spend_id = ANY($1) AND aps.range_start = $2 AND aps.range_end = $3`,
      [targetIds, window.start, window.end],
    )
    return {
      targetCount: targetIds.length,
      available,
      records: rows.map((row): RawAdRecord => ({
        adId: String(row.ad_id), adName: row.ad_name || null,
        campaignId: String(row.campaign_id), campaignName: row.campaign_name || null,
        clientName: row.client_name || null, platform: String(row.platform).startsWith('google') ? 'google' : 'meta',
        creativeId: row.creative_id || null, creativeName: row.creative_name || null,
        spend: Number(row.spend || 0), impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0),
        conversions: Number(row.conversions || 0), leadCount: Number(row.lead_count || 0), reach: row.reach == null ? null : Number(row.reach),
        frequency: row.frequency == null ? null : Number(row.frequency), firstServedDate: row.first_served_date || null,
        lastServedDate: row.last_served_date || null, lastSyncedAt: row.synced_at || null,
        cpm: row.cpm == null ? null : Number(row.cpm), adSetId: row.ad_set_id || null, adSetName: row.ad_set_name || null,
        adSetMetricsAsOf: row.ad_set_metrics_synced_at || null,
        adSetMetricsUnavailableReason: row.ad_set_metrics_unavailable_reason || null,
        approvalStatus: row.approval_status || null, providerApprovalStatus: row.provider_approval_status || null,
        approvalReviewStatus: row.approval_review_status || null, policyIssues: parsePolicyIssues(row.policy_issues),
        approvalAsOf: row.approval_synced_at || null, approvalUnavailableReason: row.approval_unavailable_reason || null,
        learningStage: row.learning_stage || null, providerLearningStage: row.provider_learning_stage || null,
        learningStageAsOf: row.learning_stage_synced_at || null,
        learningStageUnavailableReason: row.learning_stage_unavailable_reason || null,
      })),
    }
  },
  leadAttribution: async (args) => getAdLeadAttributionSummary(args),
}

const round = (value: number) => Math.round(value * 100) / 100

export async function getAdBreakdown(args: Args, ctx: ToolContext, deps: AdBreakdownDeps = defaultDeps): Promise<ToolResult> {
  try {
    const result = await deps.fetch(args, ctx)
    const currentPeriod = period(args)
    const leadCounts = deps.leadAttribution
      ? await deps.leadAttribution(args, ctx)
      : { totalSubmissions: 0, adAttributed: 0 }
    const leadCoveragePct = leadCounts.totalSubmissions > 0
      ? Math.round((leadCounts.adAttributed / leadCounts.totalSubmissions) * 10_000) / 100
      : null
    const previousPeriod = args.comparePrevious ? priorPeriod(currentPeriod) : null
    const previousResult = previousPeriod
      ? await deps.fetch({ ...args, startDate: previousPeriod.start, endDate: previousPeriod.end, comparePrevious: false, refresh: false }, ctx)
      : null
    const priorByAd = new Map((previousResult?.records ?? []).map(row => [row.adId, row]))
    const today = (deps.now?.() ?? new Date()).getTime()
    const ads = result.records.map(row => {
      const ageDays = row.firstServedDate ? Math.max(0, Math.floor((today - Date.parse(`${row.firstServedDate}T00:00:00Z`)) / 86_400_000)) : null
      const ctr = row.impressions > 0 ? row.clicks / row.impressions : null
      const cpc = row.clicks > 0 ? round(row.spend / row.clicks) : null
      const cpl = row.leadCount > 0 ? round(row.spend / row.leadCount) : null
      const prior = priorByAd.get(row.adId)
      const priorCtr = prior && prior.impressions > 0 ? prior.clicks / prior.impressions : null
      const ctrDeltaPct = ctr != null && priorCtr ? round(((ctr - priorCtr) / priorCtr) * 100) : null
      const frequencyDelta = row.frequency != null && prior?.frequency != null ? round(row.frequency - prior.frequency) : null
      const fatigueSignals = [
        ...(row.frequency != null && row.frequency > 3.5 ? ['high_frequency'] : []),
        ...(ageDays != null && ageDays > 60 ? ['creative_older_than_60_days'] : []),
        ...(leadCoveragePct != null && row.spend > 0 && row.leadCount === 0 ? ['spend_without_leads'] : []),
        ...(row.frequency != null && row.frequency > 3.5 && ctrDeltaPct != null && ctrDeltaPct < -25 ? ['frequency_high_ctr_down'] : []),
      ]
      const approvalUnavailableReason = row.approvalUnavailableReason
        || (!row.approvalAsOf
          ? 'Approval metadata has not been collected for this ad.'
          : !row.approvalStatus ? 'The provider returned no approval status for this ad.' : null)
      const learningSupported = row.platform === 'meta' && row.adSetId != null
      const learningStageUnavailableReason = row.learningStageUnavailableReason
        || (row.platform === 'google'
          ? 'Google Ads does not expose Meta ad-set learning stages.'
          : !row.adSetId
            ? 'No Meta ad-set identity was collected for this ad.'
            : !row.learningStageAsOf ? 'Learning-stage metadata has not been collected for this ad set.' : null)
      const adSetMetricsUnavailableReason = row.adSetMetricsUnavailableReason
        || (row.platform === 'google'
          ? 'Google Ads does not expose Meta ad-set frequency and CPM.'
          : !row.adSetMetricsAsOf ? 'Meta ad-set frequency and CPM have not been collected.' : null)
      return {
        ...row,
        conversions: null,
        ctr,
        cpc,
        costPerLead: cpl,
        ageDays,
        fatigueSignals,
        metricsAsOf: row.lastSyncedAt,
        approvalDataStatus: row.approvalStatus == null
          ? 'unavailable'
          : diagnosticDataStatus({ supported: true, asOf: row.approvalAsOf, unavailableReason: approvalUnavailableReason, now: deps.now?.() }),
        approvalUnavailableReason,
        learningStageDataStatus: diagnosticDataStatus({ supported: learningSupported, asOf: row.learningStageAsOf, unavailableReason: learningStageUnavailableReason, now: deps.now?.() }),
        learningStageUnavailableReason,
        adSetMetricsDataStatus: diagnosticDataStatus({ supported: row.platform === 'meta', asOf: row.adSetMetricsAsOf, unavailableReason: adSetMetricsUnavailableReason, now: deps.now?.() }),
        adSetMetricsUnavailableReason,
        ...(prior ? { comparison: { frequencyDelta, ctrDeltaPct, spendDelta: round(row.spend - prior.spend), leadDelta: row.leadCount - prior.leadCount } } : {}),
      }
    })
    const metric = (row: any) => args.sortBy === 'leads' ? row.leadCount : args.sortBy === 'cpl' ? row.costPerLead : args.sortBy === 'age' ? row.ageDays : row[args.sortBy]
    ads.sort((a, b) => {
      const av = metric(a), bv = metric(b)
      if (av == null) return 1
      if (bv == null) return -1
      return args.sortBy === 'cpc' || args.sortBy === 'cpl' ? av - bv : bv - av
    })
    const page = paginateWithCursor(ads, args.cursor, args.limit)
    const withFrequency = ads.filter(ad => ad.frequency != null).length
    const health = buildDataHealth({ configured: result.targetCount > 0, available: result.available, expected: ads.length, withData: withFrequency })
    const freshness = buildSyncFreshness(ads.map(ad => ad.lastSyncedAt), { now: deps.now?.() })
    const coverageDelta = await (deps.loadCoverageDeltas ?? getSpendCoverageDeltas)().catch(() => null)
    // P-02: untrusted data ⇒ say so and return no figures; keep the coverage universe visible (P-13).
    const halt = evaluateHalt(freshness, {
      haltAfterHours: PACING_HALT_HOURS,
      now: deps.now?.(),
      coverageDelta: coverageDelta as Record<string, { deltaPct?: number | null, staleBaseline?: boolean }> | null,
      platform: args.platform ?? null,
    })
    if (halt.halted) {
      return ok({
        period: currentPeriod,
        source: 'meta_marketing_api/google_ads_api',
        halted: true,
        haltReason: halt.haltReason,
        haltDetail: halt.haltDetail,
        asOf: halt.asOf,
        ...(coverageDelta ? { coverageDelta } : {}),
        ...health,
        coverageField: 'frequency',
        targetCampaignLimit: 20,
        ads: [],
        total: 0,
        appliedLimit: args.limit ?? 20,
        nextCursor: null,
        more: 0,
        truncatedAtSource: false,
      })
    }
    return ok({
      period: currentPeriod,
      ...(previousPeriod ? { previousPeriod } : {}),
      source: 'meta_marketing_api/google_ads_api',
      halted: false,
      ...freshness,
      ...(coverageDelta ? { coverageDelta } : {}),
      ...health,
      coverageField: 'frequency',
      conversionMetric: {
        dataStatus: 'unavailable',
        definition: 'suppressed_pending_historical_resync',
        note: 'Provider conversion totals are hidden until historical rows are resynced with non-overlapping lead/purchase semantics.',
      },
      leadAttribution: {
        ...leadCounts,
        unattributed: Math.max(0, leadCounts.totalSubmissions - leadCounts.adAttributed),
        coveragePct: leadCoveragePct,
        definition: 'submitted_non_test_leads',
        fatigueSignalPolicy: leadCoveragePct == null
          ? 'spend_without_leads_suppressed_until_attribution_coverage_exists'
          : 'spend_without_leads_enabled',
      },
      targetCampaignLimit: 20,
      ads: page.items,
      total: page.total,
      appliedLimit: args.limit ?? 20,
      nextCursor: page.nextCursor,
      more: page.more,
      truncatedAtSource: page.truncatedAtSource,
    })
  } catch {
    return fail('Could not load ad-level performance for the requested campaign window.')
  }
}

export const adBreakdownTool: AiTool<Args> = {
  name: 'get_ad_breakdown',
  description: 'Ad-level delivery, approval/policy, and creative-fatigue evidence for a campaign or client and date window: ad/creative/ad-set IDs, spend, impressions, Meta ad-set frequency/CPM and learning state, Google/Meta approval status and policy issues, CTR, CPC, attributed submitted leads/CPL, delivery dates, creative age, and fatigue signals. Each diagnostic family has its own asOf/dataStatus/unavailableReason; absent never means healthy. `spend_without_leads` is suppressed until real non-test lead attribution coverage exists, and provider conversions remain null pending historical resync. Supports cursor pagination and performs a bounded read-through platform sync when rows are missing.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  returnsUntrusted: true,
  handler: (args, ctx) => getAdBreakdown(args, ctx),
}
