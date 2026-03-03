import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { getAccountMonthlySpend } from '~~/server/utils/metaClient'

/**
 * GET /api/agency/social/meta/billing
 *
 * Fetches Meta/Facebook spend totals for each connected ad account
 * in the given month via the Insights API.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const now = new Date()
  const month = parseInt(String(query.month || now.getMonth() + 1), 10)
  const year = parseInt(String(query.year || now.getFullYear()), 10)
  const period = `${year}-${String(month).padStart(2, '0')}`

  // Get active Meta connections
  const connections = await queryRows<{
    id: string
    account_id: string
    account_name: string
    access_token: string
    metadata: any
  }>(
    `SELECT id, account_id, account_name, access_token, metadata
     FROM social_connections
     WHERE platform = 'meta' AND status = 'active'`
  )

  if (connections.length === 0) {
    return { period, accounts: [], total: 0 }
  }

  // Get client mappings for labelling
  const mappings = await queryRows<{
    connection_id: string
    xero_client_name: string
  }>(
    `SELECT DISTINCT ON (connection_id) connection_id, xero_client_name
     FROM ad_account_client_map`
  )
  const clientByConnection = new Map(mappings.map(m => [m.connection_id, m.xero_client_name]))

  const accounts: Array<{
    accountId: string
    accountName: string
    clientName: string | null
    total: number
  }> = []

  let grandTotal = 0

  await Promise.all(connections.map(async (conn) => {
    const actId = conn.metadata?.actId || `act_${conn.account_id}`
    const summary = await getAccountMonthlySpend(actId, conn.access_token, month, year)
    grandTotal += summary.spend

    accounts.push({
      accountId: conn.account_id,
      accountName: conn.account_name,
      clientName: clientByConnection.get(conn.id) || null,
      total: Math.round(summary.spend * 100) / 100,
    })
  }))

  return {
    period,
    accounts,
    total: Math.round(grandTotal * 100) / 100,
  }
})
