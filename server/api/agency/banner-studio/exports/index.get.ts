import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const { projectId } = query

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  try {
    const rows = await queryRows(`
      SELECT
        id,
        project_id AS "projectId",
        format_key AS "formatKey",
        r2_key AS "r2Key",
        url,
        file_size AS "fileSize",
        exported_by AS "exportedBy",
        exported_at AS "exportedAt"
      FROM banner_exports
      WHERE project_id = $1
      ORDER BY exported_at DESC
    `, [projectId])

    return rows
  } catch (error: any) {
    console.error('Failed to fetch banner exports:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch banner exports' })
  }
})
