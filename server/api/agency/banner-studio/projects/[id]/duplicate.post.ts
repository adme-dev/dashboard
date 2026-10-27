import { queryOne, queryOneFresh } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { validateBannerPlatformQrCanvas } from '~~/server/utils/banner/platformQrCanvas'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  try {
    const source = await queryOneFresh(`
      SELECT name, client_id AS "clientId", canvas_data AS "canvasData", tags, created_by AS "createdBy"
      FROM banner_projects WHERE id = $1
    `, [id])

    if (!source) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }
    if (source.clientId) await requireSocialClientAccess(event, source.clientId)
    else if (source.createdBy !== user.id && !hasAllSocialClientAccess(user)) {
      throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
    }
    await validateBannerPlatformQrCanvas(event, {}, source.canvasData, source.clientId)

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
      source.clientId,
      JSON.stringify(source.canvasData),
      source.tags,
      user.id
    ])

    return row
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('Failed to duplicate banner project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to duplicate banner project' })
  }
})
