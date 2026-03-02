import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute, queryRows } from '~~/server/utils/db'
import { kvDelete } from '~~/server/utils/kv'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const conn = await queryOne<{ id: string; account_name: string; platform: string }>(
    `SELECT id, account_name, platform FROM social_connections WHERE id = $1`,
    [id]
  )
  if (!conn) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })

  // Get affected periods before disconnecting
  const periods = await queryRows<{ period: string }>(
    `SELECT DISTINCT period FROM media_spend WHERE connection_id = $1`,
    [id]
  )

  // Nullify connection_id on media_spend (preserve spend data)
  await execute(`UPDATE media_spend SET connection_id = NULL WHERE connection_id = $1`, [id])
  // Delete connection (cascades to ad_account_client_map)
  await execute(`DELETE FROM social_connections WHERE id = $1`, [id])

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
