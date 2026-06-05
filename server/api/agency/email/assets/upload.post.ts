import { readMultipartFormData } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { uploadBannerAsset } from '~~/server/utils/bannerStorage'
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

  const { key, url, size } = await uploadBannerAsset(buffer, storageFileName, mimeType, user.id)
  const asset = await queryOne(`
    INSERT INTO banner_assets (name, mime_type, file_size, r2_key, url, tags, uploaded_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
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
      created_at AS "createdAt"
  `, [fileName, mimeType, size, key, url, ['email', 'image'], user.id])

  return { asset }
})
