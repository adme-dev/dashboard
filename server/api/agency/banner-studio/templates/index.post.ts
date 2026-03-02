import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { name, category, canvasData, thumbnailUrl } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Template name is required' })
  }

  if (!canvasData) {
    throw createError({ statusCode: 400, statusMessage: 'Canvas data is required' })
  }

  try {
    const row = await queryOne(`
      INSERT INTO banner_templates (name, category, canvas_data, thumbnail_url, is_system, created_by)
      VALUES ($1, $2, $3, $4, FALSE, $5)
      RETURNING
        id, name, category,
        canvas_data AS "canvasData",
        thumbnail_url AS "thumbnailUrl",
        is_system AS "isSystem",
        created_by AS "createdBy",
        created_at AS "createdAt"
    `, [
      name.trim(),
      category || 'custom',
      JSON.stringify(canvasData),
      thumbnailUrl || null,
      user.id,
    ])

    return row
  } catch (error: any) {
    console.error('Failed to create banner template:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create banner template' })
  }
})
