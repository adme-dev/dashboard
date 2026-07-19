import { requireAuth } from '~~/server/utils/auth'
import { execute, queryOne, queryRows } from '~~/server/utils/db'

/**
 * DELETE /api/agency/social/google/disconnect?connectionId=X
 * Removes a Google Ads connection
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const connectionId = String(query.connectionId || '')

  if (!connectionId) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
  }

  const conn = await queryOne<{ id: string; account_name: string; google_credential_profile_id: string | null }>(
    `SELECT id, account_name, google_credential_profile_id
     FROM social_connections WHERE id = $1 AND platform = 'google'`,
    [connectionId]
  )

  if (!conn) {
    throw createError({ statusCode: 404, statusMessage: 'Google Ads connection not found' })
  }
  const credentialProfiles = await queryRows<{ profile_id: string }>(
    `SELECT profile_id FROM google_credential_profile_accounts WHERE connection_id = $1`,
    [connectionId]
  )

  // Nullify connection_id on media_spend rows (preserve spend data)
  await execute(
    `UPDATE media_spend SET connection_id = NULL WHERE connection_id = $1`,
    [connectionId]
  )

  // Delete the connection (cascades to ad_account_client_map)
  await execute(
    `DELETE FROM social_connections WHERE id = $1`,
    [connectionId]
  )
  for (const profile of credentialProfiles) {
    await execute(
      `DELETE FROM google_credential_profiles gcp
       WHERE gcp.id = $1
         AND NOT EXISTS (
           SELECT 1 FROM google_credential_profile_accounts gcpa
           WHERE gcpa.profile_id = gcp.id
         )`,
      [profile.profile_id]
    )
  }

  return { deleted: true, accountName: conn.account_name }
})
