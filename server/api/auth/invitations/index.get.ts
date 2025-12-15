/**
 * List Team Invitations
 * GET /api/auth/invitations
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Only admins and owners can view invitations
  await requireRole(event, ['owner', 'admin'])

  const query = getQuery(event)
  const status = query.status as string || 'pending'

  try {
    const invitations = await queryRows(`
      SELECT
        i.id,
        i.email,
        i.user_role,
        i.department_ids,
        i.message,
        i.status,
        i.expires_at,
        i.created_at,
        i.accepted_at,
        inviter.name as inviter_name,
        inviter.email as inviter_email,
        accepter.name as accepted_by_name
      FROM team_invitations i
      JOIN team_members inviter ON i.invited_by = inviter.id
      LEFT JOIN team_members accepter ON i.accepted_by = accepter.id
      WHERE i.status = $1
      ORDER BY i.created_at DESC
    `, [status])

    // Get department names for each invitation
    const departmentIds = [...new Set(invitations.flatMap(i => i.department_ids || []))]
    let departmentsMap: Record<string, string> = {}

    if (departmentIds.length > 0) {
      const departments = await queryRows(`
        SELECT id, name FROM departments WHERE id = ANY($1)
      `, [departmentIds])
      departmentsMap = Object.fromEntries(departments.map(d => [d.id, d.name]))
    }

    return invitations.map(i => ({
      id: i.id,
      email: i.email,
      role: i.user_role,
      departments: (i.department_ids || []).map((id: string) => ({
        id,
        name: departmentsMap[id] || 'Unknown'
      })),
      message: i.message,
      status: i.status,
      expiresAt: i.expires_at,
      createdAt: i.created_at,
      acceptedAt: i.accepted_at,
      inviter: {
        name: i.inviter_name,
        email: i.inviter_email
      },
      acceptedBy: i.accepted_by_name ? { name: i.accepted_by_name } : null
    }))
  } catch (error) {
    console.error('Failed to fetch invitations:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch invitations'
    })
  }
})
