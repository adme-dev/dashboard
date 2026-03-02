import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const projectId = query.projectId as string
  const feedId = query.feedId as string | undefined

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  const conditions: string[] = ['project_id = $1']
  const params: any[] = [projectId]
  let paramIndex = 2

  if (feedId) {
    conditions.push(`feed_id = $${paramIndex}`)
    params.push(feedId)
    paramIndex++
  }

  const where = conditions.join(' AND ')

  const rows = await queryRows(`
    SELECT
      format_key AS "formatKey", row_index AS "rowIndex",
      url, width, height, click_url AS "clickUrl"
    FROM banner_variants
    WHERE ${where} AND is_live = TRUE
    ORDER BY format_key ASC, row_index ASC
  `, params)

  // Build CSV
  const header = 'format_key,row_index,url,width,height,click_url'
  const csvRows = rows.map((r: any) =>
    [
      r.formatKey,
      r.rowIndex ?? 0,
      `"${(r.url || '').replace(/"/g, '""')}"`,
      r.width ?? 0,
      r.height ?? 0,
      r.clickUrl ? `"${r.clickUrl.replace(/"/g, '""')}"` : '',
    ].join(','),
  )

  const csv = [header, ...csvRows].join('\n')

  setResponseHeaders(event, {
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="variants-${projectId.slice(0, 8)}.csv"`,
  })

  return csv
})
