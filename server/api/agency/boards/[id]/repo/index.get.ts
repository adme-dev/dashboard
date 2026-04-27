/**
 * Get the repo connection for a board (no token returned).
 * GET /api/agency/boards/:id/repo
 *
 * AuthZ: caller must have board access.
 */

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireBoardAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { isUUID } from '~~/server/utils/ids'

export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')
  if (!idOrSlug) throw createError({ statusCode: 400, statusMessage: 'Board id is required' })

  await requireBoardAccess(event, idOrSlug)

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

  return { connected: row !== null, repo: row }
})
