import { z } from 'zod'
import { getSpendCoverageDeltas } from '~~/server/utils/spendSyncJobs'
import { queryOne } from '~~/server/utils/db'
// Use Nitro's global $fetch (auto-imported), NOT raw ofetch — it resolves relative internal routes
// on the Cloudflare runtime; raw ofetch throws on a relative URL (no origin base). See #129.
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { aiInternalFetch } from '../internalFetch'
import { buildDataHealth, buildSyncFreshness, paginateWithCursor, evaluateHalt, PACING_HALT_HOURS } from './responseContract'
import { diagnosticDataStatus, sanitizeDiagnosticError } from '~~/server/utils/adDiagnostics'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const params = z.object({
  clientName: z.string().optional(),
  platform: z.enum(['meta', 'google']).optional(),
  status: z.enum(['active', 'paused', 'ended', 'inactive', 'unknown', 'all']).default('all'),
  sortBy: z.enum(['spend', 'roas', 'cpc', 'leads', 'cpl', 'frequency']).default('spend'),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  comparePrevious: z.boolean().default(false),
  refresh: z.boolean().default(false),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).superRefine((value, issue) => {
  if (Boolean(value.startDate) !== Boolean(value.endDate)) {
    issue.addIssue({ code: 'custom', message: 'startDate and endDate must be supplied together.' })
  }
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    issue.addIssue({ code: 'custom', message: 'startDate must be on or before endDate.' })
  }
})
type Args = z.infer<typeof params>

export type CampaignEffectiveStatus = 'active' | 'paused' | 'ended' | 'inactive' | 'unknown'

/** One campaign's model-readable delivery and efficiency data for the requested period. */
export type BreakdownCampaign = {
  campaignId: string | null
  /** media_spend row UUID (latest-synced row for the campaign) — the id budget-allocation write tools take. */
  mediaSpendId: string | null
  campaignName: string
  campaignType?: string | null
  clientName: string
  platform: 'meta' | 'google'
  spend: number
  roas: number | null
  cpc: number | null
  impressions: number
  clicks: number
  conversions: number | null
  leadCount: number
  costPerLead: number | null
  frequency: number | null
  campaignStatus: string | null
  effectiveStatus: CampaignEffectiveStatus
  firstServedDate: string | null
  lastServedDate: string | null
  endDate: string | null
  lastSyncedAt: string | null
  servingStatus?: string | null
  servingStatusReasons?: string[]
  providerServingStatusReasons?: string[]
  servingStatusAsOf?: string | null
  servingStatusUnavailableReason?: string | null
  impressionShare?: { share: number | null, lostBudget: number | null, lostRank: number | null, asOf: string } | null
  impressionShareAsOf?: string | null
  impressionShareUnavailableReason?: string | null
  comparison?: {
    spendDelta: number
    spendDeltaPct: number | null
    leadDelta: number
    leadDeltaPct: number | null
    cpcDelta: number | null
    cpcDeltaPct: number | null
  }
  comparisonStatus?: 'available' | 'no_baseline'
}

type BreakdownResult = { campaigns: BreakdownCampaign[], total: number }
export type CampaignBreakdownQuery = {
  platform?: 'meta' | 'google'
  clientName?: string
  startDate: string
  endDate: string
}

export type LeadAttributionSummary = {
  totalSubmissions: number
  campaignAttributed: number
  adAttributed: number
}

export type CampaignBreakdownDeps = {
  loadCoverageDeltas?: () => Promise<Record<string, unknown> | null>

  breakdown: (ctx: ToolContext, query: CampaignBreakdownQuery) => Promise<BreakdownResult>
  leadAttribution?: (ctx: ToolContext, query: CampaignBreakdownQuery) => Promise<LeadAttributionSummary>
  refreshDiagnostics?: (mediaSpendIds: string[]) => Promise<Array<{ available: boolean, error: string | null }>>
  now?: () => Date
}

