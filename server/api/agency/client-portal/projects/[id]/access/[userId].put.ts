/**
 * Update Client Portal Project Access Level
 * PUT /api/agency/client-portal/projects/:id/access/:userId
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateAccessBody {
  accessLevel: 'view' | 'comment' | 'approve' | 'full'
}

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

  const body = await readBody<UpdateAccessBody>(event)

  if (!body.accessLevel) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Access level is required'
    })
  }

  const validLevels = ['view', 'comment', 'approve', 'full']
  if (!validLevels.includes(body.accessLevel)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid access level. Must be: view, comment, approve, or full'
    })
  }

  try {
    // Check if access record exists
    const existing = await queryOne(`
      SELECT cpa.id, cu.name as user_name
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

    // Update access level
    const access = await queryOne(`
      UPDATE client_project_access
      SET access_level = $1, updated_at = NOW()
      WHERE project_id = $2 AND client_user_id = $3
      RETURNING *
    `, [body.accessLevel, projectId, userId])

    return {
      success: true,
      access: {
        accessId: access.id,
        projectId: access.project_id,
        userId: access.client_user_id,
        userName: existing.user_name,
        accessLevel: access.access_level,
        grantedAt: access.granted_at,
        updatedAt: access.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update project access:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update project access'
    })
  }
})
