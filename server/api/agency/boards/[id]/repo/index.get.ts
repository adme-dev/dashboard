/**
 * Get the repo connection for a board (no token returned).
 * GET /api/agency/boards/:id/repo
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const idOrSlug = getRouterParam(event, 'id')
  if (!idOrSlug) throw createError({ statusCode: 400, statusMessage: 'Board id is required' })

  const where = isUUID(idOrSlug) ? 'd.id = $1' : 'd.slug = $1'
  const row = await queryOne(
    `SELECT pr.id, pr.repo_url, pr.default_branch, pr.graphify_path,
            pr.graphify_last_synced_at, pr.updated_at,
            (pr.access_token_encrypted IS NOT NULL) AS has_token
       FROM project_repos pr
       JOIN departments d ON d.id = pr.department_id
      WHERE ${where}`,
    [idOrSlug],
  )

  return {
    connected: row !== null,
    repo: row,
  }
})
