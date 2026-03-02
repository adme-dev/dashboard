/**
 * Schedule a banner publish for a future date/time.
 * POST /api/agency/banner-studio/schedule
 * Body: { projectId, formatKeys, scheduledAt, clickUrl?, impressionPixel?, clickPixel? }
 */
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { projectId, formatKeys, scheduledAt, clickUrl, impressionPixel, clickPixel } = body as {
    projectId: string
    formatKeys: string[]
    scheduledAt: string
    clickUrl?: string
    impressionPixel?: string
    clickPixel?: string
  }

  if (!projectId || !formatKeys?.length || !scheduledAt) {
    throw createError({ statusCode: 400, statusMessage: 'projectId, formatKeys, and scheduledAt are required' })
  }

  const scheduleDate = new Date(scheduledAt)
  if (isNaN(scheduleDate.getTime()) || scheduleDate <= new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'scheduledAt must be a valid future date' })
  }

  // Verify project exists
  const project = await queryOne('SELECT id, name FROM banner_projects WHERE id = $1', [projectId])
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Create or update scheduled publish entries
  const results: any[] = []
  for (const formatKey of formatKeys) {
    // Check if already published or scheduled
    const existing = await queryOne(
      'SELECT id FROM banner_published WHERE project_id = $1 AND format_key = $2',
      [projectId, formatKey],
    ) as any

    if (existing) {
      // Update existing with schedule
      const row = await queryOne(`
        UPDATE banner_published
        SET scheduled_at = $1, schedule_status = 'scheduled',
            click_url = COALESCE($2, click_url),
            impression_pixel = COALESCE($3, impression_pixel),
            click_pixel = COALESCE($4, click_pixel),
            updated_at = NOW()
        WHERE id = $5
        RETURNING id, format_key AS "formatKey", scheduled_at AS "scheduledAt", schedule_status AS "scheduleStatus"
      `, [scheduleDate.toISOString(), clickUrl || null, impressionPixel || null, clickPixel || null, existing.id])
      results.push(row)
    } else {
      // Create a placeholder entry with scheduled status
      const row = await queryOne(`
        INSERT INTO banner_published (project_id, format_key, version, r2_key, url, width, height,
          click_url, impression_pixel, click_pixel, published_by, scheduled_at, schedule_status, is_live)
        VALUES ($1, $2, 0, '', '', 0, 0, $3, $4, $5, $6, $7, 'scheduled', FALSE)
        RETURNING id, format_key AS "formatKey", scheduled_at AS "scheduledAt", schedule_status AS "scheduleStatus"
      `, [projectId, formatKey, clickUrl || null, impressionPixel || null, clickPixel || null, user.id, scheduleDate.toISOString()])
      results.push(row)
    }
  }

  return { scheduled: results, scheduledAt: scheduleDate.toISOString() }
})
