import { readMultipartFormData } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { uploadBannerAsset } from '~~/server/utils/bannerStorage'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }

  const file = formData.find(f => f.name === 'file')
  if (!file || !file.data) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file field' })
  }

  const fileName = file.filename || 'unnamed'
  const mimeType = file.type || 'application/octet-stream'
  const buffer = Buffer.from(file.data)

  try {
    const { key, url, size } = await uploadBannerAsset(buffer, fileName, mimeType, user.id)

    const row = await queryOne(`
      INSERT INTO banner_assets (name, mime_type, file_size, r2_key, url, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6)
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
    `, [fileName, mimeType, size, key, url, user.id])

    return row
  } catch (error: any) {
    console.error('Failed to upload banner asset:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to upload banner asset' })
  }
})
