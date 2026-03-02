import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  try {
    const rows = await queryRows(`
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

    return rows
  } catch (error: any) {
    console.error('Failed to fetch custom fonts:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch custom fonts' })
  }
})
