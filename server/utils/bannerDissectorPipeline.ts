import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { claimDissectionAttempt, dissectionArtwork, dissectionSnapshot, isDissectionAttemptActive, loadDissection, writeDissectionAttempt, type DissectionAttemptOptions } from '~~/server/utils/banner/dissectionJobs'
import { readStoredObject, type R2BucketBinding } from '~~/server/utils/storage'
import { execute } from '~~/server/utils/db'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'
import { bannerAssetDeliveryUrl, createBannerAssetStorageKey, uploadBannerAsset, deleteBannerFile } from '~~/server/utils/bannerStorage'
import { getAppUrl } from '~~/server/utils/appUrl'
import { analyzeImage, segmentLayer, getImageDimensions } from '~~/server/utils/bannerDissector'
import type { DissectorManifest } from '~~/app/types/banner-studio'

/**
 * Run the full dissection pipeline: fetch image → analyze → segment → upload assets.
 * Used by both the queue consumer and the registered request-lifetime fallback.
 */
export async function runDissectionPipeline(
  event: H3Event | null,
  jobId: string,
  options: DissectionAttemptOptions = {}
) {
  // Queue and registered request-lifetime deliveries compete for this durable claim.
  const record = await claimDissectionAttempt(jobId, options)
  const current = async () => dissectionSnapshot(await loadDissection(jobId, options.userId))
  if (!record) {
    const snapshot = await current()
    if (options.retry && !['analyzing', 'segmenting', 'queued'].includes(snapshot.status)) {
      throw createError({ statusCode: 409, statusMessage: 'This job cannot be retried, or its attempt limit has been reached' })
    }
    return snapshot
  }
  const execution = record.manifest!.execution!

  try {
    // 2. Fetch original image from R2
    const delivery = resolveBannerAssetDelivery(event || { context: {} })
    const imageBuffer = await downloadFromR2(record.source_r2_key!, jobId, delivery.nativeUpload?.bucket)
    if (!imageBuffer) {
      throw new Error('Could not download source image from R2')
    }

    // 3. Get image dimensions
    const dims = getImageDimensions(imageBuffer)
    if (!dims || dims.width <= 0 || dims.height <= 0 || dims.width > 10000 || dims.height > 10000 || dims.width * dims.height > 40_000_000) {
      throw new Error('Unsupported image dimensions')
    }
    const imageWidth = dims.width
    const imageHeight = dims.height

    // 4. Analyze with AI vision
    const imageBase64 = imageBuffer.toString('base64')
    // The hosted queue-to-HTTP bridge carries the same request capabilities as Pages.
    if (!await isDissectionAttemptActive(jobId, execution.attemptId)) return await current()
    const manifest = dissectionArtwork(await analyzeImage(event, imageBase64, record.brand || undefined)) as DissectorManifest
    manifest.jobId = jobId
    manifest.banner_size = `${imageWidth}x${imageHeight}`

    // Generated metadata cannot nominate an existing asset as extraction output.
    manifest.warnings = []
    if (!manifest.layers.some(layer => layer.type === 'background')) {
      manifest.warnings.push('No clean background was identified or reconstructed. Background review is required before import.')
    }
    for (const layer of manifest.layers) {
      delete layer.asset_path
      delete layer.r2_url
      delete layer.extraction_warning
      layer.extraction_status = 'unresolved'
    }

    execution.total = manifest.layers.length
    execution.completed = 0
    if (!await writeDissectionAttempt(jobId, execution, 'segmenting', manifest)) return await current()

    // The original remains a reference in source_r2_key, never an extracted layer.
    // Background repair is not implemented by this extraction pipeline.
    for (const layer of manifest.layers) {
      if (!await isDissectionAttemptActive(jobId, execution.attemptId)) return await current()
      if (layer.type === 'background') {
        layer.extraction_warning = 'Background repair is required; the original artwork is only a source reference.'
      } else if (layer.type === 'live_text') {
        const bindings = layer.token_bindings || []
        const text = bindings.length === 1 ? manifest.tokens[bindings[0]!]?.value : undefined
        if (typeof text === 'string' && text.trim()) layer.extraction_status = 'extracted'
        else layer.extraction_warning = 'Native text needs one verified text binding; descriptions are not artwork copy.'
      } else if (layer.export_as_png) {
        try {
          const segmented = await segmentLayer(
            event, imageBuffer, layer.region, layer.id, imageWidth, imageHeight, layer.mask
          )
          if (!await isDissectionAttemptActive(jobId, execution.attemptId)) return await current()
          if (segmented) {
            const uploaded = await persistLayer(segmented, event, record, execution.attemptId, delivery)
            if (!await isDissectionAttemptActive(jobId, execution.attemptId)) return await current()
            layer.asset_path = uploaded.key
            layer.r2_url = uploaded.url
            layer.extraction_status = 'extracted'
          } else {
            layer.extraction_warning = 'No isolated cutout was produced; the source was not substituted.'
          }
        } catch {
          // Provider exceptions may include private content or credentials.
          layer.extraction_warning = 'Layer extraction or storage failed; review and retry are required.'
        }
      } else {
        layer.extraction_warning = 'No supported extraction output was requested for this layer.'
      }
      if (layer.extraction_warning) manifest.warnings.push(`${layer.id}: ${layer.extraction_warning}`)
      execution.completed++
      if (!await writeDissectionAttempt(jobId, execution, 'segmenting', manifest)) return await current()
    }

    // Strip mask data from layers (large base64 blobs no longer needed after segmentation)
    for (const layer of manifest.layers) {
      delete layer.mask
    }

    // Partial extraction is reviewable, never success-shaped completion.
    manifest.status = manifest.warnings.length === 0 && manifest.layers.length > 0 && manifest.layers.every(layer => layer.extraction_status === 'extracted') ? 'complete' : 'review_ready'
    const saved = await writeDissectionAttempt(jobId, execution, manifest.status, manifest)
    return saved ? dissectionSnapshot(saved) : await current()
  } catch {
    const error = 'Dissection failed. Check image validity and provider availability before retrying.'
    // Persist a content-free failure; never expose provider exception bodies.
    if (!await writeDissectionAttempt(jobId, execution, 'failed', {}, error)) return await current()
    throw new Error(error)
  }
}

