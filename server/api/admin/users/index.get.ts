/**
 * Get all users for admin
 * GET /api/admin/users
 */

import { requireRole } from '../../../utils/auth'
import { queryRows } from '../../../utils/db'

type AdminUserRow = {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: string | null
  title: string | null
  is_active: boolean
  monday_user_id: string | null
  created_at: string
  updated_at: string
}

function userIdentityKey(user: AdminUserRow): string {
  const email = user.email?.trim().toLowerCase()
  return email ? `email:${email}` : `id:${user.id}`
}

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  try {
    const users = await queryRows<AdminUserRow>(`
      SELECT
        tm.id,
        tm.name,
        tm.email,
        tm.avatar_url,
        tm.user_role::text AS role,
        tm.role AS title,
        tm.is_active,
        tm.monday_user_id,
        tm.created_at,
        tm.updated_at
      FROM team_members tm
      ORDER BY
        CASE WHEN tm.is_active THEN 0 ELSE 1 END,
        tm.name ASC
    `)

    const canonicalUsers: AdminUserRow[] = []
    const canonicalIdBySourceId = new Map<string, string>()
    const seen = new Map<string, AdminUserRow>()

    for (const user of users) {
      const key = userIdentityKey(user)
      const canonical = seen.get(key)
      if (canonical) {
        canonicalIdBySourceId.set(user.id, canonical.id)
        continue
      }

      seen.set(key, user)
      canonicalUsers.push(user)
      canonicalIdBySourceId.set(user.id, user.id)
    }

    // Get teams for each user
    const userIds = Array.from(new Set(users.map(u => u.id)))
    const memberships = userIds.length > 0 ? await queryRows<{
      user_id: string
      team_id: string
      team_name: string
    }>(`
      SELECT 
        tms.team_member_id as user_id,
        t.id as team_id,
        t.name as team_name
      FROM team_memberships tms
      JOIN teams t ON t.id = tms.team_id
      WHERE tms.team_member_id = ANY($1)
    `, [userIds]) : []

    const teamsByUser = memberships.reduce((acc, m) => {
      const canonicalUserId = canonicalIdBySourceId.get(m.user_id) || m.user_id
      if (!acc[canonicalUserId]) acc[canonicalUserId] = []
      if (!acc[canonicalUserId].some(team => team.id === m.team_id)) {
        acc[canonicalUserId].push({ id: m.team_id, name: m.team_name })
      }
      return acc
    }, {} as Record<string, Array<{ id: string; name: string }>>)

    return {
      users: canonicalUsers.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatar_url,
        role: user.role || 'member',
        title: user.title,
        status: user.is_active ? 'active' : 'inactive',
        mondayUserId: user.monday_user_id,
        joinedAt: user.created_at,
        teams: teamsByUser[user.id] || [],
      }))
    }

  } catch (error: any) {
    console.error('[Admin Users] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch users: ${error.message}`
    })
  }
})
