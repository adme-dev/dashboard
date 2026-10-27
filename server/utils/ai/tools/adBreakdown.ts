import { z } from 'zod'
import { syncCampaignAdPerformance } from '~~/server/utils/onDemandSync'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { buildDataHealth, buildSyncFreshness, paginateWithCursor, evaluateHalt, PACING_HALT_HOURS } from './responseContract'
import { resolveMarketingReadScope, requireMarketingReadPermission, loadMarketingCoverageDelta } from '../marketing/readScope'
import { resolveScopedClient } from '../marketing/clientReads'
import { readLeadAttribution } from '../marketing/campaignReads'
import { readAdSnapshots, selectScopedAdTargets, type SnapshotCoverage } from '../marketing/adReads'
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
export type AdBreakdownArgs = z.infer<typeof params>
type Args = AdBreakdownArgs

export type RawAdRecord = {
  clientId?: string | null
  connectionId?: string | null
  accountLeadAttribution?: { status: string; leadCount: number | null; cpl: number | null; reason?: string }
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
  leadCount: number | null
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
  fetch: (args: Args, ctx: ToolContext) => Promise<{ records: RawAdRecord[], targetCount: number, available: boolean, snapshotCoverage?: SnapshotCoverage, truncatedAtSource?: boolean }>
  leadAttribution?: (args: Args, ctx: ToolContext) => Promise<{ totalSubmissions: number, adAttributed: number }>
  loadCoverageDeltas?: (ctx: ToolContext) => Promise<Record<string, unknown> | null>
  now?: () => Date
}

