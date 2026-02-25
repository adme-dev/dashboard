/**
 * GET /api/agency/dashboard/preferences
 * Read user's dashboard widget configuration
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const row = await queryOne(
    `SELECT dashboard_preferences FROM team_members WHERE email = $1`,
    [user.email]
  )

  return {
    preferences: row?.dashboard_preferences || null
  }
})
