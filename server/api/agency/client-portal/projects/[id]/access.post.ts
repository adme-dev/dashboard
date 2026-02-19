/**
 * Grant Client Portal Project Access
 * POST /api/agency/client-portal/projects/:id/access
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface GrantAccessBody {
  clientUserId: string
  accessLevel?: 'view' | 'comment' | 'approve' | 'full'
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    })
  }

  const body = await readBody<GrantAccessBody>(event)

  if (!body.clientUserId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client user ID is required'
    })
  }

  try {
    // Verify project exists
    const project = await queryOne(`
      SELECT id, client_id FROM projects WHERE id = $1
    `, [projectId])

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    // Verify client user exists and belongs to the project's client
    const clientUser = await queryOne(`
      SELECT id, name, email, client_id FROM client_users WHERE id = $1
    `, [body.clientUserId])

    if (!clientUser) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client user not found'
      })
    }

    if (clientUser.client_id !== project.client_id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Client user does not belong to this project\'s client'
      })
    }

    // Check if access already exists
    const existingAccess = await queryOne(`
      SELECT id FROM client_project_access
      WHERE project_id = $1 AND client_user_id = $2
    `, [projectId, body.clientUserId])

    if (existingAccess) {
      throw createError({
        statusCode: 409,
        statusMessage: 'User already has access to this project'
      })
    }

    // Grant access
    const access = await queryOne(`
      INSERT INTO client_project_access (
        project_id,
        client_user_id,
        access_level,
        granted_by
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [
      projectId,
      body.clientUserId,
      body.accessLevel || 'view',
      user.id
    ])

    return {
      success: true,
      access: {
        accessId: access.id,
        projectId: access.project_id,
        userId: access.client_user_id,
        userName: clientUser.name,
        userEmail: clientUser.email,
        accessLevel: access.access_level,
        grantedAt: access.granted_at,
        grantedBy: user.id
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to grant project access:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to grant project access'
    })
  }
})
