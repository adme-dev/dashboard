import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { findCreativeAssetById, type CreativeAssetRecord } from '~~/server/utils/ai/tools/creativeAssets'
import { createSourceAsset } from '~~/server/utils/video-generation/sourceAssetStore'
import { generateStorageKey, uploadFile, type R2BucketBinding } from '~~/server/utils/storage'

const MAX_PROMOTION_BYTES = 100 * 1024 * 1024
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime'
])

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const first = parts[0]!
  const second = parts[1]!
  return first === 10
    || first === 127
    || first === 0
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
}

export function assertSafeCreativeAssetUrl(value: string): URL {
  const url = new URL(value)
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (url.protocol !== 'https:') throw new Error('Creative asset URL must use HTTPS')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Creative asset URL host is not public')
  }
  if (isPrivateIpv4(hostname) || hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:')) {
    throw new Error('Creative asset URL host is private')
  }
  return url
}

async function downloadCreativeAsset(initialUrl: string, fetchImpl: typeof fetch = fetch): Promise<{
  bytes: Buffer
  contentType: string
  finalUrl: string
}> {
  let url = assertSafeCreativeAssetUrl(initialUrl)
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location || redirect === 3) throw new Error('Creative asset redirect could not be resolved safely')
      url = assertSafeCreativeAssetUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok) throw new Error(`Creative asset download failed (${response.status})`)
    const declaredSize = Number(response.headers.get('content-length') || 0)
    if (declaredSize > MAX_PROMOTION_BYTES) throw new Error('Creative asset exceeds the 100 MB promotion limit')
    const contentType = String(response.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase()
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) throw new Error(`Unsupported creative asset content type: ${contentType || 'unknown'}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.length || bytes.length > MAX_PROMOTION_BYTES) throw new Error('Creative asset is empty or exceeds the 100 MB promotion limit')
    return { bytes, contentType, finalUrl: url.toString() }
  }
  throw new Error('Creative asset download failed')
}

export interface PromoteCreativeAssetInput {
  assetId: string
  projectId: string
  tenantId: string
  subjectType: 'vehicle' | 'non_vehicle' | 'unknown'
  expectedSourceSystem: CreativeAssetRecord['source']
  expectedSourceAssetRef: string
}

export async function promoteCreativeAssetToVideoSource(
  input: PromoteCreativeAssetInput,
  ctx: ToolContext,
  deps: {
    resolve?: typeof findCreativeAssetById
    fetchImpl?: typeof fetch
  } = {}
): Promise<{ sourceAssetId: string, status: string, sourceSystem: string, sourceAssetRef: string }> {
  const asset = await (deps.resolve ?? findCreativeAssetById)(input.assetId, ctx)
  if (!asset || !asset.assetUrl) throw new Error('Creative registry asset is unavailable or has no reachable file URL')
  if (asset.source !== input.expectedSourceSystem || asset.assetId !== input.expectedSourceAssetRef) {
    throw new Error('Creative registry provenance changed after proposal; create a new promotion proposal')
  }
  if (asset.clientIds.length > 0 && input.tenantId !== 'agency' && !asset.clientIds.includes(input.tenantId)) {
    throw new Error('Creative registry asset is outside the project client scope')
  }

  const downloaded = await downloadCreativeAsset(asset.assetUrl, deps.fetchImpl)
  const filename = asset.filename?.trim() || `${asset.assetId.replace(/[^a-zA-Z0-9_-]/g, '-')}.${downloaded.contentType.startsWith('video/') ? 'mp4' : 'png'}`
  const category = downloaded.contentType.startsWith('video/') ? 'media-video' : 'media-image'
  const key = generateStorageKey(category, filename, input.projectId)
  const requestBucket = (ctx.event?.context as { cloudflare?: { env?: { MEDIA_BUCKET?: R2BucketBinding } } })
    ?.cloudflare?.env?.MEDIA_BUCKET
  const uploaded = await uploadFile(downloaded.bytes, key, downloaded.contentType, {
    sourceSystem: asset.source,
    sourceAssetRef: asset.assetId,
    promotedBy: ctx.userId,
    projectId: input.projectId
  }, requestBucket)
  const source = await createSourceAsset({
    clientId: input.tenantId === 'agency' ? null : input.tenantId,
    createdBy: ctx.userId,
    r2Key: uploaded.key,
    contentType: downloaded.contentType,
    subjectType: input.subjectType,
    originalFilename: filename,
    sourceSystem: asset.source,
    sourceAssetRef: asset.assetId,
    sourceMetadata: {
      projectId: input.projectId,
      sourceItemName: asset.sourceItemName ?? null,
      clientIds: asset.clientIds,
      clientNames: asset.clientNames,
      provenance: asset.provenance ?? null,
      promotedAt: new Date().toISOString()
    }
  })
  return {
    sourceAssetId: source.id,
    status: source.status,
    sourceSystem: asset.source,
    sourceAssetRef: asset.assetId
  }
}