export async function getLeadAttributionSummary(
  request: CampaignBreakdownQuery,
  load: typeof queryOne = queryOne,
): Promise<LeadAttributionSummary> {
  const conditions = [
    'l.deleted_at IS NULL',
    'l.is_test = false',
    'l.submitted_at >= $1::date',
    "l.submitted_at < $2::date + INTERVAL '1 day'",
  ]
  const values: unknown[] = [request.startDate, request.endDate]
  if (request.platform) {
    values.push(request.platform)
    conditions.push(`l.source = $${values.length}`)
  }
  if (request.clientName) {
    values.push(`%${escapeLike(request.clientName)}%`)
    conditions.push(`client.name ILIKE $${values.length}`)
  }
  const row = await load<any>(
    `SELECT COUNT(*)::int AS total_submissions,
            COUNT(*) FILTER (WHERE l.campaign_id IS NOT NULL)::int AS campaign_attributed,
            COUNT(*) FILTER (WHERE l.ad_id IS NOT NULL)::int AS ad_attributed
       FROM leads l
       LEFT JOIN agency_clients client ON client.id = l.client_id
      WHERE ${conditions.join(' AND ')}`,
    values,
  )
  return {
    totalSubmissions: Number(row?.total_submissions || 0),
    campaignAttributed: Number(row?.campaign_attributed || 0),
    adAttributed: Number(row?.ad_attributed || 0),
  }
}

const PLATFORM_QUERY: Record<'meta' | 'google', string> = { meta: 'meta', google: 'google_ads,google' }

function normaliseStatus(rawStatus: unknown, endDate: string | null): CampaignEffectiveStatus {
  if (endDate && endDate < new Date().toISOString().slice(0, 10)) return 'ended'
  const raw = String(rawStatus ?? '').trim().toUpperCase()
  if (raw === 'ACTIVE' || raw === 'ENABLED') return 'active'
  if (raw === 'PAUSED') return 'paused'
  if (['DELETED', 'ARCHIVED', 'REMOVED', 'DISABLED'].includes(raw)) return 'inactive'
  return 'unknown'
}

function mapCampaign(it: any): BreakdownCampaign {
  const rawPlatform = String(it?.platform ?? '')
  const platform: 'meta' | 'google' = rawPlatform.startsWith('google') ? 'google' : 'meta'
  const endDate = it?.endDate ? String(it.endDate) : null
  const impressionShareAsOf = it?.impressionShareAsOf ? String(it.impressionShareAsOf) : null
  const impressionValues = [it?.impressionShare, it?.lostImpressionShareBudget, it?.lostImpressionShareRank]
  const hasImpressionShare = impressionValues.some(value => value != null)
  return {
    campaignId: it?.campaignId == null ? null : String(it.campaignId),
    mediaSpendId: it?.mediaSpendId == null ? null : String(it.mediaSpendId),
    campaignName: String(it?.campaignName ?? 'Unknown'),
    campaignType: it?.campaignType == null ? null : String(it.campaignType).toUpperCase(),
    clientName: String(it?.clientName ?? 'Unassigned'),
    platform,
    spend: Number(it?.spend ?? 0),
    roas: it?.roas == null ? null : Number(it.roas),
    cpc: it?.cpc == null ? null : Number(it.cpc),
    impressions: Number(it?.impressions ?? 0),
    clicks: Number(it?.clicks ?? 0),
    conversions: null,
    leadCount: Number(it?.leadCount ?? 0),
    costPerLead: it?.costPerLead == null ? null : Number(it.costPerLead),
    frequency: it?.frequency == null ? null : Number(it.frequency),
    campaignStatus: it?.campaignStatus == null ? null : String(it.campaignStatus),
    effectiveStatus: normaliseStatus(it?.campaignStatus, endDate),
    firstServedDate: it?.firstServedDate ? String(it.firstServedDate) : null,
    lastServedDate: it?.lastServedDate ? String(it.lastServedDate) : null,
    endDate,
    lastSyncedAt: it?.lastSynced ? String(it.lastSynced) : null,
    servingStatus: it?.servingStatus == null ? null : String(it.servingStatus),
    servingStatusReasons: Array.isArray(it?.servingStatusReasons) ? it.servingStatusReasons.map(String) : [],
    providerServingStatusReasons: Array.isArray(it?.providerServingStatusReasons) ? it.providerServingStatusReasons.map(String) : [],
    servingStatusAsOf: it?.servingStatusAsOf ? String(it.servingStatusAsOf) : null,
    servingStatusUnavailableReason: it?.servingStatusUnavailableReason == null ? null : String(it.servingStatusUnavailableReason),
    impressionShare: hasImpressionShare && impressionShareAsOf ? {
      share: it?.impressionShare == null ? null : Number(it.impressionShare),
      lostBudget: it?.lostImpressionShareBudget == null ? null : Number(it.lostImpressionShareBudget),
      lostRank: it?.lostImpressionShareRank == null ? null : Number(it.lostImpressionShareRank),
      asOf: impressionShareAsOf,
    } : null,
    impressionShareAsOf,
    impressionShareUnavailableReason: it?.impressionShareUnavailableReason == null ? null : String(it.impressionShareUnavailableReason),
  }
}

