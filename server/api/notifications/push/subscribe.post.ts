/**
 * POST /api/notifications/push/subscribe
 * Persists a browser push subscription for the authenticated user.
 * Idempotent on (endpoint) — repeat calls update keys + last_used_at.
 */

import { execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { isValidPushEndpoint } from '~~/server/utils/pushSubscriptionValidation'

interface SubscribeBody {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<SubscribeBody>(event)

  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    throw createError({
      statusCode: 400,
      statusMessage: 'endpoint, keys.p256dh, and keys.auth are required',
    })
  }

  if (!isValidPushEndpoint(body.endpoint)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'endpoint is not from a recognised push service',
    })
  }

  const userAgent = getRequestHeader(event, 'user-agent') || null

  await execute(
    `
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key, user_agent)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (endpoint) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      p256dh_key = EXCLUDED.p256dh_key,
      auth_key = EXCLUDED.auth_key,
      user_agent = EXCLUDED.user_agent,
      last_used_at = NOW()
    `,
    [user.id, body.endpoint, body.keys.p256dh, body.keys.auth, userAgent]
  )

  return { success: true }
})
