import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess, isSocialClientId } from '~~/server/utils/social/clientAccess'
import { recordSocialNewsFeedback, SOCIAL_NEWS_FEEDBACK_TYPES, type SocialNewsFeedbackType } from '~~/server/utils/socialNewsFeedback'

/** POST /api/agency/social/news/feedback — record an auditable client-scoped signal. */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const body = await readBody<{
    clientId?: string
    newsItemId?: string
    postId?: string | null
    platform?: string | null
    eventType?: SocialNewsFeedbackType
    metadata?: Record<string, unknown>
  }>(event)
  const clientId = body?.clientId || ''
  const newsItemId = body?.newsItemId || ''
  if (!isSocialClientId(clientId) || !isSocialClientId(newsItemId)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid clientId and newsItemId required' })
  }
  if (!body.eventType || !SOCIAL_NEWS_FEEDBACK_TYPES.includes(body.eventType)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid eventType required' })
  }
  await requireSocialClientAccess(event, clientId)
  const story = await queryOne<{ id: string }>('SELECT id FROM social_news_items WHERE id = $1', [newsItemId])
  if (!story) throw createError({ statusCode: 404, statusMessage: 'News item not found' })
  if (body.postId) {
    if (!isSocialClientId(body.postId)) throw createError({ statusCode: 400, statusMessage: 'Invalid postId' })
    const post = await queryOne<{ id: string }>('SELECT id FROM social_posts WHERE id = $1 AND client_id = $2', [body.postId, clientId])
    if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found for client' })
  }
  const row = await recordSocialNewsFeedback({
    clientId, newsItemId, postId: body.postId, platform: body.platform,
    actorId: user.id, eventType: body.eventType, metadata: body.metadata,
  })
  return { ok: true, id: row?.id || null }
})
