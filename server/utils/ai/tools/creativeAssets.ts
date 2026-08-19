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
  source: 'banner_studio' | 'ad_platform' | 'monday'
  linkedAdIds: string[]
  linkedCampaignIds: string[]
  clientName: string | null
  campaignName: string | null
  assetUrl?: string | null
  creativeType?: string | null
  firstSeenAt?: string | null
  sourceItemName?: string | null
  provenance?: {
    sourceSystem: 'monday'
    sourceItemId: string
    sourceAssetId: string
    sourceCreatedAt: string | null
    migratedAt: string | null
    creatorId: string | null
    creatorName: string | null
  }
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

function ratioFromFilename(filename: string | null) {
  const match = filename?.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i)
  return match ? ratioFor(match[1], match[2]) : null
}

function creativeTypeFromFilename(filename: string | null) {
  const extension = filename?.split('.').pop()?.toLowerCase()
  if (['mp4', 'mov', 'webm', 'm4v'].includes(extension || '')) return 'video'
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(extension || '')) return 'audio'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension || '')) return 'image'
  return extension || null
}

export async function fetchMondayCreativeAssets(
  args: Pick<Args, 'campaignId' | 'campaignName' | 'clientName' | 'limit'>,
  load: (sql: string, values?: unknown[]) => Promise<any[]> = queryRows,
): Promise<CreativeAssetRecord[]> {
  // Monday files can be tied truthfully to migrated tasks/clients, but not to an
  // ad-platform campaign ID. Do not broaden a campaign-ID lookup to every file
  // belonging to the client.
  if (args.campaignId) return []

  const where = ["mim.status = 'completed'", 'mim.task_id IS NOT NULL']
  const values: unknown[] = []
  const add = (sql: string, value: unknown) => {
    values.push(value)
    where.push(sql.replace('?', `$${values.length}`))
  }
  if (args.campaignName) add('mim.monday_item_name ILIKE ?', `%${escapeLike(args.campaignName)}%`)
  if (args.clientName) add('client.name ILIKE ?', `%${escapeLike(args.clientName)}%`)

  const rows = await load(
    `SELECT mim.monday_item_id, mim.monday_item_name,
            file->>'assetId' AS monday_asset_id,
            file->>'name' AS monday_file_name,
            file->>'createdBy' AS monday_creator_id,
            CASE WHEN file->>'createdAt' ~ '^\\d+$'
                 THEN TO_TIMESTAMP((file->>'createdAt')::double precision / 1000.0)
                 ELSE NULL END AS source_created_at,
            creator.monday_creator_name,
            mim.updated_at AS migrated_at,
            client.name AS client_name
       FROM monday_item_mappings mim
       JOIN tasks task ON task.id = mim.task_id
       JOIN projects project ON project.id = task.project_id
       LEFT JOIN agency_clients client ON client.id = project.client_id
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(mim.column_values->'files'->'files') = 'array'
              THEN mim.column_values->'files'->'files'
              ELSE '[]'::jsonb END
       ) file
       LEFT JOIN LATERAL (
         SELECT update.monday_creator_name
           FROM monday_update_mappings update
          WHERE update.item_mapping_id = mim.id
            AND update.monday_creator_id = file->>'createdBy'
            AND NULLIF(TRIM(update.monday_creator_name), '') IS NOT NULL
          ORDER BY update.created_at DESC
          LIMIT 1
       ) creator ON TRUE
      WHERE ${where.join(' AND ')}
      ORDER BY source_created_at DESC NULLS LAST, mim.updated_at DESC
      LIMIT 1000`,
    values,
  )

  return rows.map((row): CreativeAssetRecord => {
    const filename = row.monday_file_name ? String(row.monday_file_name) : null
    const sourceCreatedAt = row.source_created_at ? String(row.source_created_at) : null
    const creatorId = row.monday_creator_id ? String(row.monday_creator_id) : null
    const creatorName = row.monday_creator_name ? String(row.monday_creator_name) : null
    const sourceAssetId = String(row.monday_asset_id || `${row.monday_item_id}:${filename || 'file'}`)
    return {
      assetId: `monday:${sourceAssetId}`,
      filename,
      ratio: ratioFromFilename(filename),
      deliveredAt: sourceCreatedAt,
      deliveredBy: creatorName || (creatorId ? `Monday user ${creatorId}` : null),
      source: 'monday',
      linkedAdIds: [],
      linkedCampaignIds: [],
      clientName: row.client_name ? String(row.client_name) : null,
      campaignName: null,
      assetUrl: null,
      creativeType: creativeTypeFromFilename(filename),
      firstSeenAt: sourceCreatedAt,
      sourceItemName: row.monday_item_name ? String(row.monday_item_name) : null,
      provenance: {
        sourceSystem: 'monday',
        sourceItemId: String(row.monday_item_id),
        sourceAssetId,
        sourceCreatedAt,
        migratedAt: row.migrated_at ? String(row.migrated_at) : null,
        creatorId,
        creatorName,
      },
    }
  })
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
    const platformAssets = rows.map((row): CreativeAssetRecord => ({
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
    const mondayAssets = await fetchMondayCreativeAssets(args)
    return [...platformAssets, ...mondayAssets].sort((a, b) => {
      const aTime = Date.parse(a.deliveredAt || a.firstSeenAt || '') || 0
      const bTime = Date.parse(b.deliveredAt || b.firstSeenAt || '') || 0
      return bTime - aTime
    })
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
      provenanceNote: 'Banner Studio rows use publish time/designer. Monday rows use the stored file creation time/creator and include migration provenance, but linkedCampaignIds remain empty unless an explicit ad-platform link exists. Platform firstSeenAt is observation time, not artwork build time.',
    })
  } catch {
    return fail('Could not load the creative asset registry.')
  }
}

export const creativeAssetsTool: AiTool<Args> = {
  name: 'get_creative_assets',
  description: 'Resolve running campaign/ad creatives to XeroFlow Banner Studio, migrated Monday, and ad-platform assets with provenance. Monday files retain source item, file creation/creator, and migration timestamp; they are never assigned a campaign ID without an explicit link. Returns explicit partial coverage when a platform creative has no build provenance, and never presents sync time as artwork build time. Filter by campaign ID/name or client and paginate with cursor.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  handler: (args, ctx) => getCreativeAssets(args, ctx),
}
