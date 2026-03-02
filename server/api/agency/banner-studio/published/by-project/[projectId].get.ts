import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const projectId = getRouterParam(event, 'projectId')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const rows = await queryRows(`
    SELECT
      id, project_id AS "projectId", format_key AS "formatKey",
      version, r2_key AS "r2Key", url,
      click_url AS "clickUrl", impression_pixel AS "impressionPixel",
      click_pixel AS "clickPixel",
      width, height, file_size AS "fileSize",
      is_live AS "isLive",
      published_by AS "publishedBy",
      published_at AS "publishedAt",
      updated_at AS "updatedAt"
    FROM banner_published
    WHERE project_id = $1
    ORDER BY format_key
  `, [projectId])

  return rows
})
