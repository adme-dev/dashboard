/**
 * Delete Avatar
 * DELETE /api/auth/avatar
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  await queryOne(`
    UPDATE team_members
    SET avatar_url = NULL, updated_at = NOW()
    WHERE id = $1
    RETURNING id
  `, [user.id])

  return {
    success: true,
    message: 'Avatar removed successfully'
  }
})
