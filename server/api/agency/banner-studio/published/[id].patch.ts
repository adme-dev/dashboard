import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Published banner ID is required' })
  }

  const body = await readBody(event)
  const { clickUrl, impressionPixel, clickPixel, isLive } = body

  const sets: string[] = []
  const params: any[] = []
  let paramIndex = 1

  if (clickUrl !== undefined) {
    sets.push(`click_url = $${paramIndex}`)
    params.push(clickUrl || null)
    paramIndex++
  }

  if (impressionPixel !== undefined) {
    sets.push(`impression_pixel = $${paramIndex}`)
    params.push(impressionPixel || null)
    paramIndex++
  }

  if (clickPixel !== undefined) {
    sets.push(`click_pixel = $${paramIndex}`)
    params.push(clickPixel || null)
    paramIndex++
  }

  if (isLive !== undefined) {
    sets.push(`is_live = $${paramIndex}`)
    params.push(!!isLive)
    paramIndex++
  }

  if (sets.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  sets.push('updated_at = NOW()')

  const row = await queryOne(`
    UPDATE banner_published
    SET ${sets.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING
      id, project_id AS "projectId", format_key AS "formatKey",
      version, r2_key AS "r2Key", url,
      click_url AS "clickUrl", impression_pixel AS "impressionPixel",
      click_pixel AS "clickPixel",
      width, height, file_size AS "fileSize",
      is_live AS "isLive",
      published_by AS "publishedBy",
      published_at AS "publishedAt",
      updated_at AS "updatedAt"
  `, [...params, id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Published banner not found' })
  }

  return row
})
