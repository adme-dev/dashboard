import { createError, getHeader, readMultipartFormData } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { isSocialClientId, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { getAppUrl } from '~~/server/utils/appUrl'
import {
  bannerAssetDeliveryUrl,
  createBannerAssetId,
  createBannerAssetStorageKey,
  deleteBannerFile,
  uploadBannerAsset
} from '~~/server/utils/bannerStorage'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'
import {
  validateBannerAssetUpload,
  type ValidatedBannerAssetUpload
} from '~~/server/utils/banner/assetUploadValidation'
import {
  executeGodModeBannerAssetUpload,
  type StoredBannerAssetUpload
} from '~~/server/utils/banner/godModeAssetUpload'
import { getGodModeRouteAuditState } from '~~/server/utils/godMode/featureGate'

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
  const clientFields = formData?.filter(part => part.name === 'clientId') ?? []
  const clientId = clientFields[0]?.data.toString('utf-8').trim().toLowerCase() || null
  if (clientFields.length > 1 || (clientFields.length && !isSocialClientId(clientId))) {
    throw createError({ statusCode: 400, statusMessage: 'A single valid clientId is required' })
  }
  if (clientId) {
    await requireWriteAccess(event)
    await requireSocialClientAccess(event, clientId)
  }

  let validated: ValidatedBannerAssetUpload
  try {
    validated = validateBannerAssetUpload(files[0], clientId)
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
    const createdAt = new Date().toISOString()
    const { nativeUpload, signingSecret } = resolveBannerAssetDelivery(event)
    const result = await executeGodModeBannerAssetUpload(event, {
      assetId,
      r2Key,
      result: (stored, identity) => ({
        id: identity.assetId,
        name: validated.fileName,
        mimeType: validated.mimeType,
        fileSize: stored.size,
        r2Key: identity.r2Key,
        url: stored.url,
        thumbnailUrl: null,
        tags: [],
        uploadedBy: user.id,
        clientId,
        createdAt
      }),
      deleteFile: async key => await deleteBannerFile(key, nativeUpload?.bucket),
      uploadFile: async (key, effectiveAssetId = assetId) => {
        // Signed delivery URL in both modes; only the storage transport differs (binding vs S3 API)
        const delivery = signingSecret
          ? await bannerAssetDeliveryUrl(effectiveAssetId, getAppUrl(event), signingSecret)
          : undefined
        return nativeUpload
          ? await uploadBannerAsset(validated.buffer, validated.fileName, validated.mimeType, user.id, key, { bucket: nativeUpload.bucket, assetUrl: delivery! })
          : delivery
            ? await uploadBannerAsset(validated.buffer, validated.fileName, validated.mimeType, user.id, key, undefined, delivery)
            : await uploadBannerAsset(validated.buffer, validated.fileName, validated.mimeType, user.id, key)
      },
      insertAsset: async (db, stored: StoredBannerAssetUpload, result) => {
        if (!result) throw new Error('Banner asset insert identity is unavailable')
        const sql = `INSERT INTO banner_assets (id, name, mime_type, file_size, r2_key, url, uploaded_by, created_at, client_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, name, mime_type AS "mimeType", file_size AS "fileSize", r2_key AS "r2Key", url, thumbnail_url AS "thumbnailUrl", tags, uploaded_by AS "uploadedBy", created_at AS "createdAt", client_id AS "clientId"`
        const params = [
          result.id,
          result.name,
          result.mimeType,
          stored.size,
          stored.key,
          stored.url,
          result.uploadedBy,
          result.createdAt,
          clientId
        ]
        const row = db
          ? (await db.query(sql, params)).rows[0]
          : await queryOne(sql, params)
        if (!row) throw new Error('Banner asset insert did not return a row')
        return row
      }
    })
    if ((result.clientId ?? null) !== clientId) {
      throw createError({ statusCode: 409, statusMessage: 'Uploaded asset belongs to a different client scope' })
    }
    return result
  } catch (error: unknown) {
    if (isHttpError(error)) throw error
    console.error('Failed to upload banner asset', {
      errorName: error instanceof Error ? error.name : typeof error
    })
    throw createError({ statusCode: 500, statusMessage: 'Failed to upload banner asset' })
  }
})
