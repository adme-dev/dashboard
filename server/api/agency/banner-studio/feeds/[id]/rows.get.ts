import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const { offset = '0', limit = '50' } = getQuery(event) as { offset?: string; limit?: string }

  const feed = await queryOne('SELECT data_url, row_count FROM banner_feeds WHERE id = $1', [id])
  if (!feed) {
    throw createError({ statusCode: 404, statusMessage: 'Feed not found' })
  }

  if (!feed.data_url) {
    return { rows: [], total: 0 }
  }

  // Fetch the JSON data from R2 URL
  try {
    const response = await fetch(feed.data_url)
    if (!response.ok) {
      return { rows: [], total: feed.row_count || 0 }
    }
    const allRows: Record<string, string>[] = await response.json()
    const off = Math.max(0, parseInt(offset))
    const lim = Math.min(200, Math.max(1, parseInt(limit)))
    const rows = allRows.slice(off, off + lim)
    return { rows, total: allRows.length }
  } catch {
    return { rows: [], total: feed.row_count || 0 }
  }
})
