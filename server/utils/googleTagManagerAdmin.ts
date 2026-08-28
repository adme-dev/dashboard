import { createError, type H3Event } from 'h3'
import { queryRows, queryOne, transaction } from '~~/server/utils/db'
import { GTM_CALLBACK_PATH, resolveGtmOAuthRuntimeConfig } from '~~/server/utils/googleTagManagerOAuthRuntimeConfig'

const GTM_QUOTA_BUDGET = 20
const GTM_QUOTA_WINDOW_SECONDS = 100

interface GtmConnectionAdminRow {
  id: string
  google_email: string
  connection_status: string
  credential_status: string
  token_expires_at: string | null
  scopes: string[]
  accessible_account_count: number
  binding_count: number
  last_discovered_at: string | null
  created_at: string
  connected_by_name: string | null
  connected_by_email: string | null
}

interface GtmBindingAdminRow {
  id: string
  tracking_site_id: string
  site_name: string
  client_id: string
  client_name: string
  connection_id: string
  google_email: string
  account_name: string
  container_name: string
  container_public_id: string
  domain_names: string[]
  last_live_version_path: string | null
  last_verified_at: string | null
  updated_at: string
  latest_change_status: string | null
  latest_change_at: string | null
}

interface GtmChangeAdminRow {
  id: string
  tracking_site_id: string
  site_name: string
  client_id: string
  client_name: string
  action_type: string
  status: string
  error_code: string | null
  error_message: string | null
  requested_at: string
  executed_at: string | null
}

export interface GtmAdminOverview {
  configuration: {
    oauthConfigured: boolean
    callbackPath: string
  }
  summary: {
    activeConnections: number
    linkedSites: number
    verifiedSites: number
    failedChanges: number
  }
  quota: {
    used: number
    budget: number
    windowSeconds: number
    windowStartedAt: string | null
  }
  connections: Array<{
    id: string
    googleEmail: string
    status: string
    credentialStatus: string
    tokenExpiresAt: string | null
    scopes: string[]
    accessibleAccountCount: number
    bindingCount: number
    lastDiscoveredAt: string | null
    createdAt: string
    connectedBy: { name: string | null, email: string | null }
  }>
  bindings: Array<{
    id: string
    trackingSiteId: string
    siteName: string
    clientId: string
    clientName: string
    connectionId: string
    googleEmail: string
    accountName: string
    containerName: string
    containerPublicId: string
    domainNames: string[]
    lastLiveVersionPath: string | null
    lastVerifiedAt: string | null
    updatedAt: string
    latestChangeStatus: string | null
    latestChangeAt: string | null
  }>
  recentChanges: Array<{
    id: string
    trackingSiteId: string
    siteName: string
    clientId: string
    clientName: string
    actionType: string
    status: string
    errorCode: string | null
    errorMessage: string | null
    requestedAt: string
    executedAt: string | null
  }>
}

