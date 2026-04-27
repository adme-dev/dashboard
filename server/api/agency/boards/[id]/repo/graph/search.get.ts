/**
 * Search graphify nodes for the connected repo.
 * GET /api/agency/boards/:id/repo/graph/search?q=VehicleChatAgent&limit=10
 *
 * Returns nodes whose label / id / source_file matches the query.
 * Backed by the graphify graph stored in R2 (graphify_path prefix).
 */

import { createError, getQuery, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { searchNodes } from '~~/server/utils/graphify'

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

export default eventHandler(async (event) => {
  await requireAuth(event)

  const idOrSlug = getRouterParam(event, 'id')
  if (!idOrSlug) throw createError({ statusCode: 400, statusMessage: 'Board id is required' })

  const q = getQuery(event)
  const query = (q.q ?? '').toString().trim()
  if (!query) throw createError({ statusCode: 400, statusMessage: 'q query param is required' })
  const limit = Math.min(Math.max(Number(q.limit) || 10, 1), 50)

  const where = isUUID(idOrSlug) ? 'd.id = $1' : 'd.slug = $1'
  const row = await queryOne<{ graphify_path: string | null }>(
    `SELECT pr.graphify_path
       FROM project_repos pr
       JOIN departments d ON d.id = pr.department_id
      WHERE ${where}`,
    [idOrSlug],
  )

  if (!row) throw createError({ statusCode: 404, statusMessage: 'No repo connected to this board' })
  if (!row.graphify_path) {
    throw createError({ statusCode: 400, statusMessage: 'No graphify_path configured for this repo' })
  }

  try {
    const nodes = await searchNodes(row.graphify_path, query, limit)
    return { query, count: nodes.length, nodes }
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to search graph: ${err.message ?? 'unknown'}`,
    })
  }
})
