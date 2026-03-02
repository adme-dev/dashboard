import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { name, clientId, canvasData, tags } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Project name is required' })
  }

  try {
    const row = await queryOne(`
      INSERT INTO banner_projects (name, client_id, canvas_data, tags, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id, name,
        client_id AS "clientId",
        canvas_data AS "canvasData",
        thumbnail_url AS "thumbnailUrl",
        status, tags,
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `, [
      name.trim(),
      clientId || null,
      JSON.stringify(canvasData || {}),
      tags || [],
      user.id,
    ])

    return row
  } catch (error: any) {
    console.error('Failed to create banner project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create banner project' })
  }
})
