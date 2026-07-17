import { queryOne } from '~~/server/utils/db'

export const SOCIAL_NEWS_FEEDBACK_TYPES = [
  'selected', 'dismissed', 'rewritten', 'drafted', 'scheduled',
  'approval_requested', 'approved', 'rejected', 'revision_requested', 'published', 'failed', 'performance',
] as const

export type SocialNewsFeedbackType = typeof SOCIAL_NEWS_FEEDBACK_TYPES[number]

export async function recordSocialNewsFeedback(input: {
  clientId: string
  newsItemId: string
  postId?: string | null
  platform?: string | null
  actorId?: string | null
  eventType: SocialNewsFeedbackType
  metadata?: Record<string, unknown>
}) {
  return queryOne<{ id: string }>(
    `INSERT INTO social_news_feedback_events
       (client_id, news_item_id, post_id, platform, actor_id, event_type, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     RETURNING id`,
    [input.clientId, input.newsItemId, input.postId || null, input.platform || null,
      input.actorId || null, input.eventType, JSON.stringify(input.metadata || {})],
  )
}
