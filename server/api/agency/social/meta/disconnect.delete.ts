import { requirePermission } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'

/**
 * DELETE /api/agency/social/meta/disconnect?connectionId=X
 * Removes a Meta connection and its client mappings (CASCADE)
 */
export default eventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')

  const query = getQuery(event)
  const connectionId = String(query.connectionId || '')

  if (!connectionId) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
  }

  // Verify it exists and is a Meta connection
  const conn = await queryOne<{ id: string; account_name: string }>(
    `SELECT id, account_name FROM social_connections WHERE id = $1 AND platform = 'meta'`,
    [connectionId]
  )

  if (!conn) {
    throw createError({ statusCode: 404, statusMessage: 'Meta connection not found' })
  }

  // Nullify connection_id on media_spend rows (don't delete spend data)
  await execute(
    `UPDATE media_spend SET connection_id = NULL WHERE connection_id = $1`,
    [connectionId]
  )

  // Delete the connection (cascades to ad_account_client_map)
  await execute(
    `DELETE FROM social_connections WHERE id = $1`,
    [connectionId]
  )

  return { deleted: true, accountName: conn.account_name }
})