const defaultDeps: CampaignBreakdownDeps = {
  breakdown: async (ctx, request) => {
    const campaigns: BreakdownCampaign[] = []
    let total = 0
    let offset = 0
    const limit = 200

    while (true) {
      const query: Record<string, unknown> = {
        startDate: request.startDate,
        endDate: request.endDate,
        sortBy: 'spend',
        sortDir: 'desc',
        showInactive: 'true',
        limit,
        offset,
      }
      if (request.platform) query.platform = PLATFORM_QUERY[request.platform]
      const r: any = await aiInternalFetch('/api/agency/analytics/campaigns', {
        query,
      }, ctx)
      const items: any[] = Array.isArray(r?.campaigns) ? r.campaigns : []
      campaigns.push(...items.map(mapCampaign))
      total = Number(r?.total ?? campaigns.length)
      offset += items.length
      if (items.length === 0 || offset >= total) break
    }

    return { campaigns, total }
  },
  leadAttribution: async (_ctx, request) => getLeadAttributionSummary(request),
  refreshDiagnostics: async (mediaSpendIds) => {
    const { syncCampaignDeliveryDiagnostics } = await import('~~/server/utils/onDemandSync')
    return await Promise.all(mediaSpendIds.map(async (id) => {
      const result = await syncCampaignDeliveryDiagnostics(id)
      return { available: result.available, error: result.error }
    }))
  },
}

function defaultPeriod() {
  const now = new Date()
  const format = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return { start: format(new Date(now.getFullYear(), now.getMonth(), 1)), end: format(now) }
}

function previousPeriod(start: string, end: string) {
  const startTime = Date.parse(`${start}T00:00:00Z`)
  const endTime = Date.parse(`${end}T00:00:00Z`)
  const durationDays = Math.round((endTime - startTime) / 86_400_000) + 1
  const previousEnd = new Date(startTime - 86_400_000)
  const previousStart = new Date(previousEnd.getTime() - (durationDays - 1) * 86_400_000)
  return {
    start: previousStart.toISOString().slice(0, 10),
    end: previousEnd.toISOString().slice(0, 10),
  }
}

