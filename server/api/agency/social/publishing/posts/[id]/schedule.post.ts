import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { normalizeScheduledAt, requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'
import { recordSocialPublishingAudit } from '~~/server/utils/socialPublishing/audit'
import { startSocialPublishingWorkflow } from '~~/server/utils/agencyWorkflows/client'

/**
 * POST /api/agency/social/publishing/posts/:id/schedule
 * Explicitly schedule an approved post for dispatcher pickup.
 *
 * A delegated (staff/MCP) approval covers one exact schedule: this endpoint can only re-arm the same
 * reviewed time — it never moves the time, approves new content or extends the approval's expiry.
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
  const delegated = existing.review_policy === 'delegated_marketing'
  // A delegated approval also covers its timezone, so only the reviewed value is kept.
  const timezone = !delegated && typeof body.timezone === 'string' && body.timezone.trim()
    ? body.timezone.trim()
    : null
  if (delegated) {
    const reviewed = existing.scheduled_at ? new Date(existing.scheduled_at).toISOString() : null
    if (reviewed !== scheduledAt) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This post was approved for a specific time. Edit the schedule and resubmit it for review.'
      })
    }
  }

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
  await startSocialPublishingWorkflow(event, {
    postId: id,
    clientId: existing.client_id,
    scheduledAt,
    trigger: 'schedule',
    requestedBy: user.id,
    ...(delegated && existing.approved_revision_id
      ? { revisionId: existing.approved_revision_id }
      : {})
  })
  return row
})
