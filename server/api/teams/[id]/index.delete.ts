/**
 * Delete a team (soft delete)
 * DELETE /api/teams/:id
 */

import { getRouterParam } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { queryOne } from '../../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const teamId = getRouterParam(event, 'id')

  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID required' })
  }

  // Check if system team
  const team = await queryOne('SELECT is_system FROM teams WHERE id = $1', [teamId])
  if (team?.is_system) {
    throw createError({ statusCode: 403, statusMessage: 'Cannot delete system teams' })
  }

  await queryOne(`
    UPDATE teams SET is_active = false WHERE id = $1
  `, [teamId])

  return { success: true }
})
