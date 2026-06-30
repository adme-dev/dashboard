import { requireAuth } from '~~/server/utils/auth'
import { queryRows, execute } from '~~/server/utils/db'
import { refreshGoogleToken } from '~~/server/utils/googleAdsClient'
import { listGa4Properties } from '~~/server/utils/ga4Client'
import { resolveGoogleOAuthRuntimeConfig } from '~~/server/utils/googleOAuthRuntimeConfig'

/**
 * GET /api/agency/social/ga4/properties
 * Lists GA4 properties visible to each active ga4 connection, plus current
 * property→client mappings, for the picker UI.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)
  const config = resolveGoogleOAuthRuntimeConfig(event)

  const conns = await queryRows<{
    id: string; account_name: string; access_token: string
    refresh_token: string | null; token_expires_at: string | null
  }>(`SELECT id, account_name, access_token, refresh_token, token_expires_at
      FROM social_connections WHERE platform = 'ga4' AND status = 'active'`)

  // Per-connection sync health (last run/success/error), surfaced in the card.
  const statusRows = await queryRows<{
    connection_id: string; last_run_at: string | null; last_success_at: string | null; last_error: string | null
  }>(`SELECT connection_id, last_run_at, last_success_at, last_error FROM ga4_sync_status`)
  const statusByConn = new Map(statusRows.map(s => [s.connection_id, s]))

  const connections: Array<{
    connectionId: string; accountName: string
    properties: Array<{ accountName: string; propertyId: string; propertyDisplayName: string }>
    lastRunAt: string | null; lastSuccessAt: string | null; lastError: string | null
  }> = []
  for (const c of conns) {
    let token = c.access_token
    if (c.refresh_token && c.token_expires_at &&
        new Date(c.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
      const refreshed = await refreshGoogleToken(c.refresh_token, config.googleClientId, config.googleClientSecret)
      token = refreshed.access_token
      await execute(
        `UPDATE social_connections SET access_token=$1, token_expires_at=$2, updated_at=NOW() WHERE id=$3`,
        [token, new Date(Date.now() + (refreshed.expires_in || 3600) * 1000), c.id]
      )
    }
    const properties = await listGa4Properties(token).catch(() => [])
    const status = statusByConn.get(c.id)
    connections.push({
      connectionId: c.id, accountName: c.account_name, properties,
      lastRunAt: status?.last_run_at ?? null,
      lastSuccessAt: status?.last_success_at ?? null,
      lastError: status?.last_error ?? null
    })
  }

  const maps = await queryRows<{ property_id: string; client_id: string; property_display_name: string }>(
    `SELECT property_id, client_id, property_display_name FROM ga4_property_map`
  )

  return { connections, maps }
})
