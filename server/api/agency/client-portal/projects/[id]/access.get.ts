/**
 * Get Client Portal Project Access List
 * GET /api/agency/client-portal/projects/:id/access
 *
 * Returns list of client users who have access to this project
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    })
  }

  try {
    // Verify project exists and get client info
    const project = await queryOne(`
      SELECT p.id, p.name, p.client_id, c.name as client_name
      FROM projects p
      LEFT JOIN agency_clients c ON p.client_id = c.id
      WHERE p.id = $1
    `, [projectId])

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    // Get users with explicit project access
    const accessList = await queryRows(`
      SELECT
        cpa.id as access_id,
        cpa.client_user_id,
        cpa.access_level,
        cpa.granted_at,
        cpa.granted_by,
        cu.name as user_name,
        cu.email as user_email,
        cu.role as user_role,
        cu.is_active,
        cu.last_login_at,
        granter.name as granted_by_name
      FROM client_project_access cpa
      JOIN client_users cu ON cpa.client_user_id = cu.id
      LEFT JOIN team_members granter ON cpa.granted_by = granter.id
      WHERE cpa.project_id = $1
      ORDER BY cpa.granted_at DESC
    `, [projectId])

    // Get all client users who could have access (for adding new access)
    const availableUsers = await queryRows(`
      SELECT
        cu.id,
        cu.name,
        cu.email,
        cu.role,
        cu.is_active
      FROM client_users cu
      WHERE cu.client_id = $1
        AND cu.is_active = true
        AND cu.id NOT IN (
          SELECT client_user_id FROM client_project_access WHERE project_id = $2
        )
      ORDER BY cu.name
    `, [project.client_id, projectId])

    return {
      project: {
        id: project.id,
        name: project.name,
        clientId: project.client_id,
        clientName: project.client_name
      },
      access: accessList.map(a => ({
        accessId: a.access_id,
        userId: a.client_user_id,
        userName: a.user_name,
        userEmail: a.user_email,
        userRole: a.user_role,
        isActive: a.is_active,
        accessLevel: a.access_level,
        grantedAt: a.granted_at,
        grantedBy: a.granted_by,
        grantedByName: a.granted_by_name,
        lastLoginAt: a.last_login_at
      })),
      availableUsers: availableUsers.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.is_active
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch project access:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch project access'
    })
  }
})
