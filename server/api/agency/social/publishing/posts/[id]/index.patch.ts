import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

/**
 * PATCH /api/agency/social/publishing/posts/:id
 * Partial update of a post's editable fields (content, media, overrides, tags, schedule, status, …).
 */

// body key → { column, json? }
const FIELDS: Record<string, { col: string; json?: boolean }> = {
  content: { col: 'content' },
  mediaUrls: { col: 'media_urls' },
  linkUrl: { col: 'link_url' },
  hashtags: { col: 'hashtags' },
  firstComment: { col: 'first_comment' },
  platforms: { col: 'platforms' },
  accountIds: { col: 'account_ids' },
  platformOverrides: { col: 'platform_overrides', json: true },
  tags: { col: 'tags' },
  scheduledAt: { col: 'scheduled_at' },
  timezone: { col: 'timezone' },
  status: { col: 'status' },
  queuePosition: { col: 'queue_position' },
  metadata: { col: 'metadata', json: true },
}

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const b = await readBody(event)

  const sets: string[] = []
  const params: any[] = []
  for (const [key, def] of Object.entries(FIELDS)) {
    if (!(key in b)) continue
    params.push(def.json ? JSON.stringify(b[key] ?? {}) : b[key])
    sets.push(`${def.col} = $${params.length}${def.json ? '::jsonb' : ''}`)
  }
  if (sets.length === 0) throw createError({ statusCode: 400, statusMessage: 'No updatable fields provided' })

  sets.push('updated_at = NOW()')
  params.push(id)
  const row = await queryOne(
    `UPDATE social_posts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  return row
})
