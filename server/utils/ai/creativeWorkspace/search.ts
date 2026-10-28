import { z } from 'zod'
import { queryRowsFresh } from '~~/server/utils/db'
import { resolveMarketingReadScope, clientScopeSql, type MarketingReadScope } from '../marketing/readScope'
import { escapeLike, type ToolContext } from '../toolContext'
import { CREATIVE_WORKSPACE_SOURCES, type CreativeWorkspaceSource } from './catalog'

export const CreativeWorkspaceSearchParams = z.object({
  query: z.string().trim().max(160).default(''),
  sources: z.array(z.enum(CREATIVE_WORKSPACE_SOURCES)).min(1).max(5).default([...CREATIVE_WORKSPACE_SOURCES]),
  clientId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(30),
}).strict()
export type CreativeWorkspaceSearchArgs = z.infer<typeof CreativeWorkspaceSearchParams>
export interface CreativeWorkspaceMetadata {
  ref: string
  source: CreativeWorkspaceSource
  id: string
  name: string
  clientId: string | null
  type: string
  updatedAt: string | null
}
interface MetadataRow { id: string; name: string | null; client_id: string | null; asset_type: string | null; updated_at: string | Date | null }
export interface CreativeWorkspaceReadDeps {
  resolveScope: (ctx: ToolContext) => Promise<MarketingReadScope>
  query: <T>(sql: string, params: unknown[]) => Promise<T[]>
}
const defaults: CreativeWorkspaceReadDeps = { resolveScope: resolveMarketingReadScope, query: queryRowsFresh }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Scope is supplied only by the trusted resolver, never by tool arguments. */
export async function resolveCreativeWorkspaceScope(ctx: ToolContext, deps: CreativeWorkspaceReadDeps = defaults): Promise<MarketingReadScope> {
  const scope = await deps.resolveScope(ctx)
  if (!UUID.test(scope.actorUserId) || scope.actorUserId !== ctx.userId || (!scope.ownerVerified && !scope.permissionGroups.includes('CREATIVE'))) {
    throw Object.assign(new Error('Creative workspace access required.'), { statusCode: 403 })
  }
  if (scope.clientIds !== null && scope.clientIds.some(id => !UUID.test(id))) throw new Error('Creative scope unavailable.')
  return scope
}

const SOURCES: Record<CreativeWorkspaceSource, { alias: string; select: string; from: string; name: string; updated: string; extra?: string[] }> = {
  banner_assets: {
    alias: 'ba', select: `ba.id, ba.name, ba.client_id, ba.mime_type AS asset_type, ba.created_at AS updated_at`,
    from: 'banner_assets ba', name: 'ba.name', updated: 'ba.created_at',
    extra: ["ba.r2_key NOT LIKE 'scoped-dissection-assets/%'", "ba.r2_key NOT LIKE 'scoped-banner-exports/%'", "ba.url NOT LIKE '/api/agency/banner-studio/dissect/%'"],
  },
  banner_projects: {
    alias: 'bp', select: `bp.id, bp.name, bp.client_id, 'banner_project'::text AS asset_type, bp.updated_at`,
    from: 'banner_projects bp', name: 'bp.name', updated: 'bp.updated_at',
    extra: ["bp.canvas_data::text !~* '(dissectionSource|scoped-dissection-assets|scoped-banner-exports|banner-studio/dissect)'"],
  },
  audio_assets: {
    alias: 'aa', select: `aa.id, aa.title AS name, aa.client_id, 'audio'::text AS asset_type, aa.updated_at`,
    from: 'audio_assets aa', name: 'aa.title', updated: 'aa.updated_at',
  },
  video_assets: {
    alias: 'va', select: `va.id, va.title AS name, va.client_id, 'video'::text AS asset_type, va.updated_at`,
    from: 'video_assets va LEFT JOIN media_projects mp ON mp.id = va.source_project_id', name: 'va.title', updated: 'va.updated_at',
  },
  edm_templates: {
    alias: 'et', select: `et.id, et.name, et.client_id, 'email_template'::text AS asset_type, et.updated_at`,
    from: 'edm_templates et', name: 'et.name', updated: 'et.updated_at',
  },
}

function project(source: CreativeWorkspaceSource, row: MetadataRow): CreativeWorkspaceMetadata {
  if (!UUID.test(row.id) || (row.client_id !== null && !UUID.test(row.client_id))) throw new Error('Invalid workspace metadata.')
  const date = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  if (date !== null && (!date || !Number.isFinite(Date.parse(date)))) throw new Error('Invalid workspace revision.')
  return {
    ref: `${source}:${row.id}`, source, id: row.id,
    name: typeof row.name === 'string' ? row.name.slice(0, 255) : 'Untitled',
    clientId: row.client_id,
    type: typeof row.asset_type === 'string' ? row.asset_type.slice(0, 100) : source,
    updatedAt: date,
  }
}

export async function searchCreativeWorkspace(raw: unknown, ctx: ToolContext, deps: CreativeWorkspaceReadDeps = defaults) {
  const args = CreativeWorkspaceSearchParams.parse(raw)
  const scope = await resolveCreativeWorkspaceScope(ctx, deps)
  const requested = args.clientId
  const narrowed = requested
    ? { ...scope, clientIds: scope.clientIds === null || scope.clientIds.includes(requested) ? [requested] : [] }
    : scope
  if (narrowed.clientIds?.length === 0) return { items: [], limit: args.limit, truncated: false, scopeLimited: true }
  const sources = [...new Set(args.sources)]
  const batches = await Promise.all(sources.map(async source => {
    const spec = SOURCES[source]
    const params: unknown[] = []
    const conditions = [`(${clientScopeSql(narrowed, `${spec.alias}.client_id`, params)})`, ...(spec.extra || [])]
    // Preserve the existing video library's creator/project-creator visibility in addition to client scope.
    if (source === 'video_assets' && !scope.ownerVerified && !scope.permissionGroups.includes('ADMIN')) {
      params.push(scope.actorUserId)
      conditions.push(`(va.created_by = $${params.length}::uuid OR mp.created_by = $${params.length}::uuid)`)
    }
    if (args.query) {
      params.push(`%${escapeLike(args.query)}%`)
      conditions.push(`COALESCE(${spec.name}, '') ILIKE $${params.length}`)
    }
    params.push(args.limit + 1)
    const rows = await deps.query<MetadataRow>(`SELECT ${spec.select} FROM ${spec.from} WHERE ${conditions.join(' AND ')} ORDER BY ${spec.updated} DESC NULLS LAST, ${spec.alias}.id ASC LIMIT $${params.length}`, params)
    if (!Array.isArray(rows) || rows.length > args.limit + 1) throw new Error('Unbounded workspace result.')
    return rows.map(row => project(source, row))
  }))
  const merged = batches.flat().sort((a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id))
  return { items: merged.slice(0, args.limit), limit: args.limit, truncated: merged.length > args.limit, scopeLimited: narrowed.clientIds !== null }
}
