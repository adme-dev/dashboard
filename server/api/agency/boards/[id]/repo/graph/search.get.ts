/**
 * Search graphify nodes for the connected repo.
 * GET /api/agency/boards/:id/repo/graph/search?q=VehicleChatAgent&limit=10
 *
 * AuthZ: caller must have board access.
 */

import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { requireBoardAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { searchNodes, GraphifyError } from '~~/server/utils/graphify'
import { isUUID } from '~~/server/utils/ids'

export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')
  if (!idOrSlug) throw createError({ statusCode: 400, statusMessage: 'Board id is required' })

  await requireBoardAccess(event, idOrSlug)

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
  } catch (err) {
    if (err instanceof GraphifyError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    console.error('[repo/graph/search] unexpected error:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to search graph' })
  }
})
