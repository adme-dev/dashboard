/**
 * Get Team Members
 * GET /api/agency/team-members
 */

import { createError, getQuery } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const search = (query.search as string) || ''

  try {
    let searchCondition = ''
    const params: any[] = []

    if (search) {
      searchCondition = 'AND (name ILIKE $1 OR email ILIKE $1 OR role ILIKE $1)'
      params.push(`%${search}%`)
    }

    const members = await queryRows(`
      SELECT
        id,
        name,
        email,
        role,
        avatar_url as "avatarUrl",
        is_active as "isActive"
      FROM team_members
      WHERE is_active = true
      ${searchCondition}
      ORDER BY name ASC
    `, params)

    return {
      members: members.map((m: any) => ({
        ...m,
        initials: m.name
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2),
      })),
    }
  } catch (error: any) {
    console.error('Failed to fetch team members:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch team members: ${error.message}`,
    })
  }
})
