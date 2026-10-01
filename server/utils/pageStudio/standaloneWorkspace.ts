import { createError } from 'h3'
import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { getPageStudioDocument } from './documents'
import { listPageStudioAssets } from './siteOperations'
import type { PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import type { StandaloneSiteWorkspace } from '~~/shared/pageStudio/standaloneWorkspace'

const Input = z.object({ siteId: z.string().uuid(), clientId: z.string().uuid(), userId: z.string().uuid(), tokenHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export type StandaloneSiteInput = z.infer<typeof Input>
interface Scope { tenant_id: string, client_id: string, name: string, role: 'editor' | 'viewer' }
interface Dependencies {
  query?: (sql: string, params: unknown[]) => Promise<Scope | null>
  readDocument?: typeof getPageStudioDocument
  readAssets?: typeof listPageStudioAssets
  bucket?: PageStudioCheckpointBucket
}

/** Fresh portal session and exact site membership; identifiers never grant access. */
export async function authorizeStandaloneSite(raw: StandaloneSiteInput, dependencies: Dependencies = {}) {
  const parsed = Input.safeParse(raw)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website request' })
  const input = parsed.data
  const query = dependencies.query ?? ((sql, params) => queryOneFresh<Scope>(sql, params))
  const scope = await query(`SELECT site.tenant_id, site.client_id, site.name, membership.role
    FROM page_studio_sites site
    JOIN agency_clients client ON client.id=site.client_id AND client.is_active=TRUE
    JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id
      AND entitlement.client_id=site.client_id AND entitlement.tenant_id=site.tenant_id
    JOIN page_studio_site_memberships membership ON membership.site_id=site.id
      AND membership.client_id=site.client_id AND membership.tenant_id=site.tenant_id
    JOIN client_users owner ON owner.id=membership.user_id AND owner.client_id=site.client_id AND owner.status='active'
    JOIN client_sessions session ON session.client_user_id=owner.id AND session.token_hash=$4
      AND session.expires_at>clock_timestamp()
    WHERE site.id=$1 AND site.client_id=$2 AND owner.id=$3
      AND site.status IN ('draft','active') AND membership.role IN ('editor','viewer')
      AND entitlement.status IN ('trial','active') AND entitlement.effective_from<=clock_timestamp()
      AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())`,
  [input.siteId, input.clientId, input.userId, input.tokenHash])
  if (!scope || scope.client_id !== input.clientId) throw createError({ statusCode: 404, statusMessage: 'Website not available' })
  return scope
}

export async function readStandaloneSiteWorkspace(input: StandaloneSiteInput, deps: Dependencies = {}): Promise<StandaloneSiteWorkspace> {
  const scope = await authorizeStandaloneSite(input, deps)
  const [document, assets] = await Promise.all([
    (deps.readDocument ?? getPageStudioDocument)(scope.tenant_id, input.siteId, deps.bucket),
    (deps.readAssets ?? listPageStudioAssets)(scope.tenant_id, input.siteId)
  ])
  const current = await authorizeStandaloneSite(input, deps)
  if (current.tenant_id !== scope.tenant_id || document.id !== input.siteId || document.site.id !== input.siteId || document.site.clientId !== input.clientId) {
    throw createError({ statusCode: 503, statusMessage: 'Website changed. Refresh before continuing.' })
  }
  return { canEdit: current.role === 'editor', document, assets: assets.map((asset) => {
    const renditions = Array.isArray(asset.renditions) ? asset.renditions : []
    const original = renditions.find(value => value.kind === 'original') ?? renditions[0]
    return { id: String(asset.id), altText: typeof asset.altText === 'string' ? asset.altText : null,
      mediaType: String(asset.mediaType), publicationStatus: String(asset.publicationStatus),
      previewAvailable: asset.scanStatus === 'clean' && asset.publicationStatus !== 'archived' && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(asset.mediaType)),
      fileName: typeof original?.fileName === 'string' ? original.fileName : null,
      size: typeof original?.size === 'number' ? original.size : null }
  }) }
}
