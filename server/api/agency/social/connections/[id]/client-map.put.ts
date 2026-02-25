import { requireAuth } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  if (!Array.isArray(body?.mappings)) {
    throw createError({ statusCode: 400, statusMessage: 'mappings array is required' })
  }

  // Verify connection exists
  const conn = await queryOne<{ id: string }>(`SELECT id FROM social_connections WHERE id = $1`, [id])
  if (!conn) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })

  // Delete existing mappings and re-insert
  await execute(`DELETE FROM ad_account_client_map WHERE connection_id = $1`, [id])

  let created = 0
  for (const m of body.mappings) {
    if (!m.xeroClientName) continue
    await execute(
      `INSERT INTO ad_account_client_map (connection_id, campaign_id, campaign_name_pattern, xero_client_name, xero_client_code)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, m.campaignId || null, m.campaignNamePattern || null, m.xeroClientName, m.xeroClientCode || null]
    )
    created++
  }

  return { updated: true, count: created }
})
