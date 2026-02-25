import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const mappings = await queryRows<any>(
    `SELECT * FROM ad_account_client_map WHERE connection_id = $1 ORDER BY xero_client_name`,
    [id]
  )

  return mappings.map((m: any) => ({
    id: m.id,
    connectionId: m.connection_id,
    campaignId: m.campaign_id,
    campaignNamePattern: m.campaign_name_pattern,
    xeroClientName: m.xero_client_name,
    xeroClientCode: m.xero_client_code,
    createdAt: m.created_at,
  }))
})
