/**
 * DELETE /api/advisor/recommendations/:id/comments/:commentId
 *
 * Soft-delete (sets deleted_at = NOW()). Author or owner/admin only.
 * The audit event references the comment id; the body remains in the
 * row but is filtered from list responses.
 */

import { createError } from 'h3'
import { queryOne, query } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth, requireWriteAccess, hasRole } from '~~/server/utils/auth'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const user = await requireWriteAccess(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const recId = getRouterParam(event, 'id')
  const commentId = getRouterParam(event, 'commentId')
  if (!recId || !commentId) {
    throw createError({ statusCode: 400, statusMessage: 'Recommendation and comment IDs required' })
  }

  const existing = await queryOne<any>(
    `SELECT c.id, c.author_id, c.deleted_at
     FROM recommendation_comments c
     JOIN recommendations r ON r.id = c.recommendation_id
     WHERE c.id = $1 AND c.recommendation_id = $2 AND r.tenant_id = $3`,
    [commentId, recId, tenantId]
  )
  if (!existing || existing.deleted_at) {
    throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
  }

  const isAuthor = existing.author_id && user?.id && existing.author_id === user.id
  const isPrivileged = hasRole(user, ['owner', 'admin'])
  if (!isAuthor && !isPrivileged) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized to modify this comment' })
  }

  await queryOne(
    `UPDATE recommendation_comments SET deleted_at = NOW() WHERE id = $1 RETURNING id`,
    [commentId]
  )

  try {
    await query(
      `INSERT INTO recommendation_events (recommendation_id, event_type, actor_id, payload)
       VALUES ($1, 'comment_deleted', $2, $3)`,
      [recId, user?.id ?? null, JSON.stringify({ comment_id: commentId })]
    )
  } catch (err: any) {
    console.warn('[advisor] failed to log comment_deleted:', err?.message ?? err)
  }

  return { ok: true }
})
