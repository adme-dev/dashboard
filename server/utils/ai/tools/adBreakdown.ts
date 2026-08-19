import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { syncCampaignAdPerformance } from '~~/server/utils/onDemandSync'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { buildDataHealth, buildSyncFreshness, paginateWithCursor } from './responseContract'

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
  firstServedDate: string | null
  lastServedDate: string | null
  lastSyncedAt: string | null
}

export type AdBreakdownDeps = {
  fetch: (args: Args, ctx: ToolContext) => Promise<{ records: RawAdRecord[], targetCount: number, available: boolean }>
  now?: () => Date
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
    const existing = await queryRows<{ n: number }>(
      `SELECT COUNT(DISTINCT media_spend_id)::int AS n FROM ad_performance_snapshots
        WHERE media_spend_id = ANY($1) AND range_start = $2 AND range_end = $3`,
      [targetIds, window.start, window.end],
    )
    let available = true
    if (args.refresh || Number(existing[0]?.n || 0) < targetIds.length) {
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
      })),
    }
  },
}

const round = (value: number) => Math.round(value * 100) / 100

export async function getAdBreakdown(args: Args, ctx: ToolContext, deps: AdBreakdownDeps = defaultDeps): Promise<ToolResult> {
  try {
    const result = await deps.fetch(args, ctx)
    const currentPeriod = period(args)
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
        ...(row.spend > 0 && row.leadCount === 0 ? ['spend_without_leads'] : []),
        ...(row.frequency != null && row.frequency > 3.5 && ctrDeltaPct != null && ctrDeltaPct < -25 ? ['frequency_high_ctr_down'] : []),
      ]
      return { ...row, conversions: null, ctr, cpc, costPerLead: cpl, ageDays, fatigueSignals, ...(prior ? { comparison: { frequencyDelta, ctrDeltaPct, spendDelta: round(row.spend - prior.spend), leadDelta: row.leadCount - prior.leadCount } } : {}) }
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
    return ok({
      period: currentPeriod,
      ...(previousPeriod ? { previousPeriod } : {}),
      source: 'meta_marketing_api/google_ads_api',
      ...freshness,
      ...health,
      coverageField: 'frequency',
      conversionMetric: {
        dataStatus: 'unavailable',
        definition: 'suppressed_pending_historical_resync',
        note: 'Provider conversion totals are hidden until historical rows are resynced with non-overlapping lead/purchase semantics.',
      },
      targetCampaignLimit: 20,
      ads: page.items,
      total: page.total,
      appliedLimit: args.limit ?? 20,
      nextCursor: page.nextCursor,
      more: page.more,
    })
  } catch {
    return fail('Could not load ad-level performance for the requested campaign window.')
  }
}

export const adBreakdownTool: AiTool<Args> = {
  name: 'get_ad_breakdown',
  description: 'Ad-level delivery and creative-fatigue metrics for a campaign or client and date window: ad/creative IDs, spend, impressions, frequency where supported, CTR, CPC, attributed submitted leads/CPL, first/last served date, creative age and fatigue signals. Provider conversions are explicitly null until historical rows are resynced under non-overlapping outcome semantics. Summary freshness includes newest/oldest sync, stale-row count, and threshold. Optional previous-period comparison detects high/rising frequency with CTR decline. Performs a read-through platform sync when missing; Google frequency remains explicitly null.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  handler: (args, ctx) => getAdBreakdown(args, ctx),
}
