import { readMultipartFormData } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getAppUrl } from '~~/server/utils/appUrl'
import {
  bannerAssetDeliveryUrl,
  createBannerAssetId,
  createBannerAssetStorageKey,
  uploadBannerAsset
} from '~~/server/utils/bannerStorage'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'
import { resolveEmailWriteClientId } from '~~/server/utils/email-marketing/access'
import {
  EMAIL_IMAGE_ASSET_MAX_BYTES,
  emailImageAssetStorageName,
  isAllowedEmailImageMime,
  isWithinEmailImageAssetLimit
} from '~~/app/utils/edmImageAssets'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const formData = await readMultipartFormData(event)
  const file = formData?.find(field => field.name === 'file')
  const clientField = formData?.find(field => field.name === 'client_id')
  const requestedClientId = clientField?.data
    ? Buffer.from(clientField.data).toString('utf8').trim() || null
    : null

  if (!file?.data) {
    throw createError({ statusCode: 400, statusMessage: 'missing_file' })
  }

  const fileName = file.filename || 'image'
  const storageFileName = emailImageAssetStorageName(fileName)
  const mimeType = file.type || 'application/octet-stream'
  const buffer = Buffer.from(file.data)

  if (!isAllowedEmailImageMime(mimeType)) {
    throw createError({ statusCode: 400, statusMessage: 'unsupported_image_type' })
  }

  if (!isWithinEmailImageAssetLimit(buffer.length)) {
    throw createError({
      statusCode: 413,
      statusMessage: 'image_too_large',
      data: { maxBytes: EMAIL_IMAGE_ASSET_MAX_BYTES }
    })
  }

  const clientId = await resolveEmailWriteClientId(event, user, requestedClientId)
  const { nativeUpload, signingSecret } = resolveBannerAssetDelivery(event)
  if (!signingSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Banner asset storage is unavailable' })
  }

  const assetId = createBannerAssetId()
  const r2Key = createBannerAssetStorageKey(storageFileName, user.id)
  // Signed delivery URL in both modes; only the storage transport differs (binding vs S3 API).
  const deliveryUrl = await bannerAssetDeliveryUrl(assetId, getAppUrl(event), signingSecret)
  const { key, url, size } = nativeUpload
    ? await uploadBannerAsset(
      buffer,
      storageFileName,
      mimeType,
      user.id,
      r2Key,
      { bucket: nativeUpload.bucket, assetUrl: deliveryUrl }
    )
    : await uploadBannerAsset(buffer, storageFileName, mimeType, user.id, r2Key, undefined, deliveryUrl)

  const asset = await queryOne(`
    INSERT INTO banner_assets (id, name, mime_type, file_size, r2_key, url, tags, uploaded_by, client_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING
      id,
      name,
      mime_type AS "mimeType",
      file_size AS "fileSize",
      r2_key AS "r2Key",
      url,
      thumbnail_url AS "thumbnailUrl",
      tags,
      uploaded_by AS "uploadedBy",
      client_id AS "clientId",
      created_at AS "createdAt"
  `, [assetId, fileName, mimeType, size, key, url, ['email', 'image'], user.id, clientId])

  return { asset }
})
