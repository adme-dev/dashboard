// server/api/email/subscribers/[id]/history.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })

  const subscriber = await queryOne<{
    id: string
    email: string
    name: string | null
    status: string
    soft_bounce_count: number
    last_soft_bounce_at: string | null
    client_id: string | null
    created_at: string
    updated_at: string
  }>(`
    SELECT id, email, name, status, soft_bounce_count, last_soft_bounce_at, client_id, created_at, updated_at
    FROM email_subscribers
    WHERE id = $1
  `, [id])

  if (!subscriber) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, subscriber.client_id)

  const [lists, consentEvents, suppressionEvents, campaignEvents] = await Promise.all([
    queryRows(`
      SELECT
        sl.list_id,
        el.name AS list_name,
        sl.status,
        sl.source,
        sl.subscribed_at,
        sl.unsubscribed_at
      FROM subscriber_lists sl
      JOIN email_lists el ON el.id = sl.list_id
      WHERE sl.subscriber_id = $1
      ORDER BY el.name ASC
    `, [id]),
    queryRows(`
      SELECT
        id,
        subscriber_id,
        email,
        list_id,
        campaign_id,
        event_type,
        source,
        actor_user_id,
        ip_address,
        user_agent,
        metadata,
        occurred_at
      FROM email_consent_events
      WHERE subscriber_id = $1 OR email = $2
      ORDER BY occurred_at DESC
      LIMIT 100
    `, [id, subscriber.email]),
    queryRows(`
      SELECT
        id,
        email,
        subscriber_id,
        campaign_id,
        reason,
        action,
        source,
        actor_user_id,
        metadata,
        occurred_at
      FROM suppression_events
      WHERE subscriber_id = $1 OR email = $2
      ORDER BY occurred_at DESC
      LIMIT 100
    `, [id, subscriber.email]),
    queryRows(`
      SELECT
        ee.id,
        ee.campaign_id,
        c.name AS campaign_name,
        ee.subscriber_id,
        ee.event_type,
        ee.url,
        ee.raw,
        ee.occurred_at
      FROM email_events ee
      LEFT JOIN campaigns c ON c.id = ee.campaign_id
      WHERE ee.subscriber_id = $1
      ORDER BY ee.occurred_at DESC
      LIMIT 100
    `, [id])
  ])

  return {
    subscriber,
    lists,
    consent_events: consentEvents,
    suppression_events: suppressionEvents,
    campaign_events: campaignEvents
  }
})
