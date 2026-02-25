import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const conn = await queryOne<any>(
    `SELECT sc.*,
            u.name as connected_by_name
     FROM social_connections sc
     LEFT JOIN users u ON sc.connected_by = u.id::text
     WHERE sc.id = $1`,
    [id]
  )
  if (!conn) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })

  const mappings = await queryRows<any>(
    `SELECT * FROM ad_account_client_map WHERE connection_id = $1 ORDER BY xero_client_name`,
    [id]
  )

  return {
    id: conn.id,
    platform: conn.platform,
    accountId: conn.account_id,
    accountName: conn.account_name,
    status: conn.status,
    tokenExpiresAt: conn.token_expires_at,
    scopes: conn.scopes ? (typeof conn.scopes === 'string' ? JSON.parse(conn.scopes) : conn.scopes) : [],
    metadata: conn.metadata ? (typeof conn.metadata === 'string' ? JSON.parse(conn.metadata) : conn.metadata) : null,
    connectedBy: conn.connected_by,
    connectedByName: conn.connected_by_name,
    createdAt: conn.created_at,
    updatedAt: conn.updated_at,
    clientMappings: mappings.map((m: any) => ({
      id: m.id,
      campaignId: m.campaign_id,
      campaignNamePattern: m.campaign_name_pattern,
      xeroClientName: m.xero_client_name,
      xeroClientCode: m.xero_client_code,
      createdAt: m.created_at,
    })),
  }
})
