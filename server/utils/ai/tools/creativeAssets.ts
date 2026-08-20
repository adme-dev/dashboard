import { queryOne, queryRows } from '~~/server/utils/db'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { buildDataHealth, paginateWithCursor } from './responseContract'

export type CreativeAssetArgs = {
  campaignId?: string
  campaignName?: string
  clientName?: string
  cursor?: string
  limit?: number
}

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
  clientIds: string[]
  clientNames: string[]
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
  fetch: (args: CreativeAssetArgs, ctx: ToolContext) => Promise<CreativeAssetRecord[]>
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
  return null
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    for (const part of String(value ?? '').split(',')) {
      const clean = part.trim()
      const key = clean.toLocaleLowerCase()
      if (!clean || seen.has(key)) continue
      seen.add(key)
      result.push(clean)
    }
  }
  return result
}

function rowArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value]
}

export function isScreenshotAsset(filename: string | null | undefined): boolean {
  const base = String(filename ?? '').trim().toLocaleLowerCase()
  return /^(screen[ _-]?shot|screenshot)\b/.test(base)
    || /^image(?:[ _-]?\(?(?:copy|\d+)\)?)?\.(?:png|jpe?g|gif|webp)$/i.test(base)
}

function clientIdentity(row: any): { clientId: string | null, clientName: string | null, clientIds: string[], clientNames: string[] } {
  const clientIds = uniqueStrings([...rowArray(row.client_ids), row.project_client_id])
  const clientNames = uniqueStrings([...rowArray(row.client_names), row.project_client_name, row.client_name, row.source_client_name])
  return {
    clientId: clientIds.length === 1 ? clientIds[0]! : null,
    clientName: clientNames.length === 1 ? clientNames[0]! : null,
    clientIds,
    clientNames,
  }
}