function campaignKey(row: BreakdownCampaign) {
  return `${row.platform}|${row.clientName.toLowerCase()}|${row.campaignId || row.campaignName.toLowerCase()}`
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function withComparison(current: BreakdownCampaign[], previous: BreakdownCampaign[]) {
  const prior = new Map(previous.map(row => [campaignKey(row), row]))
  return current.map(row => {
    const old = prior.get(campaignKey(row))
    if (!old) return { ...row, comparisonStatus: 'no_baseline' as const }
    const priorSpend = old.spend
    const priorLeads = old.leadCount
    const cpcDelta = row.cpc != null && old?.cpc != null ? round(row.cpc - old.cpc) : null
    return {
      ...row,
      comparisonStatus: 'available' as const,
      comparison: {
        spendDelta: round(row.spend - priorSpend),
        spendDeltaPct: priorSpend > 0 ? round(((row.spend - priorSpend) / priorSpend) * 100) : null,
        leadDelta: row.leadCount - priorLeads,
        leadDeltaPct: priorLeads > 0 ? round(((row.leadCount - priorLeads) / priorLeads) * 100) : null,
        cpcDelta,
        cpcDeltaPct: cpcDelta != null && old?.cpc ? round((cpcDelta / old.cpc) * 100) : null,
      },
    }
  })
}

function metric(row: BreakdownCampaign, sortBy: Args['sortBy']) {
  if (sortBy === 'leads') return row.leadCount
  if (sortBy === 'cpl') return row.costPerLead
  return row[sortBy]
}

function sortCampaigns(rows: BreakdownCampaign[], sortBy: Args['sortBy']): BreakdownCampaign[] {
  const asc = sortBy === 'cpc' || sortBy === 'cpl'
  return [...rows].sort((a, b) => {
    const av = metric(a, sortBy)
    const bv = metric(b, sortBy)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return asc ? av - bv : bv - av
  })
}

export async function getCampaignBreakdown(args: Args, ctx: ToolContext, deps: CampaignBreakdownDeps = defaultDeps): Promise<ToolResult> {
  try {
    const sortBy = args.sortBy ?? 'spend'
    const period = args.startDate && args.endDate
      ? { start: args.startDate, end: args.endDate }
      : defaultPeriod()
    const request = { platform: args.platform, clientName: args.clientName, startDate: period.start, endDate: period.end }
    let current = await deps.breakdown(ctx, request)
    const requestedClient = args.clientName?.trim().toLowerCase()
    const refreshTargets = current.campaigns
      .filter(row => {
        if (!row.mediaSpendId) return false
        if (args.platform && row.platform !== args.platform) return false
        if (requestedClient && !row.clientName.toLowerCase().includes(requestedClient)) return false
        if (args.status && args.status !== 'all' && row.effectiveStatus !== args.status) return false
        return args.refresh
          || row.servingStatusAsOf == null
          || (row.platform === 'google' && row.impressionShareAsOf == null)
      })
      .slice(0, 20)
      .map(row => row.mediaSpendId as string)
    const diagnosticRefreshResults = deps.refreshDiagnostics && refreshTargets.length
      ? await deps.refreshDiagnostics(refreshTargets)
      : []
    if (diagnosticRefreshResults.length) current = await deps.breakdown(ctx, request)
    const leadCounts = deps.leadAttribution ? await deps.leadAttribution(ctx, request) : null
    const priorPeriod = args.comparePrevious ? previousPeriod(period.start, period.end) : null
    const prior = priorPeriod
      ? await deps.breakdown(ctx, { platform: args.platform, startDate: priorPeriod.start, endDate: priorPeriod.end })
      : null
    const comparisonStatus = prior
      ? (prior.campaigns.length > 0 ? 'available' : 'no_baseline')
      : undefined
    const compared = prior?.campaigns.length
      ? withComparison(current.campaigns, prior.campaigns)
      : current.campaigns.map(row => prior ? { ...row, comparisonStatus: 'no_baseline' as const } : row)
    const all = compared.map((row) => {
      const servingUnavailableReason = row.servingStatusUnavailableReason
        || (!row.servingStatusAsOf ? 'Serving diagnostics have not been collected for this campaign.' : null)
      const servingStatusDataStatus = row.servingStatus == null
        ? 'unavailable' as const
        : diagnosticDataStatus({ supported: true, asOf: row.servingStatusAsOf ?? null, unavailableReason: servingUnavailableReason, now: deps.now?.() })
      const impressionShareSupported = row.platform === 'google' && ['SEARCH', 'SHOPPING'].includes(row.campaignType || '')
      const impressionShareUnavailableReason = row.impressionShareUnavailableReason
        || (!impressionShareSupported
          ? 'Search impression share is not supported for this platform or campaign type.'
          : !row.impressionShareAsOf
            ? 'Google impression-share diagnostics have not been collected for this campaign.'
            : !row.impressionShare ? 'Google Ads returned no impression-share figures for this campaign window.' : null)
      const impressionShareDataStatus = !impressionShareSupported
        ? 'unsupported' as const
        : !row.impressionShare
          ? 'unavailable' as const
          : diagnosticDataStatus({ supported: true, asOf: row.impressionShareAsOf ?? null, unavailableReason: impressionShareUnavailableReason, now: deps.now?.() })
      return {
        ...row,
        conversions: null,
        // Some Google campaign resources can return metric-shaped values outside
        // the campaign types whose impression-share contract we support. Keep the
        // block absent for those types rather than implying comparable evidence.
        impressionShare: impressionShareSupported ? row.impressionShare : null,
        servingStatusDataStatus,
        servingStatusUnavailableReason: servingUnavailableReason,
        impressionShareDataStatus,
        impressionShareUnavailableReason,
      }
    })

    const nameNeedle = args.clientName?.trim().toLowerCase()
    const filtered = all.filter((campaign) => {
      if (args.platform && campaign.platform !== args.platform) return false
      if (nameNeedle && !campaign.clientName.toLowerCase().includes(nameNeedle)) return false
      if (args.status && args.status !== 'all' && campaign.effectiveStatus !== args.status) return false
      return true
    })
    const coverageDelta = await (deps.loadCoverageDeltas ?? getSpendCoverageDeltas)().catch(() => null)
    const page = paginateWithCursor(sortCampaigns(filtered, sortBy), args.cursor, args.limit)
    const note = (sortBy !== 'spend' && current.total > current.campaigns.length)
      ? `Ranked by ${sortBy} over the ${current.campaigns.length} highest-spend campaigns (of ${current.total}); lower-spend campaigns are not included in this ranking.`
      : undefined
    const freshness = buildSyncFreshness(current.campaigns.map(row => row.lastSyncedAt), { now: deps.now?.() })
    const health = buildDataHealth({ configured: true, expected: current.total, withData: current.campaigns.length })
    // P-02: untrusted data ⇒ say so and return no figures; keep the coverage universe visible (P-13).
    const halt = evaluateHalt(freshness, {
      haltAfterHours: PACING_HALT_HOURS,
      now: deps.now?.(),
      coverageDelta: coverageDelta as Record<string, { deltaPct?: number | null, staleBaseline?: boolean }> | null,
      platform: args.platform ?? null,
    })
    if (halt.halted) {
      return ok({
        period,
        source: 'synced_campaign_analytics',
        halted: true,
        haltReason: halt.haltReason,
        haltDetail: halt.haltDetail,
        asOf: halt.asOf,
        ...(coverageDelta ? { coverageDelta } : {}),
        ...health,
        campaigns: [],
        total: 0,
        appliedLimit: args.limit ?? 20,
        nextCursor: null,
        more: 0,
        truncatedAtSource: false,
      })
    }
    return ok({
      period,
      ...(priorPeriod ? { previousPeriod: priorPeriod } : {}),
      ...(comparisonStatus ? { comparisonStatus } : {}),
      source: 'synced_campaign_analytics',
      halted: false,
      ...freshness,
      ...(coverageDelta ? { coverageDelta } : {}),
      ...health,
      diagnosticRefresh: {
        attempted: refreshTargets.length,
        succeeded: diagnosticRefreshResults.filter(result => result.available).length,
        failed: diagnosticRefreshResults.filter(result => !result.available).length,
        targetCap: 20,
        errors: [...new Set(diagnosticRefreshResults.map(result => result.error).filter(Boolean))].slice(0, 3),
      },
      conversionMetric: {
        dataStatus: 'unavailable',
        definition: 'suppressed_pending_historical_resync',
        note: 'Provider conversion totals are hidden until historical Meta rows are resynced with non-overlapping lead/purchase semantics.',
      },
      ...(leadCounts ? {
        leadAttribution: {
          ...leadCounts,
          unattributed: Math.max(0, leadCounts.totalSubmissions - leadCounts.campaignAttributed),
          coveragePct: leadCounts.totalSubmissions > 0
            ? Math.round((leadCounts.campaignAttributed / leadCounts.totalSubmissions) * 10_000) / 100
            : null,
          definition: 'submitted_non_test_leads',
        },
      } : {}),
      campaigns: page.items,
      total: page.total,
      appliedLimit: args.limit ?? 20,
      nextCursor: page.nextCursor,
      more: page.more,
      truncatedAtSource: page.truncatedAtSource || current.total > current.campaigns.length,
      ...(note ? { note } : {}),
    })
  } catch (error) {
    console.error('[CampaignBreakdown] Failed to load campaign evidence:', sanitizeDiagnosticError(error))
    return fail('Could not load campaign breakdown — the spend sync may be unavailable or the requested date window is invalid.')
  }
}

export const campaignBreakdownTool: AiTool<Args> = {
  name: 'get_campaign_breakdown',
  description: 'Campaign delivery and performance for a requested date range across Meta and Google: live/effective and provider serving status, normalized plus exact limitation reasons, Google Search impression-share/budget-loss/rank-loss evidence, delivery dates, spend, ROAS, CPC, frequency, submitted leads and CPL. Serving and impression-share families each include their own asOf/dataStatus/unavailableReason, and unsupported campaign types are absent rather than zero-filled. A bounded read-through refreshes missing diagnostics for up to 20 returned campaigns. Provider conversions remain null pending historical resync; pagination, comparison, lead-attribution coverage, and platform-scoped freshness halts retain their existing contracts.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  handler: (a, c) => getCampaignBreakdown(a, c),
}
