/**
 * DELETE /api/notifications/push/unsubscribe
 * Removes a push subscription identified by its endpoint URL.
 * Body: { endpoint: string }
 */

import { execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ endpoint?: string }>(event)

  if (!body?.endpoint) {
    throw createError({
      statusCode: 400,
      statusMessage: 'endpoint is required',
    })
  }

  // Scope by user_id so users can't delete each other's subscriptions
  await execute(
    `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
    [body.endpoint, user.id]
  )

  return { success: true }
})
