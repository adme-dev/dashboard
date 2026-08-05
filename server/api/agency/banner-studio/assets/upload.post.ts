import { createError, getHeader, readMultipartFormData } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { getAppUrl } from '~~/server/utils/appUrl'
import {
  bannerAssetDeliveryUrl,
  createBannerAssetId,
  createBannerAssetStorageKey,
  uploadBannerAsset
} from '~~/server/utils/bannerStorage'
import {
  validateBannerAssetUpload,
  type ValidatedBannerAssetUpload
} from '~~/server/utils/banner/assetUploadValidation'
import {
  executeGodModeBannerAssetUpload,
  type StoredBannerAssetUpload
} from '~~/server/utils/banner/godModeAssetUpload'
import { getGodModeRouteAuditState } from '~~/server/utils/godMode/featureGate'
import type { R2BucketBinding } from '~~/server/utils/storage'

const ROUTE = 'POST /api/agency/banner-studio/assets/upload'

function isHttpError(error: unknown): error is { statusCode: number } {
  return typeof error === 'object'
    && error !== null
    && 'statusCode' in error
    && typeof error.statusCode === 'number'
}

function constantTimeDigestEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const formData = await readMultipartFormData(event)
  const files = formData?.filter(part => part.name === 'file') ?? []
  if (files.length !== 1 || !files[0]?.data) {
    throw createError({ statusCode: 400, statusMessage: 'Exactly one file field is required' })
  }

  let validated: ValidatedBannerAssetUpload
  try {
    validated = validateBannerAssetUpload(files[0])
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid banner asset upload' })
  }

  const auditState = getGodModeRouteAuditState(event)
  if (auditState?.routeOrTool === ROUTE) {
    const claimedDigest = getHeader(event, 'x-banner-upload-digest')?.trim() || ''
    if (!constantTimeDigestEqual(claimedDigest, validated.requestDigest)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Banner upload digest does not match validated content'
      })
    }
  }

  try {
    const assetId = createBannerAssetId()
    const r2Key = createBannerAssetStorageKey(validated.fileName, user.id)
    const cloudflare = (event.context as {
      cloudflare?: { env?: Record<string, unknown> }
    }).cloudflare
    const cloudflareEnv = cloudflare?.env
    let nativeUpload: { bucket: R2BucketBinding, assetUrl: string } | undefined
    if (cloudflare) {
      const requestBucket = cloudflareEnv?.MEDIA_BUCKET as R2BucketBinding | undefined
      const signingSecret = cloudflareEnv?.RENDER_LINK_SECRET
      if (!requestBucket
        || typeof requestBucket.put !== 'function'
        || typeof requestBucket.head !== 'function'
        || typeof signingSecret !== 'string'
        || new TextEncoder().encode(signingSecret).byteLength < 32) {
        throw createError({
          statusCode: 503,
          statusMessage: 'Banner asset storage is unavailable'
        })
      }
      nativeUpload = {
        bucket: requestBucket,
        assetUrl: await bannerAssetDeliveryUrl(assetId, getAppUrl(event), signingSecret)
      }
    }
    return await executeGodModeBannerAssetUpload(event, {
      r2Key,
      uploadFile: async key => nativeUpload
        ? await uploadBannerAsset(
            validated.buffer,
            validated.fileName,
            validated.mimeType,
            user.id,
            key,
            nativeUpload
          )
        : await uploadBannerAsset(
            validated.buffer,
            validated.fileName,
            validated.mimeType,
            user.id,
            key
          ),
      insertAsset: async (db, stored: StoredBannerAssetUpload) => {
        const sql = `
          INSERT INTO banner_assets (id, name, mime_type, file_size, r2_key, url, uploaded_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING
            id, name,
            mime_type AS "mimeType",
            file_size AS "fileSize",
            r2_key AS "r2Key",
            url,
            thumbnail_url AS "thumbnailUrl",
            tags,
            uploaded_by AS "uploadedBy",
            created_at AS "createdAt"
        `
        const params = [assetId, validated.fileName, validated.mimeType, stored.size, stored.key, stored.url, user.id]
        const row = db
          ? (await db.query(sql, params)).rows[0]
          : await queryOne(sql, params)
        if (!row) throw new Error('Banner asset insert did not return a row')
        return row
      }
    })
  } catch (error: unknown) {
    if (isHttpError(error)) throw error
    console.error('Failed to upload banner asset', {
      errorName: error instanceof Error ? error.name : typeof error
    })
    throw createError({ statusCode: 500, statusMessage: 'Failed to upload banner asset' })
  }
})
