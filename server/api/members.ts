import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/members — active team members.
 *
 * Previously returned a hardcoded Nuxt-UI-template demo list (Benjamin
 * Canac et al.) with no auth. Now returns the real roster, auth-gated.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const rows = await queryRows<{
    name: string
    email: string
    user_role: string
    avatar_url: string | null
  }>(
    `SELECT name, email, user_role, avatar_url
       FROM team_members
      WHERE is_active = true
      ORDER BY name ASC`,
  )

  return rows.map(r => ({
    name: r.name,
    username: r.email.split('@')[0],
    role: r.user_role,
    avatar: r.avatar_url ? { src: r.avatar_url } : undefined,
  }))
})
