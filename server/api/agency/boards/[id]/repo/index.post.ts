/**
 * Connect a GitHub repo (and graphify path) to a board.
 * POST /api/agency/boards/:id/repo
 *
 * Body:
 *  - repoUrl       (required) GitHub repo URL
 *  - accessToken   (required) PAT — stored encrypted, never returned
 *  - defaultBranch (optional, default 'main')
 *  - graphifyPath  (optional) R2 key prefix where graphify-out lives
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { encryptToken } from '~~/server/utils/tokenCrypto'
import { parseRepoUrl } from '~~/server/utils/github'

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

async function resolveBoardId(idOrSlug: string): Promise<string | null> {
  if (isUUID(idOrSlug)) {
    const row = await queryOne<{ id: string }>('SELECT id FROM departments WHERE id = $1', [idOrSlug])
    return row?.id ?? null
  }
  const row = await queryOne<{ id: string }>('SELECT id FROM departments WHERE slug = $1', [idOrSlug])
  return row?.id ?? null
}

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const boardParam = getRouterParam(event, 'id')
  if (!boardParam) {
    throw createError({ statusCode: 400, statusMessage: 'Board id is required' })
  }

  const boardId = await resolveBoardId(boardParam)
  if (!boardId) {
    throw createError({ statusCode: 404, statusMessage: 'Board not found' })
  }

  const body = await readBody(event)
  const repoUrl = (body?.repoUrl ?? '').toString().trim()
  const accessToken = (body?.accessToken ?? '').toString()
  const defaultBranch = (body?.defaultBranch ?? 'main').toString().trim() || 'main'
  const graphifyPath = body?.graphifyPath ? body.graphifyPath.toString().trim() : null

  if (!repoUrl) throw createError({ statusCode: 400, statusMessage: 'repoUrl is required' })
  if (!accessToken) throw createError({ statusCode: 400, statusMessage: 'accessToken is required' })

  // Validates URL shape early
  try {
    parseRepoUrl(repoUrl)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'repoUrl must be a GitHub repo URL' })
  }

  const { ciphertext, iv } = await encryptToken(accessToken)

  await execute(
    `INSERT INTO project_repos (department_id, repo_url, default_branch, access_token_encrypted, token_iv, graphify_path, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (department_id, repo_url) DO UPDATE
       SET default_branch = EXCLUDED.default_branch,
           access_token_encrypted = EXCLUDED.access_token_encrypted,
           token_iv = EXCLUDED.token_iv,
           graphify_path = COALESCE(EXCLUDED.graphify_path, project_repos.graphify_path),
           updated_at = NOW()`,
    [boardId, repoUrl, defaultBranch, ciphertext, iv, graphifyPath, user.id],
  )

  const row = await queryOne(
    `SELECT id, repo_url, default_branch, graphify_path, graphify_last_synced_at, updated_at
       FROM project_repos
      WHERE department_id = $1 AND repo_url = $2`,
    [boardId, repoUrl],
  )

  return {
    success: true,
    repo: row,
  }
})
