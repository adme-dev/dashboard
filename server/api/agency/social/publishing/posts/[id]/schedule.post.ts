import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { normalizeScheduledAt, requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'
import { recordSocialPublishingAudit } from '~~/server/utils/socialPublishing/audit'

/**
 * POST /api/agency/social/publishing/posts/:id/schedule
 * Explicitly schedule an approved post for dispatcher pickup.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const existing = await requireSocialPostClientAccess(event, id)
  if (!['approved', 'scheduled'].includes(existing.status ?? '')) {
    throw createError({ statusCode: 400, statusMessage: 'Post must be approved before scheduling' })
  }

  const body = await readBody(event)
  const scheduledAt = normalizeScheduledAt(body.scheduledAt)
  if (!scheduledAt) throw createError({ statusCode: 400, statusMessage: 'scheduledAt required' })
  if (new Date(scheduledAt).getTime() <= Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'scheduledAt must be in the future' })
  }
  const timezone = typeof body.timezone === 'string' && body.timezone.trim()
    ? body.timezone.trim()
    : null

  const row = await queryOne(
    `UPDATE social_posts
        SET status = 'scheduled',
            scheduled_at = $2,
            timezone = COALESCE($3, timezone),
            updated_at = NOW()
      WHERE id = $1
        AND client_id = $4
        AND status IN ('approved','scheduled')
      RETURNING *`,
    [id, scheduledAt, timezone, existing.client_id]
  )
  if (!row) throw createError({ statusCode: 409, statusMessage: 'Post is no longer approved for scheduling' })
  await recordSocialPublishingAudit({
    clientId: existing.client_id,
    postId: id,
    actorId: user.id,
    action: 'post_scheduled',
    metadata: { scheduledAt, timezone }
  })
  return row
})
