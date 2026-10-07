import { recheckFormAuthority, type TrustedFormContext } from './formAuthority'
import { createError } from 'h3'
import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { authorizeStandaloneSite, type StandaloneSiteInput } from './standaloneWorkspace'

interface MediaRow { object_key: string, media_type: string, scan_status: string, publication_status: string }
interface MediaObject { body: ReadableStream, size: number }
interface Dependencies {
  authorize?: typeof authorizeStandaloneSite
  query?: (sql: string, params: unknown[]) => Promise<MediaRow | null>
  bucket?: { get?: (key: string) => Promise<MediaObject | null> }
}
const supported = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const notAvailable = () => createError({ statusCode: 404, statusMessage: 'Image preview not available' })

export async function readStandaloneMedia(input: StandaloneSiteInput, assetId: string, deps: Dependencies = {}) {
  const authorize = deps.authorize ?? authorizeStandaloneSite
  return readScopedMedia({ authorize: async () => {
    const current = await authorize(input)
    return { scope: { tenantId: current.tenant_id, clientId: input.clientId, businessId: input.clientId, siteId: input.siteId, environment: 'staging' }, actorId: input.userId, authorityKey: JSON.stringify(['portal', input.userId, input.clientId, input.tokenHash]), canEdit: current.role === 'editor' }
  } }, assetId, deps)
}

export async function readScopedMedia(context: Pick<TrustedFormContext, 'authorize'>, assetId: string, deps: Omit<Dependencies, 'authorize'> = {}) {
  if (!z.string().uuid().safeParse(assetId).success) throw createError({ statusCode: 400, statusMessage: 'Invalid image request' })
  const query = deps.query ?? ((sql, params) => queryOneFresh<MediaRow>(sql, params))
  const before = await context.authorize(false)
  const scope = before.scope
  const prefix = `page-studio/${scope.tenantId}/${scope.clientId}/${scope.siteId}/`
  const readAsset = async () => {
    const asset = await query(`SELECT r2_prefix AS object_key, media_type, scan_status, publication_status
      FROM page_studio_assets WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4`,
    [scope.tenantId, scope.clientId, scope.siteId, assetId])
    if (!asset || asset.scan_status !== 'clean' || asset.publication_status === 'archived'
      || !supported.has(asset.media_type) || !asset.object_key.startsWith(prefix)) throw notAvailable()
    return asset
  }
  const asset = await readAsset()
  await recheckFormAuthority(context, before, false)
  if (!deps.bucket?.get) throw createError({ statusCode: 503, statusMessage: 'Media storage is not connected' })
  const object = await deps.bucket.get(asset.object_key)
  if (!object) throw notAvailable()
  try {
    if (!Number.isSafeInteger(object.size) || object.size < 1 || object.size > 20 * 1024 * 1024) throw notAvailable()
    await recheckFormAuthority(context, before, false)
    const currentAsset = await readAsset()
    await recheckFormAuthority(context, before, false)
    if (currentAsset.object_key !== asset.object_key || currentAsset.media_type !== asset.media_type) throw notAvailable()
    return { body: object.body, size: object.size, mediaType: asset.media_type }
  } catch (error) {
    await object.body.cancel().catch(() => {})
    throw error
  }
}
