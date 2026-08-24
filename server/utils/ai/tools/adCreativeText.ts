import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
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
type Args = z.infer<typeof params>

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
  load: (args: Args) => Promise<AdCreativeTextRow[]>
  /** media_spend ids in scope that have no campaign_creatives rows yet (bounded by CREATIVE_SYNC_TARGET_CAP). */
  findUnsynced: (args: Args) => Promise<string[]>
  /** Read-through provider fetch for one media_spend row. */
  syncCreatives: (mediaSpendId: string) => Promise<{ syncedRows: number, error: string | null }>
}

/** Read-through sync fan-out cap per call; declared in the `sync` block of the response. */
export const CREATIVE_SYNC_TARGET_CAP = 20

function scopeConditions(args: Args): { conditions: string[], values: unknown[] } {
  const conditions = [`ms.platform = $1`]
  const values: unknown[] = [args.platform === 'google' ? 'google_ads' : 'meta']
  const add = (condition: string, value: unknown) => {
    values.push(value)
    conditions.push(condition.replace('?', `$${values.length}`))
  }
  if (args.clientId) add('ms.client_id = ?::uuid', args.clientId)
  if (args.campaignId) add('ms.campaign_id = ?', args.campaignId)
  if (args.campaignName) add(`ms.campaign_name ILIKE ? ESCAPE '\\'`, campaignNameLikePattern(args.campaignName))
  return { conditions, values }
}

const defaultDeps: AdCreativeTextDeps = {
  findUnsynced: async (args) => {
    const { conditions, values } = scopeConditions(args)
    values.push(CREATIVE_SYNC_TARGET_CAP)
    const rows = await queryRows<{ id: string }>(
      `SELECT ms.id
         FROM media_spend ms
        WHERE ${conditions.join(' AND ')}
          AND ms.connection_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM campaign_creatives cc WHERE cc.media_spend_id = ms.id)
        ORDER BY ms.synced_at DESC NULLS LAST
        LIMIT $${values.length}`,
      values
    )
    return rows.map(r => r.id)
  },
  syncCreatives: async (mediaSpendId) => {
    const { syncCampaignCreatives } = await import('~~/server/utils/onDemandSync')
    const result = await syncCampaignCreatives(mediaSpendId)
    return { syncedRows: result.syncedRows, error: result.error ?? null }
  },
  load: async (args) => {
    const { conditions, values } = scopeConditions(args)
    values.push(AD_CREATIVE_TEXT_CAP + 1)
    return await queryRows<AdCreativeTextRow>(
      `SELECT DISTINCT ON (COALESCE(cc.ad_id, cc.creative_id), ms.campaign_id)
              cc.ad_id, cc.ad_name, cc.creative_id, cc.title, cc.body,
              ms.campaign_id, ms.campaign_name, ms.platform,
              aps.effective_status, aps.last_served_date::text,
              GREATEST(cc.synced_at, aps.synced_at)::text AS synced_at
         FROM campaign_creatives cc
         JOIN media_spend ms ON ms.id = cc.media_spend_id
         LEFT JOIN LATERAL (
           SELECT NULL::text AS effective_status, perf.last_served_date, perf.synced_at
             FROM ad_performance_snapshots perf
            WHERE perf.media_spend_id = ms.id
              AND perf.ad_id = COALESCE(cc.ad_id, cc.creative_id)
            ORDER BY perf.synced_at DESC
            LIMIT 1
         ) aps ON TRUE
        WHERE ${conditions.join(' AND ')}
        ORDER BY COALESCE(cc.ad_id, cc.creative_id), ms.campaign_id, cc.synced_at DESC
        LIMIT $${values.length}`,
      values
    )
  }
}

export async function getAdCreativeText(args: Args, _ctx: ToolContext, deps: AdCreativeTextDeps = defaultDeps): Promise<ToolResult> {
  try {
    // Read-through (mirrors get_ad_breakdown): nothing populates campaign_creatives on a schedule, so
    // campaigns in scope with no stored creatives are fetched from the provider before we answer.
    const unsynced = await deps.findUnsynced(args).catch(() => [] as string[])
    const syncResults = await Promise.all(unsynced.map(async (id) => {
      try {
        return await deps.syncCreatives(id)
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
    const rows = await deps.load(args)
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
      coverageNote: truncated
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
