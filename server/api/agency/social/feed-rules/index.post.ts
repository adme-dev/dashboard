import { requirePermission } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getDealerLink } from '~~/server/utils/feeds/dealerLinks'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const SUPPORTED_EVENT_TYPES = new Set(['new', 'listing'])
const MAX_CAPTION_LENGTH = 4000

/** POST /api/agency/social/feed-rules — create an auto-draft rule. */
export default eventHandler(async (event) => {
  const user = await requirePermission(event, 'MEDIA_BUYING')
  const rawBody = await readBody<unknown>(event)
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    throw createError({ statusCode: 400, statusMessage: 'Request body must be an object' })
  }
  const body = rawBody as { clientId?: string, eventTypes?: string[], captionTemplate?: string, notifySelf?: boolean }
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : undefined
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId is required' })
  await requireSocialClientAccess(event, clientId)

  const requestedEventTypes = body.eventTypes ?? ['new']
  if (!Array.isArray(requestedEventTypes) || requestedEventTypes.some(type => typeof type !== 'string' || !SUPPORTED_EVENT_TYPES.has(type))) {
    throw createError({ statusCode: 400, statusMessage: 'Only new and listing events are currently supported' })
  }
  const eventTypes = Array.from(new Set(requestedEventTypes))
  if (!eventTypes.length) throw createError({ statusCode: 400, statusMessage: 'At least one event type is required' })
  if (body.captionTemplate !== undefined && typeof body.captionTemplate !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'captionTemplate must be a string' })
  }
  const captionTemplate = body.captionTemplate?.trim() || null
  if (captionTemplate && captionTemplate.length > MAX_CAPTION_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `captionTemplate must be ${MAX_CAPTION_LENGTH} characters or fewer` })
  }
  if (body.notifySelf !== undefined && typeof body.notifySelf !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'notifySelf must be a boolean' })
  }
  if (!await getDealerLink(clientId)) {
    throw createError({ statusCode: 409, statusMessage: 'Client does not have an active dealer feed link' })
  }

  const rule = await queryOne(
    `INSERT INTO feed_post_rules (client_id, event_types, caption_template, notify_user_id, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, client_id, event_types, enabled, caption_template, notify_user_id, created_at`,
    [clientId, eventTypes, captionTemplate, body.notifySelf === false ? null : user.id, user.email]
  )
  return { rule }
})
