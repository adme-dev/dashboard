/**
 * Get a file's contents from the connected GitHub repo.
 * GET /api/agency/boards/:id/repo/file?path=app/foo.vue
 *
 * Returns plaintext file content (small files) — used by AI tools.
 */

import { createError, getQuery, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getFile } from '~~/server/utils/github'

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

const MAX_FILE_BYTES = 200_000 // 200KB cap to keep AI prompts sane

export default eventHandler(async (event) => {
  await requireAuth(event)

  const idOrSlug = getRouterParam(event, 'id')
  if (!idOrSlug) throw createError({ statusCode: 400, statusMessage: 'Board id is required' })

  const path = (getQuery(event).path ?? '').toString().trim()
  if (!path) throw createError({ statusCode: 400, statusMessage: 'path query param is required' })
  if (path.includes('..')) throw createError({ statusCode: 400, statusMessage: 'path traversal not allowed' })

  // Resolve board → department_id
  const where = isUUID(idOrSlug) ? 'id = $1' : 'slug = $1'
  const dept = await queryOne<{ id: string }>(`SELECT id FROM departments WHERE ${where}`, [idOrSlug])
  if (!dept) throw createError({ statusCode: 404, statusMessage: 'Board not found' })

  try {
    const content = await getFile(dept.id, path)
    if (content.length > MAX_FILE_BYTES) {
      return {
        path,
        truncated: true,
        content: content.slice(0, MAX_FILE_BYTES),
        full_size: content.length,
      }
    }
    return { path, truncated: false, content, full_size: content.length }
  } catch (err: any) {
    throw createError({
      statusCode: err.message?.includes('GitHub 404') ? 404 : 500,
      statusMessage: err.message ?? 'Failed to fetch file',
    })
  }
})