export async function getAdLeadAttributionSummary(args: Args, ctx: ToolContext) {
  const scope = await resolveMarketingReadScope(ctx)
  const window = period(args)
  const clientId = !scope.ownerVerified && args.clientName ? (await resolveScopedClient(scope, args.clientName))?.id : undefined
  if (!scope.ownerVerified && args.clientName && !clientId) throw new Error('Client not found')
  return readLeadAttribution(scope, { ...args, clientId, startDate: window.start, endDate: window.end })
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
  fetch: async (args, ctx) => {
    const scope = await resolveMarketingReadScope(ctx)
    requireMarketingReadPermission(scope, 'ads')
    if (args.refresh && !scope.ownerRefreshAllowed) throw new Error('MARKETING_REFRESH_REQUIRES_REVIEW')
    const window = period(args)
    const { targets, truncatedAtSource } = await selectScopedAdTargets(scope, args)
    let evidence = await readAdSnapshots(scope, targets, window.start, window.end)
    if (scope.ownerRefreshAllowed && (args.refresh || evidence.snapshotCoverage.missingTargetCount > 0 || evidence.rows.some(row => !row.approval_synced_at || Date.parse(row.approval_synced_at) < Date.now() - 86400000))) {
      // Targets came from the scoped relation; recheck membership immediately before dispatch.
      const authorized = await selectScopedAdTargets(scope, args)
      const ids = new Set(authorized.targets.map(t => t.mediaSpendId))
      await Promise.all(targets.filter(t => t.mediaSpendId && ids.has(t.mediaSpendId)).map(t => syncCampaignAdPerformance(t.mediaSpendId!, window.start, window.end)))
      evidence = await readAdSnapshots(scope, targets, window.start, window.end)
    }
    const rows = evidence.rows
    return {
      targetCount: targets.length, available: evidence.snapshotCoverage.missingTargetCount === 0,
      snapshotCoverage: evidence.snapshotCoverage, truncatedAtSource,
      records: rows.map((row): RawAdRecord => ({
        clientId: row.client_id, connectionId: row.connection_id,
        accountLeadAttribution: row.account_ambiguous ? { status: 'ambiguous', leadCount: null, cpl: null, reason: 'multiple_accounts_match_lead_identity' } : { status: 'available', leadCount: Number(row.lead_count || 0), cpl: Number(row.lead_count) > 0 ? Number(row.spend) / Number(row.lead_count) : null },
        adId: String(row.ad_id), adName: row.ad_name || null,
        campaignId: String(row.campaign_id), campaignName: row.campaign_name || null,
        clientName: row.client_name || null, platform: String(row.platform).startsWith('google') ? 'google' : 'meta',
        creativeId: row.creative_id || null, creativeName: row.creative_name || null,
        spend: Number(row.spend || 0), impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0),
        conversions: Number(row.conversions || 0), leadCount: row.account_ambiguous ? null : Number(row.lead_count || 0), reach: row.reach == null ? null : Number(row.reach),
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
  leadAttribution: async (args, ctx) => getAdLeadAttributionSummary(args, ctx),
}

const round = (value: number) => Math.round(value * 100) / 100

export async function getAdBreakdown(args: Args, ctx: ToolContext, deps: AdBreakdownDeps = defaultDeps): Promise<ToolResult> {
  try {
    const scope = await resolveMarketingReadScope(ctx)
    requireMarketingReadPermission(scope, 'ads')
    if (args.refresh && !scope.ownerRefreshAllowed) return fail('Refreshing requires a reviewed owner operation.', 'MARKETING_REFRESH_REQUIRES_REVIEW')
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
    const snapshotCoverage = { current: { ...result.snapshotCoverage, truncatedAtSource: Boolean(result.truncatedAtSource) }, ...(previousResult ? { prior: { ...previousResult.snapshotCoverage, truncatedAtSource: Boolean(previousResult.truncatedAtSource) } } : {}) }
    const truncatedAtSource = Boolean(result.truncatedAtSource || previousResult?.truncatedAtSource)
    const missingWindow = result.snapshotCoverage?.missingTargetCount ? 'current' : previousResult?.snapshotCoverage?.missingTargetCount ? 'prior' : null
    if (missingWindow) return ok({ period: currentPeriod, previousPeriod, halted: true, haltReason: 'missing_campaign_snapshots', haltDetail: `Stored evidence is missing for the ${missingWindow} window.`, affectedWindow: missingWindow, snapshotCoverage, truncatedAtSource, ads: [], total: 0, more: 0, nextCursor: null, appliedLimit: args.limit, coverageDeltaStatus: 'unavailable_for_client_scope' })
    const adKey = (row: RawAdRecord) => JSON.stringify([row.clientId ?? row.clientName, row.platform, row.connectionId, row.campaignId, row.adId])
    const priorByAd = new Map((previousResult?.records ?? []).map(row => [adKey(row), row]))
    const today = (deps.now?.() ?? new Date()).getTime()
    const ads = result.records.map(row => {
      const ageDays = row.firstServedDate ? Math.max(0, Math.floor((today - Date.parse(`${row.firstServedDate}T00:00:00Z`)) / 86_400_000)) : null
      const ctr = row.impressions > 0 ? row.clicks / row.impressions : null
      const cpc = row.clicks > 0 ? round(row.spend / row.clicks) : null
      const cpl = row.leadCount != null && row.leadCount > 0 ? round(row.spend / row.leadCount) : null
      const prior = priorByAd.get(adKey(row))
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
        fatigueSignals: row.accountLeadAttribution?.status === 'ambiguous' ? [] : fatigueSignals,
        metricsAsOf: row.lastSyncedAt,
        approvalDataStatus: row.approvalStatus == null
          ? 'unavailable'
          : diagnosticDataStatus({ supported: true, asOf: row.approvalAsOf, unavailableReason: approvalUnavailableReason, now: deps.now?.() }),
        approvalUnavailableReason,
        learningStageDataStatus: diagnosticDataStatus({ supported: learningSupported, asOf: row.learningStageAsOf, unavailableReason: learningStageUnavailableReason, now: deps.now?.() }),
        learningStageUnavailableReason,
        adSetMetricsDataStatus: diagnosticDataStatus({ supported: row.platform === 'meta', asOf: row.adSetMetricsAsOf, unavailableReason: adSetMetricsUnavailableReason, now: deps.now?.() }),
        adSetMetricsUnavailableReason,
        ...(prior ? { comparison: { frequencyDelta, ctrDeltaPct, spendDelta: round(row.spend - prior.spend), leadDelta: row.leadCount == null || prior.leadCount == null ? null : row.leadCount - prior.leadCount } } : {}),
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
    const coverageDelta = await (deps.loadCoverageDeltas ? deps.loadCoverageDeltas(ctx) : loadMarketingCoverageDelta(scope)).catch(() => null)
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
        source: 'stored_ad_performance_snapshots',
        snapshotCoverage,
        coverageDeltaStatus: scope.ownerVerified && scope.clientIds === null ? 'owner_global_available' : 'unavailable_for_client_scope',
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
        truncatedAtSource,
      })
    }
    return ok({
      period: currentPeriod,
      ...(previousPeriod ? { previousPeriod } : {}),
      source: 'stored_ad_performance_snapshots',
        snapshotCoverage,
        coverageDeltaStatus: scope.ownerVerified && scope.clientIds === null ? 'owner_global_available' : 'unavailable_for_client_scope',
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
      truncatedAtSource: truncatedAtSource || page.truncatedAtSource,
    })
  } catch {
    return fail('Could not load ad-level performance for the requested campaign window.')
  }
}

export const adBreakdownTool: AiTool<Args> = {
  name: 'get_ad_breakdown',
  description: 'Ad-level delivery, approval/policy, and creative-fatigue evidence for a campaign or client and date window: ad/creative/ad-set IDs, spend, impressions, Meta ad-set frequency/CPM and learning state, Google/Meta approval status and policy issues, CTR, CPC, attributed submitted leads/CPL, delivery dates, creative age, and fatigue signals. Each diagnostic family has its own asOf/dataStatus/unavailableReason; absent never means healthy. `spend_without_leads` is suppressed until real non-test lead attribution coverage exists, and provider conversions remain null pending historical resync. Supports cursor pagination. Ordinary staff read stored evidence only; missing campaign windows halt without figures. A verified owner may refresh authorized campaigns.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  returnsUntrusted: true,
  handler: (args, ctx) => getAdBreakdown(args, ctx),
}
