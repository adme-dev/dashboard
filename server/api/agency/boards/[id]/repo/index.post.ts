/**
 * Connect a GitHub repo (and graphify path) to a board.
 * POST /api/agency/boards/:id/repo
 *
 * AuthZ: caller must (a) have board access AND (b) be owner/admin —
 * stored PATs are privilege-bearing.
 *
 * Body:
 *  - repoUrl       (required) GitHub repo URL — normalized before insert
 *  - accessToken   (required when creating; optional when updating an
 *                   existing connection — omit to keep the stored token)
 *  - defaultBranch (optional, default 'main')
 *  - graphifyPath  (optional) R2 key prefix where graphify-out lives
 */

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireBoardAccess, hasRole } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { encryptToken } from '~~/server/utils/tokenCrypto'
import { parseRepoUrl, normalizeRepoUrl, GithubError } from '~~/server/utils/github'
import { isUUID } from '~~/server/utils/ids'

export default defineEventHandler(async (event) => {
  const boardParam = getRouterParam(event, 'id')
  if (!boardParam) {
    throw createError({ statusCode: 400, statusMessage: 'Board id is required' })
  }

  const user = await requireBoardAccess(event, boardParam)
  if (!hasRole(user, ['owner', 'admin'])) {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required to connect a repo' })
  }

  // Resolve the board id post-auth (requireBoardAccess validates but doesn't return it)
  const where = isUUID(boardParam) ? 'id = $1' : 'slug = $1'
  const board = await queryOne<{ id: string }>(
    `SELECT id FROM departments WHERE ${where}`,
    [boardParam],
  )
  if (!board) throw createError({ statusCode: 404, statusMessage: 'Board not found' })

  const body = await readBody(event)
  const rawRepoUrl = (body?.repoUrl ?? '').toString().trim()
  const accessToken = (body?.accessToken ?? '').toString()
  const defaultBranch = (body?.defaultBranch ?? '').toString().trim() || 'main'
  const graphifyPath = body?.graphifyPath ? body.graphifyPath.toString().trim() : null

  if (!rawRepoUrl) throw createError({ statusCode: 400, statusMessage: 'repoUrl is required' })

  let repoUrl: string
  try {
    parseRepoUrl(rawRepoUrl) // validate shape
    repoUrl = normalizeRepoUrl(rawRepoUrl) // strip trailing /, .git, etc.
  } catch (err) {
    if (err instanceof GithubError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw createError({ statusCode: 400, statusMessage: 'repoUrl must be a GitHub repo URL' })
  }

  // If a row already exists for this (board, repo), token is optional —
  // omit means keep the stored one. New connections must supply a token.
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM project_repos WHERE department_id = $1 AND repo_url = $2',
    [board.id, repoUrl],
  )

  if (!existing && !accessToken) {
    throw createError({ statusCode: 400, statusMessage: 'accessToken is required for a new connection' })
  }

  if (accessToken) {
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
      [board.id, repoUrl, defaultBranch, ciphertext, iv, graphifyPath, user.id],
    )
  } else {
    // Keep stored token, update only metadata.
    await execute(
      `UPDATE project_repos
          SET default_branch = $3,
              graphify_path = COALESCE($4, graphify_path),
              updated_at = NOW()
        WHERE department_id = $1 AND repo_url = $2`,
      [board.id, repoUrl, defaultBranch, graphifyPath],
    )
  }

  const row = await queryOne(
    `SELECT id, repo_url, default_branch, graphify_path, graphify_last_synced_at, updated_at
       FROM project_repos
      WHERE department_id = $1 AND repo_url = $2`,
    [board.id, repoUrl],
  )

  return { success: true, repo: row }
})
