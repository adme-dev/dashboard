/**
 * GET /api/admin/sidebar/badge-counts
 * Lightweight admin sidebar badge counts.
 */

import { requireRole } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

type BadgeCountRow = {
  users: string | number | null
  teams: string | number | null
  roles: string | number | null
}

const toCount = (value: string | number | null | undefined) => {
  const count = Number(value)
  return Number.isFinite(count) ? count : 0
}

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  try {
    const counts = await queryOne<BadgeCountRow>(`
      SELECT
        (SELECT COUNT(*) FROM team_members WHERE is_active = true) AS users,
        (SELECT COUNT(*) FROM teams) AS teams,
        (SELECT COUNT(*) FROM custom_roles) AS roles
    `)

    return {
      counts: {
        users: toCount(counts?.users),
        teams: toCount(counts?.teams),
        roles: toCount(counts?.roles)
      }
    }
  } catch (error: unknown) {
    console.error('[Admin Sidebar Badge Counts] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch admin sidebar badge counts: ${message}`
    })
  }
})
