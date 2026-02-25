import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const conn = await queryOne<{ id: string; account_name: string; platform: string }>(
    `SELECT id, account_name, platform FROM social_connections WHERE id = $1`,
    [id]
  )
  if (!conn) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })

  // Nullify connection_id on media_spend (preserve spend data)
  await execute(`UPDATE media_spend SET connection_id = NULL WHERE connection_id = $1`, [id])
  // Delete connection (cascades to ad_account_client_map)
  await execute(`DELETE FROM social_connections WHERE id = $1`, [id])

  return { deleted: true, platform: conn.platform, accountName: conn.account_name }
})
