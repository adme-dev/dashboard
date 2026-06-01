import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

/**
 * POST /api/agency/social/publishing/posts
 * Create a social post draft (or scheduled post) for a client.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const b = await readBody(event)
  if (!b.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const row = await queryOne(
    `INSERT INTO social_posts (
       client_id, created_by, content, media_urls, link_url, hashtags, first_comment,
       platforms, account_ids, platform_overrides, tags, scheduled_at, timezone, status, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      b.clientId,
      user.id,
      b.content ?? '',
      b.mediaUrls ?? null,
      b.linkUrl ?? null,
      b.hashtags ?? null,
      b.firstComment ?? null,
      b.platforms ?? [],
      b.accountIds ?? null,
      JSON.stringify(b.platformOverrides ?? {}),
      b.tags ?? null,
      b.scheduledAt ?? null,
      b.timezone ?? 'Australia/Sydney',
      b.status ?? 'draft',
      JSON.stringify(b.metadata ?? {}),
    ],
  )
  return row
})
