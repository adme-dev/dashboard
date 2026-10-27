import { createHash, randomUUID } from 'node:crypto'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { resolveDissectionOwner } from '~~/server/utils/banner/dissectionAccess'
import { parseDissectionUploadParts } from '~~/server/utils/banner/dissectionUpload'
import { ensureBoundedDissectionUploadBody } from '~~/server/runtime/banner-dissection-pages-guard'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'
import { uploadFile } from '~~/server/utils/storage'
import { dispatchDissection } from '~~/server/utils/banner/dissectionDispatch'
import { dissectionSnapshot, loadDissection, queuedDissectionManifest, type DissectionSourceIdentity } from '~~/server/utils/banner/dissectionJobs'
import { validateDissectionPng } from '~~/server/utils/banner/dissectionPngValidation'
import { detectBannerAssetMime } from '~~/shared/utils/bannerAssetIdentity'
import { SCOPED_DISSECTION_ADMISSION_ENABLED } from '../../../../../shared/bannerDissectionCapabilities'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)

  await ensureBoundedDissectionUploadBody(event)
  const { file: fileField, brand, projectId, clientId, physical } = parseDissectionUploadParts(await readMultipartFormData(event))
  if ((projectId || clientId) && !SCOPED_DISSECTION_ADMISSION_ENABLED) {
    throw createError({ statusCode: 409, statusMessage: 'Project and client uploads are not available yet' })
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(fileField.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Only JPEG, PNG, and WebP images are accepted' })
  }

  // Validate file size (10MB max)
  const maxSize = 10 * 1024 * 1024
  if (fileField.data.length > maxSize) {
    throw createError({ statusCode: 400, statusMessage: 'File size exceeds 10MB limit' })
  }
  // A declared legacy MIME must not bypass the PNG validation boundary.
  if (detectBannerAssetMime(fileField.data) !== fileField.type) {
    throw createError({ statusCode: 400, statusMessage: 'The file type does not match the uploaded image' })
  }

  // PNG-only verification: JPEG/WebP retain their existing unverified path.
  // The existing JPEG decoder cannot validate A4 within its memory budget.
  let source: DissectionSourceIdentity | undefined
  if (fileField.type === 'image/png') {
    try {
      const { width, height } = await validateDissectionPng(fileField.data)
      source = { version: 1, mimeType: fileField.type, byteLength: fileField.data.length, width, height, sha256: createHash('sha256').update(fileField.data).digest('hex') }
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'PNG must be valid, static, noninterlaced 8-bit with supported metadata, up to 4096px and 10 megapixels' })
    }
  }

  if (physical && !source) throw createError({ statusCode: 400, statusMessage: 'Physical format requires a verified PNG source' })
  const ownerInput = { ...(projectId ? { projectId } : {}), ...(clientId ? { clientId } : {}), ...(source ? { source } : {}) }
  const admitted = await transactionWithoutRetry(db => resolveDissectionOwner(db, user.id, ownerInput))
  if (admitted.owner.kind !== 'user' && !event.context.cloudflare?.env?.MEDIA_BUCKET) {
    throw createError({ statusCode: 503, statusMessage: 'Protected Dissector uploads require private request-bound storage' })
  }
  const jobId = randomUUID()
  const ext = fileField.type === 'image/png' ? 'png' : fileField.type === 'image/webp' ? 'webp' : 'jpg'
  const r2Key = `banner-dissector/${jobId}/original.${ext}`
  const manifest = { ...queuedDissectionManifest(), ...(source ? { source, ingestion: { version: 1 as const, ...admitted, physical, ingestedAt: new Date().toISOString() } } : {}) }

  // Persist the private source using this request's bucket. Generic S3 writes
  // are a local fallback only; Pages must never silently use the filesystem.
  if (event.context.cloudflare) {
    const bucket = resolveBannerAssetDelivery(event).nativeUpload!.bucket
    try {
      await bucket.put(r2Key, new Uint8Array(fileField.data), { httpMetadata: { contentType: fileField.type } })
      const stored = await bucket.head(r2Key)
      if (!stored || stored.size !== fileField.data.length) throw new Error('Source was not persisted')
    } catch {
      throw createError({ statusCode: 503, statusMessage: 'Dissection source storage is unavailable' })
    }
  } else {
    await uploadFile(Buffer.from(fileField.data), r2Key, fileField.type)
  }

  // Re-read current authority after storage; freeze exactly the original scope.
  // Lost acknowledgement never automatically replays this insertion.
  await transactionWithoutRetry(async (db) => {
    const current = await resolveDissectionOwner(db, user.id, ownerInput)
    if (JSON.stringify(current) !== JSON.stringify(admitted)) {
      throw createError({ statusCode: 409, statusMessage: 'Dissection ownership changed during upload' })
    }
    await db.query(
      `INSERT INTO banner_dissections (job_id, user_id, source_r2_key, brand, status, manifest)
     VALUES ($1, $2, $3, $4, 'queued', jsonb_set($5::jsonb, '{execution}',
       ($5::jsonb)->'execution' || jsonb_build_object(
         'updatedAt', clock_timestamp(), 'deadlineAt', clock_timestamp() + interval '10 minutes',
         'dispatch', ($5::jsonb)->'execution'->'dispatch' || jsonb_build_object('nextAttemptAt', clock_timestamp()))))`,
      [jobId, user.id, r2Key, brand || null, JSON.stringify(manifest)]
    )
  })

  await dispatchDissection(event, jobId, manifest.execution.attemptId)

  return dissectionSnapshot(await loadDissection(jobId, user.id))
})
