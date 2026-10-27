import { createError, getRouterParam, setResponseHeader, type H3Event } from 'h3'
import { readBoundedBannerObjectBody } from '~~/server/utils/banner/boundedObjectBody'
import { requireAuth } from '~~/server/utils/auth'
import { parseScopedExportProvenance, recheckScopedExport } from '~~/server/utils/banner/scopedExport'
import { resolveDissectionContext } from '~~/server/utils/banner/dissectionAccess'
import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { RASTER_EXPORT_MIME, RASTER_EXPORT_UUID, requireRasterProjectAccess } from '~~/server/utils/banner/exportRendering'
import { BANNER_RENDER_LIMITS } from '#shared/bannerRenderContract'

interface ExportRow {
  id: string
  project_id: string
  r2_key: string
  export_type: keyof typeof RASTER_EXPORT_MIME
  file_size: number
  client_id: string | null
  created_by: string | null
}
interface StoredObject {
  size: number
  httpMetadata?: { contentType?: string }
  httpEtag?: string
  customMetadata?: Record<string, string>
  body?: ReadableStream<Uint8Array>
}
interface ReadBucket {
  get(key: string): Promise<StoredObject | null>
  head(key: string): Promise<StoredObject | null>
}
function missing(): never {
  throw createError({ statusCode: 404, statusMessage: 'Banner export not found' })
}
function unavailable(): never {
  throw createError({ statusCode: 503, statusMessage: 'Banner export delivery is unavailable' })
}

export async function deliverBannerRasterExport(event: H3Event, headOnly = false) {
  if (event.node?.res) setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const rawId = getRouterParam(event, 'id') || ''
  if (!RASTER_EXPORT_UUID.test(rawId)) missing()
  const id = rawId.toLowerCase()
  let row: ExportRow | null
  try {
    // Never use a cached project scope or trust the saved URL for delivery.
    row = await queryOneFresh<ExportRow>(`
      SELECT e.id, e.project_id, e.r2_key, e.export_type, e.file_size, p.client_id, p.created_by
      FROM banner_exports e JOIN banner_projects p ON p.id = e.project_id
      WHERE e.id = $1
    `, [id])
  } catch { unavailable() }
  if (!row || row.id !== id || typeof row.project_id !== 'string' || !RASTER_EXPORT_UUID.test(row.project_id)
    || !Object.hasOwn(RASTER_EXPORT_MIME, row.export_type)
    || ![`banner-raster-exports/${row.project_id}/${id}.${row.export_type}`, `scoped-banner-exports/${row.project_id}/${id}.${row.export_type}`].includes(row.r2_key)) missing()
  const scoped = row.r2_key.startsWith('scoped-banner-exports/')
  if (scoped) await transactionWithoutRetry(db => resolveDissectionContext(db, user.id, { projectId: row!.project_id }, 'read'))
  else await requireRasterProjectAccess(event, user, row)
  const bucket = (event.context as { cloudflare?: { env?: { MEDIA_BUCKET?: ReadBucket } } }).cloudflare?.env?.MEDIA_BUCKET
  if (!bucket || typeof bucket.get !== 'function' || typeof bucket.head !== 'function') unavailable()
  if (scoped) return deliverScoped(event, user.id, row, bucket, headOnly)
  let object: StoredObject | null
  try {
    object = headOnly ? await bucket.head(row.r2_key) : await bucket.get(row.r2_key)
  } catch { unavailable() }
  if (!object) missing()
  const mime = RASTER_EXPORT_MIME[row.export_type]
  if (!Number.isSafeInteger(object.size) || object.size < 1 || object.size > BANNER_RENDER_LIMITS.MAX_ITEM_OUTPUT_BYTES
    || object.size !== row.file_size || object.httpMetadata?.contentType !== mime || (!headOnly && !object.body)) {
    if (object.body) await object.body.cancel().catch(() => {})
    unavailable()
  }
  const headers = new Headers({
    'content-type': mime,
    'content-length': String(object.size),
    'content-disposition': `attachment; filename="${id}.${row.export_type}"`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff'
  })
  // Intentionally ignore Range/conditional requests: these private rasters are streamed whole.
  return new Response(headOnly ? null : object.body, { status: 200, headers })
}

/** HEAD also validates bytes; no cached metadata/304/range shortcut bypasses revocation. */
async function deliverScoped(_event: H3Event, actorId: string, row: ExportRow, bucket: ReadBucket, headOnly: boolean) {
  const head = await bucket.head(row.r2_key).catch(() => unavailable())
  if (!head) missing()
  const provenance = parseScopedExportProvenance(head.customMetadata, row.id, row.project_id)
  await recheckScopedExport(actorId, provenance, false)
  const object = await bucket.get(row.r2_key).catch(() => unavailable())
  const mime = RASTER_EXPORT_MIME[row.export_type]
  if (!object || !object.body || !Number.isSafeInteger(object.size) || object.size < 1
    || object.size > BANNER_RENDER_LIMITS.MAX_ITEM_OUTPUT_BYTES || object.size !== row.file_size
    || object.httpMetadata?.contentType !== mime
    || object.customMetadata?.provenance !== head.customMetadata?.provenance) {
    void object?.body?.cancel().catch(() => {})
    unavailable()
  }
  const data = await readBoundedBannerObjectBody(object.body, object.size, BANNER_RENDER_LIMITS.MAX_ITEM_OUTPUT_BYTES).catch(() => unavailable()) as Uint8Array<ArrayBuffer>
  const size = data.byteLength
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('')
  if (hash !== provenance.outputSha256) unavailable()
  // Re-read export identity too: a concurrent deletion/replacement cannot authorize old bytes.
  const current = await queryOneFresh<ExportRow>('SELECT id, project_id, r2_key, export_type, file_size FROM banner_exports WHERE id = $1', [row.id])
  if (!current || current.project_id !== row.project_id || current.r2_key !== row.r2_key
    || current.export_type !== row.export_type || current.file_size !== row.file_size) missing()
  await recheckScopedExport(actorId, provenance, false)
  return new Response(headOnly ? null : data, { headers: {
    'content-type': mime, 'content-length': String(size),
    'content-disposition': `attachment; filename="${row.id}.${row.export_type}"`,
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin', 'referrer-policy': 'no-referrer', 'vary': 'Cookie, Authorization',
  } })
}
