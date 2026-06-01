import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/agency/social/publishing/accounts?clientId=...
 * List a client's connected publishing accounts (page/profile tokens), never returning the raw token.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  return await queryRows(
    `SELECT id, client_id, platform, platform_account_id, account_name, is_active,
            last_error, token_expires_at, last_synced_at, created_at
       FROM social_accounts
      WHERE client_id = $1
      ORDER BY platform`,
    [clientId],
  )
})