const MAX_SOURCE_BYTES = 10 * 1024 * 1024
const MAX_LAYER_BYTES = 10 * 1024 * 1024

/** The database-owned source key is the only input; never fetch a supplied URL. */
async function downloadFromR2(key: string, jobId: string, bucket?: R2BucketBinding): Promise<Buffer> {
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId) || !['png', 'jpg', 'webp'].some(ext => key === `banner-dissector/${jobId}/original.${ext}`)) {
    throw new Error('Source is not owned by this dissection')
  }
  // Hosted callers must have a readable native bucket. The existing storage
  // adapter supplies the fetch-based S3 handler/local filesystem only in dev.
  if (bucket && typeof bucket.get !== 'function') throw new Error('Source storage is unavailable')
  const object = bucket ? await bucket.get!(key) : await readStoredObject(key)
  if (!object?.body || !Number.isSafeInteger(object.size) || object.size < 1 || object.size > MAX_SOURCE_BYTES) {
    if (object?.body) void object.body.cancel().catch(() => {})
    throw new Error('Source is unavailable or exceeds its byte limit')
  }
  const reader = object.body.getReader()
  const bytes = Buffer.allocUnsafe(object.size)
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array) || value.byteLength > bytes.length - length) throw new Error('Source exceeds its declared byte limit')
      bytes.set(value, length)
      length += value.byteLength
    }
    if (length !== object.size) throw new Error('Source was truncated')
    return bytes
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

async function persistLayer(
  bytes: Buffer,
  event: H3Event | null,
  record: { job_id: string },
  attemptId: string,
  delivery: ReturnType<typeof resolveBannerAssetDelivery>
) {
  // Claims RETURNING * carry the persisted uploader. Queue payloads and models
  // have no authority to choose the catalogue owner or destination key.
  const userId = (record as { user_id?: string }).user_id
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    || !delivery.signingSecret || !bytes.length || bytes.length > MAX_LAYER_BYTES) throw new Error('Extracted asset storage is unavailable')
  const id = randomUUID()
  const name = `dissection-${id}.png`
  const key = createBannerAssetStorageKey(name, userId)
  const url = await bannerAssetDeliveryUrl(id, getAppUrl(event || undefined), delivery.signingSecret)
  let inserted = false
  try {
    const uploaded = await uploadBannerAsset(bytes, name, 'image/png', userId, key,
      delivery.nativeUpload ? { bucket: delivery.nativeUpload.bucket, assetUrl: url } : undefined, url)
    if (!await isDissectionAttemptActive(record.job_id, attemptId)) throw new Error('Dissection attempt is no longer active')
    await execute(
      'INSERT INTO banner_assets (id, name, mime_type, file_size, r2_key, url, uploaded_by, tags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, name, 'image/png', bytes.length, key, url, userId, ['dissected', 'review-required']]
    )
    inserted = true
    if (!await isDissectionAttemptActive(record.job_id, attemptId)) throw new Error('Dissection attempt is no longer active')
    return uploaded
  } catch (error) {
    // Compensation is restricted to this invocation's new UUID/key.
    if (inserted) await execute('DELETE FROM banner_assets WHERE id = $1 AND uploaded_by = $2', [id, userId]).catch(() => {})
    if (delivery.nativeUpload) await delivery.nativeUpload.bucket.delete(key).catch(() => {})
    else await deleteBannerFile(key).catch(() => {})
    throw error
  }
}
