import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const body = await readBody(event)
  const { name, category, thumbnailUrl } = body

  try {
    const sets: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      sets.push(`name = $${paramIndex}`)
      params.push(name.trim())
      paramIndex++
    }

    if (category !== undefined) {
      sets.push(`category = $${paramIndex}`)
      params.push(category)
      paramIndex++
    }

    if (thumbnailUrl !== undefined) {
      sets.push(`thumbnail_url = $${paramIndex}`)
      params.push(thumbnailUrl)
      paramIndex++
    }

    if (sets.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    const row = await queryOne(`
      UPDATE banner_templates
      SET ${sets.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING
        id, name, category,
        canvas_data AS "canvasData",
        thumbnail_url AS "thumbnailUrl",
        is_system AS "isSystem",
        created_by AS "createdBy",
        created_at AS "createdAt"
    `, [...params, id])

    if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    }

    return row
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update banner template:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update banner template' })
  }
})
