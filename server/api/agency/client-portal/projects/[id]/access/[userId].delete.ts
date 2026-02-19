/**
 * Revoke Client Portal Project Access
 * DELETE /api/agency/client-portal/projects/:id/access/:userId
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const projectId = getRouterParam(event, 'id')
  const userId = getRouterParam(event, 'userId')

  if (!projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    })
  }

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  try {
    // Check if access record exists
    const existing = await queryOne(`
      SELECT cpa.id, cu.name as user_name, cu.email as user_email
      FROM client_project_access cpa
      JOIN client_users cu ON cpa.client_user_id = cu.id
      WHERE cpa.project_id = $1 AND cpa.client_user_id = $2
    `, [projectId, userId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Access record not found'
      })
    }

    // Revoke access
    await queryOne(`
      DELETE FROM client_project_access
      WHERE project_id = $1 AND client_user_id = $2
      RETURNING id
    `, [projectId, userId])

    return {
      success: true,
      message: `Access revoked for ${existing.user_name} (${existing.user_email})`
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to revoke project access:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to revoke project access'
    })
  }
})
