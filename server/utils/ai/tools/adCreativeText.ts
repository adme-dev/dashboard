import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { readCreativeText, findScopedUnsyncedCreatives } from '../marketing/creativeReads'
import { resolveMarketingReadScope, requireMarketingReadPermission, requireOwnerRefresh, clientScopeSql } from '../marketing/readScope'
import type { AiTool } from '../toolRegistry'
import { escapeLike, fail, ok, type ToolContext, type ToolResult } from '../toolContext'

export const AD_CREATIVE_TEXT_CAP = 500

const params = z.object({
  clientId: z.string().uuid().optional(),
  campaignId: z.string().trim().min(1).max(128).optional(),
  campaignName: z.string().trim().min(2).max(200).optional(),
  platform: z.enum(['meta', 'google']),
}).superRefine((value, issue) => {
  if (!value.clientId && !value.campaignId && !value.campaignName) {
    issue.addIssue({ code: 'custom', message: 'Provide clientId, campaignId, or campaignName.' })
  }
})
export type AdCreativeTextArgs = z.infer<typeof params>
type Args = AdCreativeTextArgs

/** Match natural-language campaign phrases against provider names that commonly use `_`/`-` separators. */
export function campaignNameLikePattern(value: string): string {
  const tokens = value.trim().split(/\s+/).filter(Boolean).map(escapeLike)
  return `%${tokens.join('%')}%`
}

export type AdCreativeTextRow = {
  ad_id: string | null
  ad_name: string | null
  creative_id: string
  title: string | null
  body: string | null
  campaign_id: string | null
  campaign_name: string | null
  platform: string
  effective_status: string | null
  last_served_date: string | null
  synced_at: string | null
}

export type AdCreativeTextDeps = {
  load: (args: Args, ctx: ToolContext) => Promise<AdCreativeTextRow[]>
  /** media_spend ids in scope that have no campaign_creatives rows yet (bounded by CREATIVE_SYNC_TARGET_CAP). */
  findUnsynced: (args: Args, ctx: ToolContext) => Promise<string[]>
  /** Read-through provider fetch for one media_spend row. */
  syncCreatives: (mediaSpendId: string, ctx: ToolContext) => Promise<{ syncedRows: number, error: string | null }>
}

/** Read-through sync fan-out cap per call; declared in the `sync` block of the response. */
export const CREATIVE_SYNC_TARGET_CAP = 20

const defaultDeps: AdCreativeTextDeps = {
  load: async (args, ctx) => readCreativeText(await resolveMarketingReadScope(ctx), args),
  findUnsynced: async (args, ctx) => findScopedUnsyncedCreatives(await resolveMarketingReadScope(ctx), args),
  syncCreatives: async (mediaSpendId, ctx) => {
    const scope = await requireOwnerRefresh(ctx)
    const params: unknown[] = [mediaSpendId]
    const predicate = clientScopeSql(scope, 'ms.client_id', params)
    if (!await queryOneFresh(`SELECT ms.id FROM media_spend ms WHERE ms.id = $1 AND ${predicate}`, params)) throw new Error('Campaign not found')
    const { syncCampaignCreatives } = await import('~~/server/utils/onDemandSync')
    const result = await syncCampaignCreatives(mediaSpendId)
    return { syncedRows: result.syncedRows, error: result.error ?? null }
  },
}

export async function getAdCreativeText(args: Args, ctx: ToolContext, deps: AdCreativeTextDeps = defaultDeps): Promise<ToolResult> {
  try {
    // Ordinary staff read persisted creative copy; only a verified writable owner may fill gaps.
    const scope = await resolveMarketingReadScope(ctx)
    requireMarketingReadPermission(scope, 'creatives')
    const unsynced = scope.ownerRefreshAllowed ? await deps.findUnsynced(args, ctx) : []
    const syncResults = await Promise.all(unsynced.map(async (id) => {
      try {
        return await deps.syncCreatives(id, ctx)
      } catch (err) {
        return { syncedRows: 0, error: err instanceof Error ? err.message : String(err) }
      }
    }))
    const syncErrors = [...new Set(syncResults.map(r => r.error).filter((e): e is string => !!e))]
    const sync = {
      attempted: unsynced.length,
      succeeded: syncResults.filter(r => r.syncedRows > 0).length,
      failed: syncResults.filter(r => r.syncedRows === 0).length,
      targetCap: CREATIVE_SYNC_TARGET_CAP,
      errors: syncErrors.slice(0, 3),
    }
    const rows = await deps.load(args, ctx)
    const truncated = rows.length > AD_CREATIVE_TEXT_CAP
    const visible = truncated ? rows.slice(0, AD_CREATIVE_TEXT_CAP) : rows
    return ok({
      source: 'provider_synced_campaign_creatives',
      ads: visible.map(row => ({
        adId: row.ad_id || row.creative_id,
        adName: row.ad_name,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        platform: row.platform === 'google_ads' ? 'google' : 'meta',
        effectiveStatus: row.effective_status,
        creativeId: row.creative_id,
        headlines: row.title ? [row.title] : [],
        primaryTexts: args.platform === 'meta' && row.body ? [row.body] : [],
        descriptions: args.platform === 'google' && row.body ? [row.body] : [],
        callToAction: null,
        linkUrl: null,
        lastServedDate: row.last_served_date,
        lastSyncedAt: row.synced_at,
      })),
      returned: visible.length,
      total: truncated ? null : visible.length,
      limit: AD_CREATIVE_TEXT_CAP,
      moreAtLeast: truncated ? 1 : 0,
      truncated,
      sync,
      coverageNote: !scope.ownerRefreshAllowed
        ? 'Only stored creative rows are represented. Missing campaigns require an authorized sync.'
        : truncated
        ? 'The source cap was reached; narrow by campaignId before running an offer-expiry sweep.'
        : sync.failed > 0
          ? `Creatives for ${sync.failed} campaign(s) in scope could not be fetched from the provider${syncErrors.length ? ` (${syncErrors.slice(0, 3).join('; ')})` : ''}; rows for those campaigns are absent, not empty.`
          : 'All creative rows currently synced for the selected scope are included.',
    })
  } catch {
    return fail('Could not load live ad creative text.', 'AD_CREATIVE_TEXT_FAILED')
  }
}

export const adCreativeTextTool: AiTool<Args> = {
  name: 'get_ad_creative_text',
  description: 'Return provider-synced headline and body copy for Meta or Google ads, scoped by client or campaign. Use for offer-expiry, disclaimer, spelling, and claim-review sweeps; this is live advertising copy, not migrated Monday artwork. Returns ad/campaign/creative identities, delivery dates, sync timestamp, explicit arrays for headlines/primary text/descriptions, and declared truncation at 500 rows. Read-only; narrow by campaignId if truncated.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  returnsUntrusted: true,
  handler: (args, ctx) => getAdCreativeText(args, ctx),
}
