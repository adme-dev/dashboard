// Connected ad accounts with their current client attribution + spend-row
// counts, for the account→client mapping manager UI.
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const AD_PLATFORMS = ['meta', 'google', 'tiktok', 'linkedin', 'pinterest', 'twitter', 'snapchat', 'microsoft_ads']

interface Row {
  id: string
  platform: string
  account_name: string | null
  account_id: string | null
  status: string
  client_id: string | null
  spend_rows: string
}

export default eventHandler(async (event) => {
  await requireAuth(event)

  const rows = await queryRows<Row>(
    `SELECT sc.id, sc.platform, sc.account_name, sc.account_id, sc.status,
            (SELECT ms.client_id FROM media_spend ms
               WHERE ms.connection_id = sc.id AND ms.client_id IS NOT NULL
               LIMIT 1) AS client_id,
            (SELECT COUNT(*) FROM media_spend ms WHERE ms.connection_id = sc.id)::text AS spend_rows
     FROM social_connections sc
     WHERE sc.status = 'active' AND sc.platform = ANY($1)
     ORDER BY sc.platform, sc.account_name`,
    [AD_PLATFORMS]
  )

  return {
    items: rows.map(r => ({
      id: r.id,
      platform: r.platform,
      accountName: r.account_name || r.account_id || '(unnamed account)',
      accountId: r.account_id,
      clientId: r.client_id,
      spendRows: Number(r.spend_rows)
    }))
  }
})
