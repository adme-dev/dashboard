/**
 * PUT /api/agency/dashboard/preferences
 * Save user's dashboard widget configuration
 */

import { execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid preferences payload' })
  }

  const preferences = {
    widgets: Array.isArray(body.widgets) ? body.widgets : undefined,
    pinnedItems: Array.isArray(body.pinnedItems) ? body.pinnedItems : undefined,
  }

  await execute(
    `UPDATE team_members SET dashboard_preferences = $1::jsonb WHERE email = $2`,
    [JSON.stringify(preferences), user.email]
  )

  return { ok: true, preferences }
})
