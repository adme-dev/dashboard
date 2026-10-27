import { createHash } from 'node:crypto'
import { createError, getRouterParam, setResponseHeader, type H3Event } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { readBoundedBannerObjectBody } from './boundedObjectBody'
import { withDissectionAuthority } from './dissectionJobs'
import { dissectionIngestionSchema, dissectionSourceSchema } from '../../../shared/bannerDissectionIngestion'
import {
  dissectionDeliverySchema, scopedDissectionAssetSchema, scopedDissectionAssetKey,
  scopedDissectionAssetLocator, parseScopedDissectionAssetLocator,
  MAX_SCOPED_DISSECTION_ASSET_BYTES, type ScopedDissectionAsset
} from '../../../shared/bannerDissectionDelivery'

interface StoredObject {
  size: number
  httpMetadata?: { contentType?: string }
  body?: ReadableStream<Uint8Array> | null
}
interface ScopedBucket {
  get(key: string): Promise<StoredObject | null>
  put?(key: string, bytes: Uint8Array, options: { httpMetadata: { contentType: string, cacheControl: string } }): Promise<unknown>
}
interface AssetRow {
  id: string
  r2_key: string
  uploaded_by: string
  client_id: string | null
  mime_type: string
  file_size: number
  url: string
}
function missing(): never {
  throw createError({ statusCode: 404, statusMessage: 'Dissection asset not found' })
}
function unavailable(): never {
  throw createError({ statusCode: 503, statusMessage: 'Dissection asset delivery unavailable' })
}
function bucketFor(event: H3Event): ScopedBucket {
  // No runtime config, ambient credentials, public URL or filesystem fallback.
  const bucket = (event.context as { cloudflare?: { env?: { MEDIA_BUCKET?: ScopedBucket } } }).cloudflare?.env?.MEDIA_BUCKET
  if (!bucket || typeof bucket.get !== 'function') unavailable()
  return bucket
}
function pngSignature(bytes: Uint8Array): boolean {
  return [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
}
async function readVerified(bucket: ScopedBucket, entry: ScopedDissectionAsset): Promise<Uint8Array> {
  let object: StoredObject | null
  try {
    object = await bucket.get(entry.key)
  } catch {
    unavailable()
  }
  if (!object) missing()
  if (!object.body || object.size !== entry.byteLength || object.httpMetadata?.contentType !== 'image/png') {
    void object.body?.cancel().catch(() => {})
    unavailable()
  }
  let bytes: Uint8Array
  try {
    bytes = await readBoundedBannerObjectBody(object.body, entry.byteLength, MAX_SCOPED_DISSECTION_ASSET_BYTES)
    if (!pngSignature(bytes) || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) unavailable()
  } catch { unavailable() }
  return bytes
}

async function authoritySnapshot(actorId: string, ref: { jobId: string, assetId: string }) {
  if (!actorId) missing() // withDissectionAuthority permits executor inference; this API never does.
  try {
    const snapshot = await withDissectionAuthority(ref.jobId, actorId, 'read', async (db, row) => {
      if (row.user_id !== actorId || row.job_id !== ref.jobId) missing()
      const source = dissectionSourceSchema.safeParse(row.manifest?.source)
      const ingestion = dissectionIngestionSchema.safeParse(row.manifest?.ingestion)
      const registry = dissectionDeliverySchema.safeParse(row.manifest?.delivery)
      if (!source.success || !ingestion.success || !registry.success || ingestion.data.owner.kind === 'user'
        || ingestion.data.owner.userId !== actorId) missing()
      const entry = registry.data.assets[ref.assetId]
      if (!entry || entry.key !== scopedDissectionAssetKey(ref.jobId, entry.attemptId, ref.assetId)) missing()
      const { rows: [asset] } = await db.query<AssetRow>(
        `SELECT id, r2_key, uploaded_by, client_id, mime_type, file_size, url
         FROM banner_assets WHERE id = $1 FOR SHARE`, [ref.assetId])
      if (!asset || asset.id !== ref.assetId || asset.uploaded_by !== actorId
        || asset.client_id !== ingestion.data.owner.clientId || asset.r2_key !== entry.key
        || asset.mime_type !== entry.mimeType || asset.file_size !== entry.byteLength
        || asset.url !== scopedDissectionAssetLocator(ref.jobId, ref.assetId)) missing()
      // Project/client/session/source and historical generation identity are frozen;
      // unrelated progress or a later attempt must not revoke registered output.
      return { entry, source: source.data, ingestion: ingestion.data, asset }
    })
    if (!snapshot) missing()
    return snapshot
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error && [400, 403, 404, 503].includes(Number(error.statusCode))) throw error
    unavailable()
  }
}

/** Exact canonical locator only. Caller metadata never participates in authority. */
export async function resolveScopedDissectionAsset(event: H3Event, actorId: string, locator: string): Promise<{
  bytes: Uint8Array
  mimeType: 'image/png'
  jobId: string
  sourceSha256: string
}> {
  const ref = parseScopedDissectionAssetLocator(locator)
  if (!ref) missing()
  const before = await authoritySnapshot(actorId, ref)
  const bytes = await readVerified(bucketFor(event), before.entry)
  const after = await authoritySnapshot(actorId, ref)
  if (JSON.stringify(before) !== JSON.stringify(after)) missing()
  return { bytes, mimeType: 'image/png', jobId: ref.jobId, sourceSha256: after.source.sha256 }
}

export async function deliverScopedDissectionAsset(event: H3Event, headOnly = false): Promise<Response> {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const actor = await requireAuth(event)
  const jobId = getRouterParam(event, 'jobId') || ''
  const assetId = getRouterParam(event, 'assetId') || ''
  // Construct without normalization so encoded/uppercase aliases cannot grant access.
  const result = await resolveScopedDissectionAsset(event, actor.id, `/api/agency/banner-studio/dissect/${jobId}/assets/${assetId}`)
  // Both methods read/hash/re-authorize; conditional/range headers never shortcut.
  return new Response(headOnly ? null : new Uint8Array(result.bytes), { status: 200, headers: {
    'Content-Type': result.mimeType, 'Content-Length': String(result.bytes.byteLength),
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin'
  } })
}

/** Storage primitive for the server pipeline. The caller must authorize before
 * calling, then atomically register row+entry under fresh execute authority.
 * Never retry/delete here after ambiguous storage or DB acknowledgements.
 */
export async function uploadScopedDissectionAsset(event: H3Event, input: {
  jobId: string
  attemptId: string
  assetId: string
  bytes: Uint8Array
}): Promise<{ key: string, url: string, size: number, assetId: string, mimeType: 'image/png', sha256: string }> {
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength > MAX_SCOPED_DISSECTION_ASSET_BYTES
    || !pngSignature(input.bytes)) unavailable()
  const key = scopedDissectionAssetKey(input.jobId, input.attemptId, input.assetId)
  const entry = scopedDissectionAssetSchema.parse({ assetId: input.assetId, attemptId: input.attemptId, key,
    mimeType: 'image/png', byteLength: input.bytes.byteLength, sha256: createHash('sha256').update(input.bytes).digest('hex') })
  const bucket = bucketFor(event)
  if (typeof bucket.put !== 'function') unavailable()
  try {
    await bucket.put(key, input.bytes, { httpMetadata: { contentType: 'image/png', cacheControl: 'private, no-store' } })
  } catch {
    unavailable()
  }
  await readVerified(bucket, entry)
  return { key, url: scopedDissectionAssetLocator(input.jobId, input.assetId), size: entry.byteLength,
    assetId: input.assetId, mimeType: entry.mimeType, sha256: entry.sha256 }
}
