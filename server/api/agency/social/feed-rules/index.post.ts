import { requirePermission } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/** POST /api/agency/social/feed-rules — create an auto-draft rule. */
export default eventHandler(async (event) => {
  const user = await requirePermission(event, 'MEDIA_BUYING')
  const body = await readBody<{ clientId?: string; eventTypes?: string[]; captionTemplate?: string; notifySelf?: boolean }>(event)
  if (!body.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId is required' })
  const eventTypes = (body.eventTypes ?? ['new']).filter(t => ['new', 'listing', 'price_drop', 'offer'].includes(t))
  if (!eventTypes.length) throw createError({ statusCode: 400, statusMessage: 'At least one event type is required' })

  const rule = await queryOne(
    `INSERT INTO feed_post_rules (client_id, event_types, caption_template, notify_user_id, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, client_id, event_types, enabled, caption_template, notify_user_id, created_at`,
    [body.clientId, eventTypes, body.captionTemplate || null, body.notifySelf === false ? null : user.id, user.email],
  )
  return { rule }
})
