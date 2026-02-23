/**
 * Create new team
 * POST /api/admin/teams
 */

import { requireAuth } from '../../../utils/auth'
import { queryOne } from '../../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { name, color = '#3B82F6', icon = 'users' } = body

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Team name required' })
  }

  try {
    const team = await queryOne<{
      id: string
      name: string
      color: string
      icon: string
      created_at: string
    }>(`
      INSERT INTO teams (name, color, icon, is_system)
      VALUES ($1, $2, $3, false)
      RETURNING id, name, color, icon, created_at
    `, [name, color, icon])

    return {
      success: true,
      team: {
        id: team!.id,
        name: team!.name,
        color: team!.color,
        icon: team!.icon,
        memberCount: 0,
        createdAt: team!.created_at,
      }
    }

  } catch (error: any) {
    console.error('[Admin Teams Create] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create team: ${error.message}`
    })
  }
})
