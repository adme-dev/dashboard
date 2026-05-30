import { requireAuth } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const conn = await queryOne<any>(`SELECT id FROM social_connections WHERE id = $1`, [id])
  if (!conn) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })

  // Update client_id (can be null to unlink)
  const clientId = body.clientId || null
  if (clientId) {
    const client = await queryOne<any>(`SELECT id FROM agency_clients WHERE id = $1`, [clientId])
    if (!client) throw createError({ statusCode: 400, statusMessage: 'Client not found' })
  }

  await execute(
    `UPDATE social_connections SET client_id = $1, updated_at = NOW() WHERE id = $2`,
    [clientId, id]
  )

  // Propagate the assignment to this account's spend rows so analytics, the client
  // portal, and campaign health scoring reflect it immediately (media_spend.client_id
  // is what those features read; otherwise it wouldn't update until the next sync).
  const spendRowsUpdated = await execute(
    `UPDATE media_spend SET client_id = $1, updated_at = NOW() WHERE connection_id = $2`,
    [clientId, id]
  )

  return { success: true, spendRowsUpdated }
})
