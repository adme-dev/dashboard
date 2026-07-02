import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import {
  assertNoControlledSocialPostFields,
  assertPublishingTargets,
  normalizePublishingTargets,
  normalizeProductionReadyPublishPlatforms,
  normalizePublishPlatforms,
  normalizeSocialPostPayloadFields,
  requireSocialPostClientAccess
} from '~~/server/utils/socialPublishing/guards'
import { recordSocialPublishingAudit } from '~~/server/utils/socialPublishing/audit'

/**
 * PATCH /api/agency/social/publishing/posts/:id
 * Partial update of a post's editable fields (content, media, overrides, tags, schedule, …).
 */

// body key → { column, json? }
const FIELDS: Record<string, { col: string, json?: boolean }> = {
  content: { col: 'content' },
  mediaUrls: { col: 'media_urls' },
  linkUrl: { col: 'link_url' },
  hashtags: { col: 'hashtags' },
  firstComment: { col: 'first_comment' },
  platforms: { col: 'platforms' },
  accountIds: { col: 'account_ids' },
  targets: { col: 'publish_targets', json: true },
  platformOverrides: { col: 'platform_overrides', json: true },
  tags: { col: 'tags' },
  scheduledAt: { col: 'scheduled_at' },
  timezone: { col: 'timezone' },
  queuePosition: { col: 'queue_position' },
  campaignId: { col: 'campaign_id' },
  assignedTo: { col: 'assigned_to' },
  dueAt: { col: 'due_at' },
  metadata: { col: 'metadata', json: true }
}

const APPROVAL_SENSITIVE_FIELDS = new Set([
  'content',
  'mediaUrls',
  'linkUrl',
  'hashtags',
  'firstComment',
  'platforms',
  'accountIds',
  'targets',
  'platformOverrides'
])

const CONTENT_LOCKED_STATUSES = new Set(['publishing', 'published', 'partially_published', 'cancelled'])
const APPROVAL_RESET_STATUSES = new Set(['approved', 'scheduled', 'failed'])

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const b = await readBody(event)
  assertNoControlledSocialPostFields(b)
  const existing = await requireSocialPostClientAccess(event, id)

  if ('targets' in b) {
    const explicitTargets = await normalizePublishingTargets(existing.client_id, b.targets)
    if (!explicitTargets) {
      throw createError({ statusCode: 400, statusMessage: 'targets must be an array' })
    }
    b.targets = explicitTargets.targets
    b.platforms = explicitTargets.platforms
    b.accountIds = explicitTargets.accountIds
  } else if ('platforms' in b) {
    b.platforms = normalizeProductionReadyPublishPlatforms(b.platforms)
  }
  normalizeSocialPostPayloadFields(b)
  if (!('targets' in b) && ('accountIds' in b || 'platforms' in b)) {
    const nextPlatforms = 'platforms' in b
      ? b.platforms
      : normalizePublishPlatforms(existing.platforms ?? [])
    b.accountIds = await assertPublishingTargets(
      existing.client_id,
      nextPlatforms,
      'accountIds' in b ? b.accountIds : existing.account_ids
    )
  }

  const touchesApprovalSensitiveFields = Object.keys(b).some(key => APPROVAL_SENSITIVE_FIELDS.has(key))
  if (touchesApprovalSensitiveFields && existing.status && CONTENT_LOCKED_STATUSES.has(existing.status)) {
    throw createError({ statusCode: 409, statusMessage: `Cannot edit content for a ${existing.status} post` })
  }
  const shouldResetApproval = touchesApprovalSensitiveFields && (
    Boolean(existing.approval_requested_at)
    || (existing.status ? APPROVAL_RESET_STATUSES.has(existing.status) : false)
  )

  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, def] of Object.entries(FIELDS)) {
    if (!(key in b)) continue
    params.push(def.json ? JSON.stringify(b[key] ?? {}) : b[key])
    sets.push(`${def.col} = $${params.length}${def.json ? '::jsonb' : ''}`)
  }
  if (shouldResetApproval) {
    sets.push(
      'status = \'draft\'',
      'approved_by = NULL',
      'approved_at = NULL',
      'approval_requested_at = NULL',
      'approval_requested_by = NULL',
      'rejection_reason = NULL'
    )
  }
  if (sets.length === 0) throw createError({ statusCode: 400, statusMessage: 'No updatable fields provided' })

  sets.push('updated_at = NOW()')
  params.push(id)
  params.push(existing.client_id)
  const row = await queryOne(
    `UPDATE social_posts SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND client_id = $${params.length} RETURNING *`,
    params
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  await recordSocialPublishingAudit({
    clientId: existing.client_id,
    postId: id,
    actorId: user.id,
    action: 'post_updated',
    metadata: {
      fields: Object.keys(b).filter(key => key in FIELDS),
      approvalReset: shouldResetApproval
    }
  })
  return row
})
