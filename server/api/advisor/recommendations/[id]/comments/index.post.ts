/**
 * POST /api/advisor/recommendations/:id/comments
 *
 * Add a flat human comment to a recommendation. Emits a 'commented'
 * audit event referencing the comment id; comment body lives in the
 * comments table.
 */

import { createError } from 'h3'
import { z } from 'zod'
import { queryOne, query } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'

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
  if (!recId) {
    throw createError({ statusCode: 400, statusMessage: 'Recommendation ID required' })
  }

  // Tenant scoping: verify the rec belongs to this tenant before
  // letting anyone comment on it. Cheap query, removes the
  // cross-tenant write vector.
  const rec = await queryOne<any>(
    `SELECT id FROM recommendations WHERE id = $1 AND tenant_id = $2`,
    [recId, tenantId]
  )
  if (!rec) {
    throw createError({ statusCode: 404, statusMessage: 'Recommendation not found' })
  }

  const raw = await readBody<any>(event) ?? {}
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid request body',
    })
  }

  const inserted = await queryOne<any>(
    `INSERT INTO recommendation_comments (recommendation_id, author_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, recommendation_id, author_id, body, created_at, updated_at`,
    [recId, user?.id ?? null, parsed.data.body]
  )

  // Decorate with author name/avatar for immediate render in the
  // drawer, mirroring how the GET endpoint joins.
  const decorated = await queryOne<any>(
    `SELECT c.id, c.recommendation_id, c.author_id, c.body, c.created_at, c.updated_at,
            tm.name AS author_name, tm.avatar_url AS author_avatar_url
     FROM recommendation_comments c
     LEFT JOIN team_members tm ON tm.id = c.author_id
     WHERE c.id = $1`,
    [inserted.id]
  )

  // Audit event so the activity log shows "Paul commented".
  try {
    await query(
      `INSERT INTO recommendation_events (recommendation_id, event_type, actor_id, payload)
       VALUES ($1, 'commented', $2, $3)`,
      [recId, user?.id ?? null, JSON.stringify({ comment_id: inserted.id })]
    )
  } catch (err: any) {
    console.warn('[advisor] failed to log comment event:', err?.message ?? err)
  }

  return { comment: decorated }
})
