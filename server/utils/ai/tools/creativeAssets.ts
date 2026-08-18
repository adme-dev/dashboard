import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { buildDataHealth, paginateWithCursor } from './responseContract'

const params = z.object({
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  clientName: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})
type Args = z.infer<typeof params>

export type CreativeAssetRecord = {
  assetId: string
  filename: string | null
  ratio: string | null
  deliveredAt: string | null
  deliveredBy: string | null
  source: 'banner_studio' | 'ad_platform'
  linkedAdIds: string[]
  linkedCampaignIds: string[]
  clientName: string | null
  campaignName: string | null
  assetUrl?: string | null
  creativeType?: string | null
  firstSeenAt?: string | null
}

export type CreativeAssetsDeps = {
  fetch: (args: Args, ctx: ToolContext) => Promise<CreativeAssetRecord[]>
}

function ratioFor(width: unknown, height: unknown) {
  const w = Number(width)
  const h = Number(height)
  if (!w || !h) return null
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a
  const divisor = gcd(w, h)
  return `${w / divisor}:${h / divisor}`
}

const defaultDeps: CreativeAssetsDeps = {
  fetch: async (args) => {
    const where: string[] = []
    const values: unknown[] = []
    const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)) }
    if (args.campaignId) add('ms.campaign_id = ?', args.campaignId)
    if (args.campaignName) add("ms.campaign_name ILIKE ?", `%${escapeLike(args.campaignName)}%`)
    if (args.clientName) add("client.name ILIKE ?", `%${escapeLike(args.clientName)}%`)
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const rows = await queryRows<any>(
      `SELECT cc.id, cc.creative_id, cc.ad_id, cc.ad_name, cc.creative_type,
              cc.thumbnail_url, cc.first_seen_at, cc.synced_at,
              ms.campaign_id, ms.campaign_name, client.name AS client_name,
              bap.id AS publish_id, bap.published_at, bp.url AS asset_url,
              bp.format_key, bp.width, bp.height, project.name AS project_name,
              member.name AS delivered_by
         FROM campaign_creatives cc
         JOIN media_spend ms ON ms.id = cc.media_spend_id
         LEFT JOIN agency_clients client ON client.id = ms.client_id
         LEFT JOIN banner_ad_publishes bap
           ON (cc.ad_id IS NOT NULL AND bap.ad_id = cc.ad_id)
           OR (cc.creative_id IS NOT NULL AND bap.creative_id = cc.creative_id)
         LEFT JOIN banner_published bp ON bp.id = bap.published_id
         LEFT JOIN banner_projects project ON project.id = bap.project_id
         LEFT JOIN team_members member ON member.id = bap.published_by
         ${clause}
        ORDER BY COALESCE(bap.published_at, cc.first_seen_at) DESC
        LIMIT 1000`,
      values,
    )
    return rows.map((row): CreativeAssetRecord => ({
      assetId: String(row.publish_id || row.id),
      filename: row.project_name && row.format_key ? `${row.project_name}-${row.format_key}` : null,
      ratio: ratioFor(row.width, row.height),
      deliveredAt: row.published_at ? String(row.published_at) : null,
      deliveredBy: row.delivered_by ? String(row.delivered_by) : null,
      source: row.publish_id ? 'banner_studio' : 'ad_platform',
      linkedAdIds: row.ad_id ? [String(row.ad_id)] : [],
      linkedCampaignIds: row.campaign_id ? [String(row.campaign_id)] : [],
      clientName: row.client_name ? String(row.client_name) : null,
      campaignName: row.campaign_name ? String(row.campaign_name) : null,
      assetUrl: row.asset_url || row.thumbnail_url || null,
      creativeType: row.creative_type || null,
      firstSeenAt: row.first_seen_at ? String(row.first_seen_at) : null,
    }))
  },
}

export async function getCreativeAssets(args: Args, ctx: ToolContext, deps: CreativeAssetsDeps = defaultDeps): Promise<ToolResult> {
  try {
    const rows = await deps.fetch(args, ctx)
    const page = paginateWithCursor(rows, args.cursor, args.limit)
    return ok({
      ...buildDataHealth({ configured: rows.length > 0, expected: rows.length, withData: rows.filter(row => row.deliveredAt && row.deliveredBy).length }),
      assets: page.items,
      total: page.total,
      appliedLimit: args.limit ?? 20,
      nextCursor: page.nextCursor,
      more: page.more,
      provenanceNote: 'deliveredAt/deliveredBy are only populated when an ad is linked to a XeroFlow Banner Studio publish; firstSeenAt is platform observation time, not artwork build time.',
    })
  } catch {
    return fail('Could not load the creative asset registry.')
  }
}

export const creativeAssetsTool: AiTool<Args> = {
  name: 'get_creative_assets',
  description: 'Resolve running campaign/ad creatives to XeroFlow assets, delivery timestamp and designer. Returns explicit partial coverage when a platform creative has no Banner Studio provenance, and never presents sync time as artwork build time. Filter by campaign ID/name or client and paginate with cursor.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  handler: (args, ctx) => getCreativeAssets(args, ctx),
}
