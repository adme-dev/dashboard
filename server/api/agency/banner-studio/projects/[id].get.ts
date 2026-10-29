import { queryOneFresh } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  setHeader(event, 'Cache-Control', 'private, no-store')
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  try {
    const row = await queryOneFresh(`
      SELECT
        p.id, p.name, p.folder_id AS "folderId",
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
    if (row.clientId) await requireSocialClientAccess(event, row.clientId)
    else if (row.createdBy !== user.id && !hasAllSocialClientAccess(user)) {
      throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
    }

    return row
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch banner project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch banner project' })
  }
})
