import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute, queryRows } from '~~/server/utils/db'
import { kvDelete } from '~~/server/utils/kv'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const conn = await queryOne<{ id: string; account_name: string; platform: string; google_credential_profile_id: string | null }>(
    `SELECT id, account_name, platform, google_credential_profile_id
     FROM social_connections WHERE id = $1`,
    [id]
  )
  if (!conn) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })

  // Get affected periods before disconnecting
  const periods = await queryRows<{ period: string }>(
    `SELECT DISTINCT period FROM media_spend WHERE connection_id = $1`,
    [id]
  )
  const credentialProfiles = conn.platform === 'google'
    ? await queryRows<{ profile_id: string }>(
        `SELECT profile_id FROM google_credential_profile_accounts WHERE connection_id = $1`,
        [id]
      )
    : []

  // Nullify connection_id on media_spend (preserve spend data)
  await execute(`UPDATE media_spend SET connection_id = NULL WHERE connection_id = $1`, [id])
  // Delete connection (cascades to ad_account_client_map)
  await execute(`DELETE FROM social_connections WHERE id = $1`, [id])
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

  // Bust KV cache for all affected periods
  const kvPlatform = conn.platform === 'google_ads' ? 'google' : conn.platform
  const deletes = periods.flatMap(({ period }) => [
    kvDelete(event, `spend:summary:${period}:all`),
    kvDelete(event, `spend:summary:${period}:${conn.platform}`),
    kvDelete(event, `spend:${kvPlatform}:accounts:${period}`),
    kvDelete(event, `spend:daily:${kvPlatform}:${period}`),
  ])
  Promise.all(deletes).catch(() => {})

  return { deleted: true, platform: conn.platform, accountName: conn.account_name }
})
