import { transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Asset ID is required' })
  }

  const body = await readBody(event)
  const { name, tags } = body
  if (tags !== undefined && (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string'))) throw createError({ statusCode: 400, statusMessage: 'Invalid asset tags' })

  try {
    return await transaction(async (db) => {
      const asset = (await db.query<{ tags: string[] | null }>('SELECT tags FROM banner_assets WHERE id = $1 FOR UPDATE', [id])).rows[0]
      if (!asset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
      if (asset.tags?.includes('font') || (Array.isArray(tags) && tags.includes('font'))) throw createError({ statusCode: 409, statusMessage: 'Font metadata is managed by the font library' })
      const sets: string[] = []
      const params: unknown[] = []
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

      const row = (await db.query(`
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
    `, [...params, id])).rows[0]

      if (!row) {
        throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
      }

      return row
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to update banner asset:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update banner asset' })
  }
})
