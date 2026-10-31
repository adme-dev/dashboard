import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { withBannerFontDelivery } from '~~/server/utils/banner/fontDelivery'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  setHeader(event, 'Cache-Control', 'private, no-store')

  try {
    const rows = await queryRows<{ id: string, r2Key: string, uploadedBy: string, url: string }>(`
      SELECT
        id, name,
        mime_type AS "mimeType",
        file_size AS "fileSize",
        r2_key AS "r2Key",
        url, tags,
        uploaded_by AS "uploadedBy",
        created_at AS "createdAt"
      FROM banner_assets
      WHERE 'font' = ANY(tags)
      ORDER BY created_at DESC
    `)

    return await withBannerFontDelivery(event, rows)
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to fetch custom fonts:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch custom fonts' })
  }
})
