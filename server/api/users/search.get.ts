/**
 * Search users and teams for @mentions
 * GET /api/users/search?q=query&taskId=xxx
 * 
 * Returns both individual users and custom teams (like Monday.com)
 */

import { createError, getQuery } from 'h3'
import { requireAuth } from '../../utils/auth'
import { queryRows, queryOne } from '../../utils/db'

interface MentionSuggestion {
  id: string
  name: string
  type: 'user' | 'team' | 'board' | 'item' | 'workspace' | 'company' | 'here' | 'channel'
  category: 'person' | 'team' | 'special'
  icon: string
  subtitle?: string
  avatar_url?: string | null
  is_team: boolean
  color?: string | null
  member_count?: number | null
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const search = (query.q as string || '').trim().toLowerCase()
  const taskId = query.taskId as string
  const boardId = query.boardId as string
  const limit = Math.min(parseInt(query.limit as string) || 12, 20)

  try {
    // Use the new v2 function that includes custom teams
    const suggestions = await queryRows<MentionSuggestion>(`
      SELECT * FROM get_mention_suggestions_v2($1, $2::uuid, $3::uuid, $4)
    `, [search, taskId || null, boardId || null, limit])

    // If empty query or just "@", show all teams first
    if (search === '' || search === '@') {
      const allSuggestions = await queryRows<MentionSuggestion>(`
        -- Custom Teams first
        SELECT 
          t.id::TEXT,
          t.name,
          'team'::VARCHAR(50) as type,
          'team'::VARCHAR(50) as category,
          t.icon::VARCHAR(50),
          t.description as subtitle,
          true as is_team,
          t.color,
          (SELECT COUNT(*)::INTEGER FROM team_memberships tm WHERE tm.team_id = t.id)
        FROM teams t
        WHERE t.is_active = true
        ORDER BY t.is_system DESC, t.name
        LIMIT 8
        
        UNION ALL
        
        -- Then some active users
        SELECT 
          tm.id::TEXT,
          tm.name,
          'user'::VARCHAR(50) as type,
          'person'::VARCHAR(50) as category,
          'i-lucide-user'::VARCHAR(50) as icon,
          tm.email as subtitle,
          false as is_team,
          NULL::TEXT,
          NULL::INTEGER
        FROM team_members tm
        WHERE tm.is_active = true
        ORDER BY tm.name
        LIMIT 5
      `, [])
      
      return { suggestions: allSuggestions }
    }

    return { suggestions }

  } catch (error: any) {
    console.error('Failed to search mentions:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to search mentions: ${error.message}`
    })
  }
})
