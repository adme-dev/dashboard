import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  try {
    const source = await queryOne(`
      SELECT name, client_id, canvas_data, tags
      FROM banner_projects WHERE id = $1
    `, [id])

    if (!source) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }

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
      source.name + ' (Copy)',
      source.client_id,
      JSON.stringify(source.canvas_data),
      source.tags,
      user.id,
    ])

    return row
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to duplicate banner project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to duplicate banner project' })
  }
})
