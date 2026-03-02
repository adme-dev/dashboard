/**
 * Cancel a scheduled publish.
 * POST /api/agency/banner-studio/schedule-cancel
 * Body: { publishedId } or { projectId, formatKey }
 */
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)

  const { publishedId, projectId, formatKey } = body as {
    publishedId?: string
    projectId?: string
    formatKey?: string
  }

  let id = publishedId
  if (!id && projectId && formatKey) {
    const row = await queryOne(
      "SELECT id FROM banner_published WHERE project_id = $1 AND format_key = $2 AND schedule_status = 'scheduled'",
      [projectId, formatKey],
    ) as any
    id = row?.id
  }

  if (!id) {
    throw createError({ statusCode: 404, statusMessage: 'Scheduled publish not found' })
  }

  const row = await queryOne(`
    UPDATE banner_published
    SET schedule_status = 'cancelled', scheduled_at = NULL, updated_at = NOW()
    WHERE id = $1 AND schedule_status = 'scheduled'
    RETURNING id, format_key AS "formatKey", schedule_status AS "scheduleStatus"
  `, [id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'No scheduled publish found to cancel' })
  }

  return row
})
