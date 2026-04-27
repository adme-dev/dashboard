/**
 * Get a file's contents from the connected GitHub repo.
 * GET /api/agency/boards/:id/repo/file?path=app/foo.vue
 *
 * AuthZ: caller must have board access (the connected PAT may grant
 * read on a private repo, so we don't expose this to non-members).
 *
 * Returns plaintext file content (200KB cap) — used by AI tools.
 */

import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { requireBoardAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getFile, GithubError } from '~~/server/utils/github'
import { isUUID } from '~~/server/utils/ids'

const MAX_FILE_BYTES = 200_000

export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')
  if (!idOrSlug) throw createError({ statusCode: 400, statusMessage: 'Board id is required' })

  await requireBoardAccess(event, idOrSlug)

  const path = (getQuery(event).path ?? '').toString().trim()
  if (!path) throw createError({ statusCode: 400, statusMessage: 'path query param is required' })
  if (path.startsWith('/') || path.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'invalid path' })
  }

  const where = isUUID(idOrSlug) ? 'id = $1' : 'slug = $1'
  const dept = await queryOne<{ id: string }>(`SELECT id FROM departments WHERE ${where}`, [idOrSlug])
  if (!dept) throw createError({ statusCode: 404, statusMessage: 'Board not found' })

  try {
    const content = await getFile(dept.id, path)
    if (content.length > MAX_FILE_BYTES) {
      return { path, truncated: true, content: content.slice(0, MAX_FILE_BYTES), full_size: content.length }
    }
    return { path, truncated: false, content, full_size: content.length }
  } catch (err) {
    if (err instanceof GithubError) {
      // GithubError messages are pre-sanitized for client display.
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    console.error('[repo/file] unexpected error:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch file' })
  }
})
