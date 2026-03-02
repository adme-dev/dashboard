/**
 * Update a banner comment (resolve/unresolve, edit text)
 * PATCH /api/agency/banner-studio/comments/:id
 * Body: { text?, resolved? }
 */
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Comment ID is required' })
  }

  const body = await readBody(event)
  const { text, resolved } = body as { text?: string; resolved?: boolean }

  const updates: string[] = []
  const params: any[] = []
  let idx = 1

  if (typeof text === 'string' && text.trim()) {
    updates.push(`text = $${idx++}`)
    params.push(text.trim())
  }

  if (typeof resolved === 'boolean') {
    updates.push(`resolved = $${idx++}`)
    params.push(resolved)
    updates.push(`resolved_by = $${idx++}`)
    params.push(resolved ? user.id : null)
  }

  if (updates.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  updates.push(`updated_at = now()`)
  params.push(id)

  const row = await queryOne(`
    UPDATE banner_comments
    SET ${updates.join(', ')}
    WHERE id = $${idx}
    RETURNING
      id, project_id AS "projectId", format_key AS "formatKey",
      x, y, text, user_id AS "userId",
      parent_id AS "parentId", resolved, resolved_by AS "resolvedBy",
      created_at AS "createdAt", updated_at AS "updatedAt"
  `, params)

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
  }

  return row
})
