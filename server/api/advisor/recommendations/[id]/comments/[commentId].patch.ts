/**
 * PATCH /api/advisor/recommendations/:id/comments/:commentId
 *
 * Edit a comment body. Authorization: comment author OR the user
 * holds an owner/admin role. The shared-array `hasRole` bug fix
 * landed 2026-03-25; safe to use here.
 */

import { createError } from 'h3'
import { z } from 'zod'
import { queryOne, query } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth, requireWriteAccess, hasRole } from '~~/server/utils/auth'

const BodySchema = z.object({
  body: z.string().trim().min(1, 'Comment body required').max(10_000),
})

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

  // Look up the comment + parent rec in one trip; tenant-scoped.
  const existing = await queryOne<any>(
    `SELECT c.id, c.author_id, c.body, c.deleted_at
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

  const raw = await readBody<any>(event) ?? {}
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid request body',
    })
  }

  const updated = await queryOne<any>(
    `UPDATE recommendation_comments
     SET body = $1
     WHERE id = $2
     RETURNING id, recommendation_id, author_id, body, created_at, updated_at`,
    [parsed.data.body, commentId]
  )

  const decorated = await queryOne<any>(
    `SELECT c.id, c.recommendation_id, c.author_id, c.body, c.created_at, c.updated_at,
            tm.name AS author_name, tm.avatar_url AS author_avatar_url
     FROM recommendation_comments c
     LEFT JOIN team_members tm ON tm.id = c.author_id
     WHERE c.id = $1`,
    [updated.id]
  )

  try {
    await query(
      `INSERT INTO recommendation_events (recommendation_id, event_type, actor_id, payload)
       VALUES ($1, 'comment_edited', $2, $3)`,
      [recId, user?.id ?? null, JSON.stringify({ comment_id: commentId })]
    )
  } catch (err: any) {
    console.warn('[advisor] failed to log comment_edited:', err?.message ?? err)
  }

  return { comment: decorated }
})
