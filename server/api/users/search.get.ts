/**
 * Search team members for @mentions
 * GET /api/users/search?q=query&taskId=xxx&limit=15
 *
 * Returns active team members matching the search query.
 */

import { createError, getQuery } from 'h3'
import { requireAuth } from '../../utils/auth'
import { queryRows } from '../../utils/db'

interface MentionSuggestion {
  id: string
  name: string
  type: string
  category: string
  icon: string
  subtitle: string | null
  avatar_url: string | null
  is_team: boolean
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const search = (query.q as string || '').trim()
  const limit = Math.min(parseInt(query.limit as string) || 12, 20)

  try {
    // Escape ILIKE wildcards in user input
    const escaped = search.replace(/%/g, '\\%').replace(/_/g, '\\_')

    if (!escaped) {
      // Empty query — return all active team members
      const suggestions = await queryRows<MentionSuggestion>(`
        SELECT
          tm.id::TEXT        AS id,
          tm.name            AS name,
          'user'             AS type,
          'person'           AS category,
          'i-lucide-user'    AS icon,
          tm.email           AS subtitle,
          tm.avatar_url      AS avatar_url,
          false              AS is_team
        FROM team_members tm
        WHERE tm.is_active = true
        ORDER BY tm.name
        LIMIT $1
      `, [limit])

      return { suggestions }
    }

    // Search by name prefix, first-name prefix, or email prefix
    const suggestions = await queryRows<MentionSuggestion>(`
      SELECT
        tm.id::TEXT        AS id,
        tm.name            AS name,
        'user'             AS type,
        'person'           AS category,
        'i-lucide-user'    AS icon,
        tm.email           AS subtitle,
        tm.avatar_url      AS avatar_url,
        false              AS is_team
      FROM team_members tm
      WHERE tm.is_active = true
        AND (
          tm.name ILIKE $1 || '%'
          OR SPLIT_PART(tm.name, ' ', 1) ILIKE $1 || '%'
          OR tm.email ILIKE $1 || '%'
        )
      ORDER BY
        CASE WHEN tm.name ILIKE $1 || '%' THEN 0 ELSE 1 END,
        tm.name
      LIMIT $2
    `, [escaped, limit])

    return { suggestions }
  } catch (error: any) {
    console.error('Failed to search mentions:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to search mentions: ${error.message}`
    })
  }
})
