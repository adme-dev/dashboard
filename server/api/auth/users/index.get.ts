/**
 * List Team Members
 * GET /api/auth/users
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const includeInactive = query.includeInactive === 'true'
  const departmentId = query.departmentId as string | undefined

  try {
    let whereClause = includeInactive ? '1=1' : 'tm.is_active = true'
    const params: any[] = []
    let paramIdx = 1

    if (departmentId) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM department_members dm
        WHERE dm.team_member_id = tm.id AND dm.department_id = $${paramIdx}
      )`
      params.push(departmentId)
      paramIdx++
    }

    const users = await queryRows(`
      SELECT
        tm.id,
        tm.name,
        tm.email,
        tm.role,
        tm.user_role,
        tm.avatar_url,
        tm.department_id,
        tm.is_active,
        tm.email_verified,
        tm.last_login_at,
        tm.last_active_at,
        tm.created_at,
        d.name as department_name,
        d.color as department_color
      FROM team_members tm
      LEFT JOIN departments d ON tm.department_id = d.id
      WHERE ${whereClause}
      ORDER BY tm.name ASC
    `, params)

    // Get department memberships for each user
    const userIds = users.map(u => u.id)
    let departmentsMap: Record<string, any[]> = {}

    if (userIds.length > 0) {
      const memberships = await queryRows(`
        SELECT
          dm.team_member_id,
          dm.role as membership_role,
          dm.is_primary,
          d.id as department_id,
          d.name as department_name,
          d.color as department_color
        FROM department_members dm
        JOIN departments d ON dm.department_id = d.id
        WHERE dm.team_member_id = ANY($1) AND d.is_active = true
      `, [userIds])

      for (const m of memberships) {
        if (!departmentsMap[m.team_member_id]) {
          departmentsMap[m.team_member_id] = []
        }
        departmentsMap[m.team_member_id]!.push({
          id: m.department_id,
          name: m.department_name,
          color: m.department_color,
          role: m.membership_role,
          isPrimary: m.is_primary
        })
      }
    }

    return users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      jobRole: u.role, // "Designer", "Developer", etc.
      userRole: u.user_role, // "admin", "member", etc.
      avatarUrl: u.avatar_url,
      isActive: u.is_active,
      emailVerified: u.email_verified,
      lastLoginAt: u.last_login_at,
      lastActiveAt: u.last_active_at,
      createdAt: u.created_at,
      primaryDepartment: u.department_id ? {
        id: u.department_id,
        name: u.department_name,
        color: u.department_color
      } : null,
      departments: departmentsMap[u.id] || []
    }))
  } catch (error) {
    console.error('Failed to fetch users:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch users'
    })
  }
})
