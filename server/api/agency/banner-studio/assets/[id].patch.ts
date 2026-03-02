import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Asset ID is required' })
  }

  const body = await readBody(event)
  const { name, tags } = body

  try {
    const sets: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      sets.push(`name = $${paramIndex}`)
      params.push(name.trim())
      paramIndex++
    }

    if (tags !== undefined) {
      sets.push(`tags = $${paramIndex}`)
      params.push(tags)
      paramIndex++
    }

    if (sets.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    const row = await queryOne(`
      UPDATE banner_assets
      SET ${sets.join(', ')}
      WHERE id = $${paramIndex}
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
    `, [...params, id])

    if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
    }

    return row
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update banner asset:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update banner asset' })
  }
})
