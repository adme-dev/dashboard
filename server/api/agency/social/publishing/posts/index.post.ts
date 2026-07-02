import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import {
  assertPublishingTargets,
  normalizePlatformOverrides,
  normalizePublishingTargets,
  normalizeProductionReadyPublishPlatforms,
  normalizeSocialPostPayloadFields
} from '~~/server/utils/socialPublishing/guards'
import { recordSocialPublishingAudit } from '~~/server/utils/socialPublishing/audit'

interface CreatedSocialPost {
  id: string
}

/**
 * POST /api/agency/social/publishing/posts
 * Create a social post draft (or scheduled post) for a client.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const b = await readBody(event)
  if (!b.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, b.clientId)
  const explicitTargets = await normalizePublishingTargets(b.clientId, b.targets)
  const platforms = explicitTargets?.platforms ?? normalizeProductionReadyPublishPlatforms(b.platforms)
  const accountIds = explicitTargets?.accountIds ?? await assertPublishingTargets(b.clientId, platforms, b.accountIds)
  normalizeSocialPostPayloadFields(b)
  const platformOverrides = normalizePlatformOverrides(b.platformOverrides ?? {})

  const row = await queryOne<CreatedSocialPost>(
    `INSERT INTO social_posts (
       client_id, created_by, content, media_urls, link_url, hashtags, first_comment,
       platforms, account_ids, platform_overrides, tags, scheduled_at, timezone, status, metadata,
       campaign_id, publish_targets
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      b.clientId,
      user.id,
      b.content ?? '',
      b.mediaUrls ?? null,
      b.linkUrl ?? null,
      b.hashtags ?? null,
      b.firstComment ?? null,
      platforms,
      accountIds.length ? accountIds : null,
      JSON.stringify(platformOverrides),
      b.tags ?? null,
      b.scheduledAt ?? null,
      b.timezone ?? 'Australia/Sydney',
      'draft',
      JSON.stringify(b.metadata ?? {}),
      b.campaignId ?? null,
      explicitTargets ? JSON.stringify(explicitTargets.targets) : null
    ]
  )
  if (row) {
    await recordSocialPublishingAudit({
      clientId: b.clientId,
      postId: row.id,
      actorId: user.id,
      action: 'post_created',
      metadata: { platforms, accountIds, scheduledAt: b.scheduledAt ?? null }
    })
  }
  return row
})
