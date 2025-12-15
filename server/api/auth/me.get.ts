/**
 * Get Current User
 * GET /api/auth/me
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // Get full user data including departments
  const userData = await queryOne(`
    SELECT
      tm.id,
      tm.email,
      tm.name,
      tm.user_role,
      tm.avatar_url,
      tm.department_id,
      tm.timezone,
      tm.locale,
      tm.email_verified,
      tm.email_verified_at,
      tm.notification_preferences,
      tm.last_login_at,
      tm.created_at,
      d.name as department_name,
      d.color as department_color
    FROM team_members tm
    LEFT JOIN departments d ON tm.department_id = d.id
    WHERE tm.id = $1
  `, [user.id])

  if (!userData) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    })
  }

  // Get user's departments
  const departments = await queryOne(`
    SELECT
      json_agg(json_build_object(
        'id', d.id,
        'name', d.name,
        'slug', d.slug,
        'color', d.color,
        'icon', d.icon,
        'role', dm.role,
        'isPrimary', dm.is_primary
      )) as departments
    FROM department_members dm
    JOIN departments d ON dm.department_id = d.id
    WHERE dm.team_member_id = $1 AND d.is_active = true
  `, [user.id])

  return {
    id: userData.id,
    email: userData.email,
    name: userData.name,
    userRole: userData.user_role,
    avatarUrl: userData.avatar_url,
    timezone: userData.timezone,
    locale: userData.locale,
    emailVerified: userData.email_verified,
    emailVerifiedAt: userData.email_verified_at,
    notificationPreferences: userData.notification_preferences,
    lastLoginAt: userData.last_login_at,
    createdAt: userData.created_at,
    primaryDepartment: userData.department_id ? {
      id: userData.department_id,
      name: userData.department_name,
      color: userData.department_color
    } : null,
    departments: departments?.departments || []
  }
})
