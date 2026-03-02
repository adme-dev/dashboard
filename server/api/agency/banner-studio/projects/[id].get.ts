import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  try {
    const row = await queryOne(`
      SELECT
        p.id, p.name,
        p.client_id AS "clientId",
        c.name AS "clientName",
        p.canvas_data AS "canvasData",
        p.thumbnail_url AS "thumbnailUrl",
        p.status, p.tags,
        p.created_by AS "createdBy",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt"
      FROM banner_projects p
      LEFT JOIN agency_clients c ON p.client_id = c.id
      WHERE p.id = $1
    `, [id])

    if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }

    return row
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch banner project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch banner project' })
  }
})