export async function getGtmAdminOverview(event: H3Event): Promise<GtmAdminOverview> {
  const runtime = resolveGtmOAuthRuntimeConfig(event)
  const [connectionRows, bindingRows, changeRows, quota] = await Promise.all([
    queryRows<GtmConnectionAdminRow>(
      `SELECT gc.id,
              gc.google_email,
              gc.status AS connection_status,
              gcp.status AS credential_status,
              gcp.token_expires_at,
              gcp.scopes,
              COALESCE(jsonb_array_length(CASE
                WHEN jsonb_typeof(gc.metadata->'accessibleAccounts') = 'array'
                  THEN gc.metadata->'accessibleAccounts'
                ELSE '[]'::jsonb
              END), 0)::int AS accessible_account_count,
              COUNT(gb.id)::int AS binding_count,
              gc.last_discovered_at,
              gc.created_at,
              tm.name AS connected_by_name,
              tm.email AS connected_by_email
         FROM gtm_connections gc
         JOIN google_credential_profiles gcp ON gcp.id = gc.google_credential_profile_id
         LEFT JOIN gtm_container_bindings gb ON gb.connection_id = gc.id
         LEFT JOIN team_members tm ON tm.id = gc.connected_by
        GROUP BY gc.id, gcp.status, gcp.token_expires_at, gcp.scopes, tm.name, tm.email
        ORDER BY gc.updated_at DESC`
    ),
    queryRows<GtmBindingAdminRow>(
      `SELECT gb.id,
              gb.tracking_site_id,
              ts.name AS site_name,
              ts.client_id,
              c.name AS client_name,
              gb.connection_id,
              gc.google_email,
              gb.account_name,
              gb.container_name,
              gb.container_public_id,
              gb.domain_names,
              gb.last_live_version_path,
              gb.last_verified_at,
              gb.updated_at,
              latest.status AS latest_change_status,
              latest.requested_at AS latest_change_at
         FROM gtm_container_bindings gb
         JOIN tracking_sites ts ON ts.id = gb.tracking_site_id
         JOIN clients c ON c.id = ts.client_id
         JOIN gtm_connections gc ON gc.id = gb.connection_id
         LEFT JOIN LATERAL (
           SELECT cs.status, cs.requested_at
             FROM gtm_change_sets cs
            WHERE cs.binding_id = gb.id
            ORDER BY cs.created_at DESC
            LIMIT 1
         ) latest ON TRUE
        ORDER BY c.name, ts.name`
    ),
    queryRows<GtmChangeAdminRow>(
      `SELECT cs.id,
              ts.id AS tracking_site_id,
              ts.name AS site_name,
              ts.client_id,
              c.name AS client_name,
              cs.action_type,
              cs.status,
              cs.error_code,
              cs.error_message,
              cs.requested_at,
              cs.executed_at
         FROM gtm_change_sets cs
         JOIN gtm_container_bindings gb ON gb.id = cs.binding_id
         JOIN tracking_sites ts ON ts.id = gb.tracking_site_id
         JOIN clients c ON c.id = ts.client_id
        ORDER BY cs.created_at DESC
        LIMIT 25`
    ),
    queryOne<{ request_count: number, window_started_at: string }>(
      `SELECT request_count, window_started_at
         FROM gtm_api_quota_windows
        WHERE quota_key = 'google-cloud-project'`
    )
  ])

  const connections = connectionRows.map(row => ({
    id: row.id,
    googleEmail: row.google_email,
    status: row.connection_status,
    credentialStatus: row.credential_status,
    tokenExpiresAt: row.token_expires_at,
    scopes: row.scopes || [],
    accessibleAccountCount: row.accessible_account_count,
    bindingCount: row.binding_count,
    lastDiscoveredAt: row.last_discovered_at,
    createdAt: row.created_at,
    connectedBy: { name: row.connected_by_name, email: row.connected_by_email }
  }))
  const bindings = bindingRows.map(row => ({
    id: row.id,
    trackingSiteId: row.tracking_site_id,
    siteName: row.site_name,
    clientId: row.client_id,
    clientName: row.client_name,
    connectionId: row.connection_id,
    googleEmail: row.google_email,
    accountName: row.account_name,
    containerName: row.container_name,
    containerPublicId: row.container_public_id,
    domainNames: row.domain_names || [],
    lastLiveVersionPath: row.last_live_version_path,
    lastVerifiedAt: row.last_verified_at,
    updatedAt: row.updated_at,
    latestChangeStatus: row.latest_change_status,
    latestChangeAt: row.latest_change_at
  }))
  const recentChanges = changeRows.map(row => ({
    id: row.id,
    trackingSiteId: row.tracking_site_id,
    siteName: row.site_name,
    clientId: row.client_id,
    clientName: row.client_name,
    actionType: row.action_type,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    requestedAt: row.requested_at,
    executedAt: row.executed_at
  }))

  const activeConnections = connections.filter(row => row.status === 'active' && row.credentialStatus === 'active').length
  return {
    configuration: {
      oauthConfigured: Boolean(runtime.googleClientId && runtime.googleClientSecret),
      callbackPath: GTM_CALLBACK_PATH
    },
    summary: {
      activeConnections,
      linkedSites: bindings.length,
      verifiedSites: bindings.filter(row => Boolean(row.lastVerifiedAt)).length,
      failedChanges: recentChanges.filter(row => row.status === 'failed' || row.status === 'conflict').length
    },
    quota: {
      used: quota?.request_count ?? 0,
      budget: GTM_QUOTA_BUDGET,
      windowSeconds: GTM_QUOTA_WINDOW_SECONDS,
      windowStartedAt: quota?.window_started_at ?? null
    },
    connections,
    bindings,
    recentChanges
  }
}

export async function disconnectGtmConnection(connectionId: string, actorUserId: string): Promise<{
  id: string
  status: 'disconnected'
  retainedBindingCount: number
}> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(connectionId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid GTM connection ID' })
  }

  return transaction(async (db) => {
    const selected = await db.query(
      `SELECT gc.id, gc.google_credential_profile_id, gc.status,
              (SELECT COUNT(*)::int
                 FROM gtm_container_bindings gb
                WHERE gb.connection_id = gc.id) AS binding_count
         FROM gtm_connections gc
        WHERE gc.id = $1
        FOR UPDATE`,
      [connectionId]
    )
    const row = selected.rows[0]
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Google Tag Manager connection not found' })

    if (row.status !== 'disconnected') {
      await db.query(
        `UPDATE gtm_connections
            SET status = 'disconnected',
                metadata = metadata || jsonb_build_object(
                  'disconnectedAt', NOW(),
                  'disconnectedBy', $2::text
                ),
                updated_at = NOW()
          WHERE id = $1`,
        [connectionId, actorUserId]
      )
    }
    // Repair the dedicated credential profile too, even when a repeated call finds the connection
    // already disconnected after an earlier partial operation.
    await db.query(
      `UPDATE google_credential_profiles
          SET status = 'disconnected', updated_at = NOW()
        WHERE id = $1`,
      [row.google_credential_profile_id]
    )

    return {
      id: connectionId,
      status: 'disconnected' as const,
      retainedBindingCount: Number(row.binding_count) || 0
    }
  })
}
