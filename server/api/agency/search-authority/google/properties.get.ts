import { getQuery } from 'h3'
import { execute, queryRows } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import {
  refreshSearchConsoleCredential,
  resolveSearchConsoleCredential
} from '~~/server/utils/searchAuthority/credentials'
import { listSearchConsoleProperties } from '~~/server/utils/searchAuthority/googleClient'

const REFRESH_SKEW_MS = 5 * 60 * 1000

export default eventHandler(async (event) => {
  const clientId = String(getQuery(event).clientId || '')
  await requireAgencySearchAuthorityAccess(event, clientId)

  const connectionRows = await queryRows<{
    id: string
    google_email: string
    status: string
    last_checked_at: string | null
    last_success_at: string | null
    last_error_code: string | null
    last_error_message: string | null
  }>(
    `SELECT
       id, google_email, status, last_checked_at, last_success_at,
       last_error_code, last_error_message
     FROM search_console_connections
     WHERE client_id = $1
       AND status <> 'disconnected'
     ORDER BY connected_at DESC`,
    [clientId]
  )

  const connections = []
  for (const connection of connectionRows) {
    try {
      let credential = await resolveSearchConsoleCredential(connection.id)
      if (
        credential.tokenExpiresAt
        && new Date(credential.tokenExpiresAt).getTime()
        <= Date.now() + REFRESH_SKEW_MS
      ) {
        credential = await refreshSearchConsoleCredential(connection.id)
      }
      const properties = await listSearchConsoleProperties(credential.accessToken)
      await execute(
        `UPDATE search_console_connections
         SET status = 'active',
             last_checked_at = NOW(),
             last_success_at = NOW(),
             last_error_code = NULL,
             last_error_message = NULL,
             updated_at = NOW()
         WHERE id = $1 AND client_id = $2`,
        [connection.id, clientId]
      )
      connections.push({
        connectionId: connection.id,
        email: connection.google_email,
        status: 'active',
        lastCheckedAt: connection.last_checked_at,
        lastSuccessAt: connection.last_success_at,
        lastErrorCode: null,
        lastErrorMessage: null,
        properties
      })
    } catch {
      await execute(
        `UPDATE search_console_connections
         SET status = 'degraded',
             last_checked_at = NOW(),
             last_error_code = 'property_discovery_failed',
             last_error_message = 'Unable to list Search Console properties',
             updated_at = NOW()
         WHERE id = $1 AND client_id = $2`,
        [connection.id, clientId]
      )
      connections.push({
        connectionId: connection.id,
        email: connection.google_email,
        status: 'degraded',
        lastCheckedAt: connection.last_checked_at,
        lastSuccessAt: connection.last_success_at,
        lastErrorCode: 'property_discovery_failed',
        lastErrorMessage: 'Unable to list Search Console properties',
        properties: []
      })
    }
  }

  const maps = await queryRows<{
    id: string
    connection_id: string
    property_uri: string
    permission_level: string
    property_type: string
    status: string
  }>(
    `SELECT
       id, connection_id, property_uri, permission_level,
       property_type, status
     FROM search_console_property_maps
     WHERE client_id = $1
     ORDER BY created_at DESC`,
    [clientId]
  )

  return {
    connections,
    maps: maps.map(map => ({
      id: map.id,
      connectionId: map.connection_id,
      propertyUri: map.property_uri,
      permissionLevel: map.permission_level,
      propertyType: map.property_type,
      status: map.status
    }))
  }
})