export async function fetchMondayCreativeAssets(
  args: Pick<CreativeAssetArgs, 'campaignId' | 'campaignName' | 'clientName' | 'limit'>,
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
  if (args.clientName) {
    values.push(`%${escapeLike(args.clientName)}%`)
    where.push(`(client.name ILIKE $${values.length} OR source_client.name ILIKE $${values.length} OR mim.monday_item_name ILIKE $${values.length})`)
  }

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
            client.id::text AS project_client_id,
            client.name AS project_client_name,
            source_client.name AS source_client_name,
            CASE WHEN client.id IS NOT NULL THEN ARRAY[client.id::text]
                 ELSE COALESCE(resolved_clients.ids, ARRAY[]::text[]) END AS client_ids,
            CASE WHEN client.id IS NOT NULL THEN ARRAY[client.name]
                 ELSE COALESCE(resolved_clients.names, ARRAY[]::text[]) END AS client_names,
            COALESCE(attachment.file_url, legacy_file.local_file_url,
                     live_file.source_url, legacy_file.monday_file_url) AS asset_url
       FROM monday_item_mappings mim
       LEFT JOIN tasks task ON task.id = mim.task_id
       LEFT JOIN projects project ON project.id = task.project_id
       LEFT JOIN agency_clients client ON client.id = project.client_id
       LEFT JOIN LATERAL (
         SELECT NULLIF(TRIM(source_column->>'text'), '') AS name
           FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(mim.source_data->'column_values') = 'array'
                  THEN mim.source_data->'column_values'
                  ELSE '[]'::jsonb END
           ) source_column
          WHERE source_column->>'id' = 'client'
          LIMIT 1
       ) source_client ON TRUE
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(DISTINCT resolved.id::text) AS ids,
                ARRAY_AGG(DISTINCT resolved.name) AS names
           FROM regexp_split_to_table(COALESCE(source_client.name, ''), '\\s*,\\s*') label
           JOIN agency_clients resolved ON LOWER(TRIM(resolved.name)) = LOWER(TRIM(label))
       ) resolved_clients ON TRUE
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
       LEFT JOIN LATERAL (
         SELECT mapping.local_file_url, mapping.monday_file_url
           FROM monday_file_mappings mapping
          WHERE mapping.item_mapping_id = mim.id
            AND mapping.monday_asset_id = file->>'assetId'
          ORDER BY mapping.updated_at DESC
          LIMIT 1
       ) legacy_file ON TRUE
       LEFT JOIN monday_sync_file_mappings live_file
         ON live_file.monday_item_id = mim.monday_item_id
        AND live_file.monday_asset_id = file->>'assetId'
       LEFT JOIN task_attachments attachment ON attachment.id = live_file.attachment_id
      WHERE ${where.join(' AND ')}
      ORDER BY source_created_at DESC NULLS LAST, mim.updated_at DESC
      LIMIT 1000`,
    values,
  )

  return rows.filter(row => !isScreenshotAsset(row.monday_file_name)).map((row): CreativeAssetRecord => {
    const filename = row.monday_file_name ? String(row.monday_file_name) : null
    const sourceCreatedAt = row.source_created_at ? String(row.source_created_at) : null
    const creatorId = row.monday_creator_id ? String(row.monday_creator_id) : null
    const creatorName = row.monday_creator_name ? String(row.monday_creator_name) : null
    const sourceAssetId = String(row.monday_asset_id || `${row.monday_item_id}:${filename || 'file'}`)
    const identity = clientIdentity(row)
    return {
      assetId: `monday:${sourceAssetId}`,
      filename,
      ratio: ratioFromFilename(filename),
      deliveredAt: sourceCreatedAt,
      deliveredBy: creatorName || (creatorId ? `Monday user ${creatorId}` : null),
      source: 'monday',
      linkedAdIds: [],
      linkedCampaignIds: [],
      clientName: identity.clientName,
      clientIds: identity.clientIds,
      clientNames: identity.clientNames,
      campaignName: null,
      assetUrl: row.asset_url ? String(row.asset_url) : null,
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

type LiveMondayCandidate = {
  monday_item_id: string
  monday_item_name: string
  migrated_at: string | null
  project_client_id?: string | null
  project_client_name?: string | null
  source_client_name?: string | null
  client_ids?: string[] | null
  client_names?: string[] | null
}

export type LiveMondayCreativeDeps = {
  loadCandidates: (sql: string, values?: unknown[]) => Promise<LiveMondayCandidate[]>
  resolveConnection: () => Promise<{ accessToken: string } | null>
  loadItemAssets: (token: string, itemIds: string[]) => Promise<Array<{
    itemId: string
    itemName: string
    assets: Array<{
      id: string
      name: string
      url: string
      public_url?: string
      created_at?: string
      uploaded_at?: string
      uploaded_by?: string | { id: string, name: string }
    }>
  }>>
}

const defaultLiveMondayDeps: LiveMondayCreativeDeps = {
  loadCandidates: queryRows,
  resolveConnection: async () => {
    const stored = await queryOne<{ access_token: string }>(
      "SELECT access_token FROM integration_configs WHERE integration_type = 'monday' LIMIT 1",
    )
    const accessToken = stored?.access_token || process.env.MONDAY_API_TOKEN
    return accessToken ? { accessToken } : null
  },
  loadItemAssets: async (token, itemIds) => {
    const ids = itemIds.map(id => JSON.stringify(id)).join(',')
    const assetFields = 'id name url public_url created_at uploaded_by { id name }'
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2025-04' },
      body: JSON.stringify({ query: `query { items(ids: [${ids}]) { id name assets { ${assetFields} } updates(limit: 25) { assets { ${assetFields} } } } }` }),
    })
    if (!response.ok) throw new Error(`Monday API request failed (${response.status})`)
    const payload = await response.json() as {
      data?: { items?: Array<{ id: string, name: string, assets?: any[], updates?: Array<{ assets?: any[] }> }> }
      errors?: Array<{ message?: string }>
    }
    if (payload.errors?.length) throw new Error(payload.errors[0]?.message || 'Monday API request failed')
    return (payload.data?.items || []).map(item => {
      const byId = new Map<string, any>()
      for (const asset of [...(item.assets || []), ...(item.updates || []).flatMap(update => update.assets || [])]) {
        byId.set(String(asset.id), asset)
      }
      return { itemId: String(item.id), itemName: String(item.name), assets: [...byId.values()] }
    })
  },
}

/**
 * Enrich the registry from Monday at read time. This path is deliberately
 * bounded and read-only: it starts only from already-governed local item
 * mappings, never downloads files, and never invents campaign/ad linkage.
 */
export async function fetchLiveMondayCreativeAssets(
  args: Pick<CreativeAssetArgs, 'campaignId' | 'campaignName' | 'clientName'>,
  deps: LiveMondayCreativeDeps = defaultLiveMondayDeps,
): Promise<CreativeAssetRecord[]> {
  if (args.campaignId) return []
  const where = ["mim.status = 'completed'", 'mim.task_id IS NOT NULL', "COALESCE(mim.source_state, 'active') = 'active'"]
  const values: unknown[] = []
  let matchedClientJoin = 'LEFT JOIN agency_clients matched_client ON FALSE'
  if (args.campaignName) {
    values.push(`%${escapeLike(args.campaignName)}%`)
    where.push(`mim.monday_item_name ILIKE $${values.length}`)
  }
  if (args.clientName) {
    values.push(`%${escapeLike(args.clientName)}%`)
    where.push(`(client.name ILIKE $${values.length} OR source_client.name ILIKE $${values.length} OR mim.monday_item_name ILIKE $${values.length})`)
    values.push(args.clientName.trim())
    matchedClientJoin = `LEFT JOIN agency_clients matched_client ON LOWER(TRIM(matched_client.name)) = LOWER(TRIM($${values.length}))`
  }
  const candidates = await deps.loadCandidates(
    `SELECT mim.monday_item_id, mim.monday_item_name, mim.updated_at AS migrated_at,
            COALESCE(client.id, matched_client.id)::text AS project_client_id,
            COALESCE(client.name, matched_client.name) AS project_client_name,
            source_client.name AS source_client_name
       FROM monday_item_mappings mim
       LEFT JOIN tasks task ON task.id = mim.task_id
       LEFT JOIN projects project ON project.id = task.project_id
       LEFT JOIN agency_clients client ON client.id = project.client_id
       LEFT JOIN LATERAL (
         SELECT NULLIF(TRIM(source_column->>'text'), '') AS name
           FROM jsonb_array_elements(CASE WHEN jsonb_typeof(mim.source_data->'column_values') = 'array'
             THEN mim.source_data->'column_values' ELSE '[]'::jsonb END) source_column
          WHERE source_column->>'id' = 'client' LIMIT 1
       ) source_client ON TRUE
       ${matchedClientJoin}
      WHERE ${where.join(' AND ')}
      ORDER BY mim.source_updated_at DESC NULLS LAST, mim.updated_at DESC
      LIMIT 25`,
    values,
  )
  if (candidates.length === 0) return []
  const connection = await deps.resolveConnection()
  if (!connection) return []
  const candidateById = new Map<string, LiveMondayCandidate>()
  for (const candidate of candidates) {
    if (!candidateById.has(String(candidate.monday_item_id)) && candidateById.size < 10) {
      candidateById.set(String(candidate.monday_item_id), candidate)
    }
  }
  const itemAssets = await deps.loadItemAssets(connection.accessToken, [...candidateById.keys()])
  const result: CreativeAssetRecord[] = []
  for (const item of itemAssets) {
    const candidate = candidateById.get(String(item.itemId))
    if (!candidate) continue
    const identity = clientIdentity(candidate)
    for (const asset of item.assets) {
      const filename = asset.name ? String(asset.name) : null
      const creativeType = creativeTypeFromFilename(filename)
      if (!creativeType || isScreenshotAsset(filename)) continue
      const sourceCreatedAt = asset.created_at || asset.uploaded_at ? String(asset.created_at || asset.uploaded_at) : null
      const creatorId = asset.uploaded_by
        ? String(typeof asset.uploaded_by === 'object' ? asset.uploaded_by.id : asset.uploaded_by)
        : null
      const creatorName = typeof asset.uploaded_by === 'object' ? asset.uploaded_by.name || null : null
      result.push({
        assetId: `monday:${asset.id}`,
        filename,
        ratio: ratioFromFilename(filename),
        deliveredAt: sourceCreatedAt,
        deliveredBy: creatorName || (creatorId ? `Monday user ${creatorId}` : null),
        source: 'monday',
        linkedAdIds: [],
        linkedCampaignIds: [],
        clientName: identity.clientName,
        clientIds: identity.clientIds,
        clientNames: identity.clientNames,
        campaignName: null,
        assetUrl: asset.public_url || asset.url || null,
        creativeType,
        firstSeenAt: sourceCreatedAt,
        sourceItemName: item.itemName || candidate.monday_item_name,
        provenance: {
          sourceSystem: 'monday',
          sourceItemId: String(item.itemId),
          sourceAssetId: String(asset.id),
          sourceCreatedAt,
          migratedAt: candidate.migrated_at ? String(candidate.migrated_at) : null,
          creatorId,
          creatorName,
        },
      })
    }
  }
  return result
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
    const [rows, mondayAssets, liveMondayAssets] = await Promise.all([
      queryRows<any>(
      `SELECT cc.id, cc.creative_id, cc.ad_id, cc.ad_name, cc.creative_type,
              cc.thumbnail_url, cc.first_seen_at, cc.synced_at,
              ms.campaign_id, ms.campaign_name, client.id AS client_id, client.name AS client_name,
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
      ),
      fetchMondayCreativeAssets(args),
      fetchLiveMondayCreativeAssets(args).catch(() => []),
    ])
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
      clientIds: row.client_id ? [String(row.client_id)] : [],
      clientNames: row.client_name ? [String(row.client_name)] : [],
      campaignName: row.campaign_name ? String(row.campaign_name) : null,
      assetUrl: row.asset_url || row.thumbnail_url || null,
      creativeType: row.creative_type || null,
      firstSeenAt: row.first_seen_at ? String(row.first_seen_at) : null,
    }))
    const byId = new Map<string, CreativeAssetRecord>()
    for (const asset of [...platformAssets, ...mondayAssets, ...liveMondayAssets]) {
      const existing = byId.get(asset.assetId)
      if (!existing || (!existing.assetUrl && asset.assetUrl)) byId.set(asset.assetId, asset)
    }
    return [...byId.values()].sort((a, b) => {
      const aTime = Date.parse(a.deliveredAt || a.firstSeenAt || '') || 0
      const bTime = Date.parse(b.deliveredAt || b.firstSeenAt || '') || 0
      return bTime - aTime
    })
  },
}

/** Resolve a registry identifier through the same governed aggregation used by get_creative_assets. */
export async function findCreativeAssetById(assetId: string, ctx: ToolContext): Promise<CreativeAssetRecord | null> {
  const requested = assetId.trim()
  if (!requested) return null
  const assets = await defaultDeps.fetch({ limit: 1000 }, ctx)
  return assets.find(asset => asset.assetId === requested) ?? null
}

export async function getCreativeAssets(args: CreativeAssetArgs, ctx: ToolContext, deps: CreativeAssetsDeps = defaultDeps): Promise<ToolResult> {
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
      provenanceNote: 'Banner Studio rows use publish time/designer. Monday rows combine stored provenance with a bounded read-only live source lookup, exclude screenshot-like files, expose resolved client IDs/names as arrays, and keep linkedCampaignIds empty unless an explicit ad-platform link exists. Platform firstSeenAt is observation time, not artwork build time.',
    })
  } catch {
    return fail('Could not load the creative asset registry.')
  }
}
