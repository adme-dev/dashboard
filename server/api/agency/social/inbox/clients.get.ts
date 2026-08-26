import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export interface SocialInboxClientOption {
  id: string
  name: string
  active_account_count: number
}

/**
 * GET /api/agency/social/inbox/clients
 * Clients the agency is actually managing in the engagement inbox — those with at least one
 * active (connected) social account. Inactive / disconnected accounts do not qualify, so a
 * client whose pages were all deactivated drops out of the picker. Inbox Settings keeps the
 * full client list because that is where new accounts get connected.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  return await queryRows<SocialInboxClientOption>(
    `SELECT c.id, c.name, COUNT(a.id)::int AS active_account_count
       FROM agency_clients c
       JOIN social_accounts a ON a.client_id = c.id AND a.is_active = TRUE
      WHERE c.is_active = TRUE
      GROUP BY c.id, c.name
      ORDER BY c.name ASC`
  )
})
