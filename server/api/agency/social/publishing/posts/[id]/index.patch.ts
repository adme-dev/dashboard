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
import { SOCIAL_POST_CONTENT_LOCKED_STATUSES } from '~~/server/utils/socialPublishing/revisions'

/**
 * PATCH /api/agency/social/publishing/posts/:id
 * Partial update of a post's editable fields (content, media, overrides, tags, schedule, …).
 *
 * Delegated (staff/MCP, `review_policy = 'delegated_marketing'`) rows: the review policy, revision
 * bindings and provenance metadata are server-controlled; media must be client-owned `mediaAssets`
 * (never URLs); exact targets cannot be widened through the legacy platform/account arrays; and every
 * approval-sensitive edit — including schedule, timezone and campaign — supersedes the submitted
 * revision and clears the approval it carried.
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
  'platformOverrides',
  'metadata'
])

// Snapshot fields that are additionally approval-sensitive for delegated rows.
const DELEGATED_SENSITIVE_FIELDS = new Set([...APPROVAL_SENSITIVE_FIELDS, 'scheduledAt', 'timezone', 'campaignId', 'mediaAssets'])

// Accepted/unknown dispatches are held evidence: never editable (and so never resubmittable).
const CONTENT_LOCKED_STATUSES = new Set<string>(SOCIAL_POST_CONTENT_LOCKED_STATUSES)
const APPROVAL_RESET_STATUSES = new Set(['approved', 'scheduled', 'failed'])

function sameSet(left: unknown, right: unknown): boolean {
  const a = new Set(Array.isArray(left) ? left.map(String) : [])
  const b = new Set(Array.isArray(right) ? right.map(String) : [])
  return a.size === b.size && [...a].every(value => b.has(value))
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const b = await readBody(event)
  assertNoControlledSocialPostFields(b)
  const existing = await requireSocialPostClientAccess(event, id)
  const delegated = existing.review_policy === 'delegated_marketing'

  if (delegated) {
    // Server-owned provenance: the composer's metadata echo is ignored, never merged.
    delete b.metadata
    if ('mediaUrls' in b) {
      if (Array.isArray(b.mediaUrls) && b.mediaUrls.length) {
        throw createError({ statusCode: 400, statusMessage: 'Delegated drafts use client media assets, not media URLs' })
      }
      delete b.mediaUrls
    }
    if (b.platformOverrides && typeof b.platformOverrides === 'object'
      && Object.values(b.platformOverrides as Record<string, { mediaUrls?: unknown[] }>).some(o => Array.isArray(o?.mediaUrls) && o.mediaUrls.length)) {
      throw createError({ statusCode: 400, statusMessage: 'Delegated drafts use client media assets, not media URLs' })
    }
    if (!('targets' in b) && ('platforms' in b || 'accountIds' in b)) {
      const unchanged = (!('platforms' in b) || sameSet(b.platforms, existing.platforms))
        && (!('accountIds' in b) || sameSet(b.accountIds, existing.account_ids))
      if (!unchanged) {
        throw createError({ statusCode: 400, statusMessage: 'Delegated drafts publish to exact targets; send targets to change accounts' })
      }
      delete b.platforms
      delete b.accountIds
    }
    if ('mediaAssets' in b) {
      const { normalizeSocialMediaAssetRefs, resolveSocialMediaAssets } = await import('~~/server/utils/socialPublishing/mediaAssets')
      const refs = normalizeSocialMediaAssetRefs(b.mediaAssets)
      await resolveSocialMediaAssets({ event, clientId: existing.client_id, refs })
      b.mediaAssets = refs
    }
  } else if ('mediaAssets' in b) {
    throw createError({ statusCode: 400, statusMessage: 'mediaAssets is only available for delegated drafts' })
  }

  if ('targets' in b) {
    const explicitTargets = await normalizePublishingTargets(existing.client_id, b.targets)
    if (!explicitTargets) {
      throw createError({ statusCode: 400, statusMessage: 'targets must be an array' })
    }
    if (delegated && explicitTargets.platforms.some(platform => !['facebook', 'instagram', 'linkedin'].includes(platform))) {
      throw createError({ statusCode: 400, statusMessage: 'Delegated drafts support Facebook, Instagram and LinkedIn' })
    }
    b.targets = explicitTargets.targets
    b.platforms = explicitTargets.platforms
    b.accountIds = explicitTargets.accountIds
  } else if ('platforms' in b) {
    b.platforms = normalizeProductionReadyPublishPlatforms(b.platforms)
  }
  normalizeSocialPostPayloadFields(b)
  if ('metadata' in b && existing.metadata?.source === 'mcp_news') {
    const requestedMetadata = b.metadata && typeof b.metadata === 'object' && !Array.isArray(b.metadata)
      ? b.metadata as Record<string, unknown>
      : {}
    b.metadata = {
      ...requestedMetadata,
      source: existing.metadata.source,
      newsItemId: existing.metadata.newsItemId,
      newsAttribution: existing.metadata.newsAttribution
    }
  }
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

  const sensitiveFields = delegated ? DELEGATED_SENSITIVE_FIELDS : APPROVAL_SENSITIVE_FIELDS
  const touchesApprovalSensitiveFields = Object.keys(b).some(key => sensitiveFields.has(key))
  if (touchesApprovalSensitiveFields && existing.status && CONTENT_LOCKED_STATUSES.has(existing.status)) {
    throw createError({ statusCode: 409, statusMessage: `Cannot edit content for a ${existing.status} post` })
  }
  const shouldResetApproval = touchesApprovalSensitiveFields && (
    delegated
    || Boolean(existing.approval_requested_at)
    || (existing.status ? APPROVAL_RESET_STATUSES.has(existing.status) : false)
  )
  const shouldResetClientApproval = shouldResetApproval
    && existing.metadata?.source === 'mcp_news'
    && Boolean(existing.client_approval_status)

  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, def] of Object.entries(FIELDS)) {
    if (!(key in b)) continue
    params.push(def.json ? JSON.stringify(b[key] ?? {}) : b[key])
    sets.push(`${def.col} = $${params.length}${def.json ? '::jsonb' : ''}`)
  }
  if (delegated && 'mediaAssets' in b) {
    params.push(JSON.stringify(b.mediaAssets))
    sets.push(`media_asset_refs = $${params.length}::jsonb`)
  }
  if (shouldResetApproval) {
    sets.push(
      'status = \'draft\'',
      'approved_by = NULL',
      'approved_at = NULL',
      'approval_requested_at = NULL',
      'approval_requested_by = NULL',
      'rejection_reason = NULL',
      'approved_revision_id = NULL',
      'client_approval_revision_id = NULL'
    )
  }
  if (shouldResetClientApproval) {
    sets.push(
      'client_approval_status = \'pending\'',
      'client_approval_responded_by = NULL',
      'client_approval_responded_at = NULL',
      'client_approval_feedback = NULL'
    )
  }
  if (sets.length === 0) throw createError({ statusCode: 400, statusMessage: 'No updatable fields provided' })

  sets.push('updated_at = NOW()')
  params.push(id)
  params.push(existing.client_id)
  // The superseding CTE shares the row's id/client params, so it commits atomically with the edit.
  const supersede = shouldResetApproval
    ? `WITH superseded AS (
         UPDATE social_post_revisions SET review_status = 'superseded'
          WHERE post_id = $${params.length - 1} AND client_id = $${params.length}
            AND review_status IN ('pending', 'approved')
       ) `
    : ''
  const lockedGuard = shouldResetApproval
    ? ` AND status NOT IN (${[...CONTENT_LOCKED_STATUSES].map(status => `'${status}'`).join(', ')})`
    : ''
  const row = await queryOne(
    `${supersede}UPDATE social_posts SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND client_id = $${params.length}${lockedGuard} RETURNING *`,
    params
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  await recordSocialPublishingAudit({
    clientId: existing.client_id,
    postId: id,
    actorId: user.id,
    action: 'post_updated',
    metadata: {
      fields: Object.keys(b).filter(key => key in FIELDS || key === 'mediaAssets'),
      approvalReset: shouldResetApproval,
      clientApprovalReset: shouldResetClientApproval
    }
  })
  return row
})
