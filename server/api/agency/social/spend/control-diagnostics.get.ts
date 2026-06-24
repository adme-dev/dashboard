import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import {
  buildSpendControlDiagnostics,
  type SpendDiagnosticConnectionInput,
  type SpendDiagnosticUnmappedInput
} from '~~/server/utils/socialSpendDiagnostics'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const now = new Date()
  const month = parseInt(String(query.month || now.getMonth() + 1), 10)
  const year = parseInt(String(query.year || now.getFullYear()), 10)
  const period = `${year}-${String(month).padStart(2, '0')}`
  const rawPlatform = query.platform ? String(query.platform) : null
  const connectionPlatform = rawPlatform === 'google_ads' ? 'google' : rawPlatform
  const spendPlatform = rawPlatform === 'google' ? 'google_ads' : rawPlatform

  const platformFilter = connectionPlatform && connectionPlatform !== 'all' ? 'AND sc.platform = $2' : ''
  const connectionParams: string[] = platformFilter ? [period, connectionPlatform as string] : [period]
  const connections = await queryRows<SpendDiagnosticConnectionInput>(
    `SELECT
       sc.id::text AS "id",
       sc.platform AS "platform",
       sc.account_id AS "accountId",
       sc.account_name AS "accountName",
       sc.status AS "status",
       sc.token_expires_at::text AS "tokenExpiresAt",
       sc.refresh_token AS "refreshToken",
       MAX(ms.synced_at)::text AS "lastSyncedAt",
       sc.client_id::text AS "clientId",
       COALESCE(SUM(ms.actual_spend), 0)::float AS "spend",
       COALESCE(SUM(ms.budget_allocated), 0)::float AS "budget",
       COUNT(ms.id)::int AS "campaignCount"
     FROM social_connections sc
     LEFT JOIN media_spend ms ON ms.connection_id = sc.id AND ms.period = $1
     WHERE 1 = 1 ${platformFilter}
     GROUP BY sc.id, sc.platform, sc.account_id, sc.account_name, sc.status,
              sc.token_expires_at, sc.refresh_token, sc.client_id
     ORDER BY sc.platform, sc.account_name`,
    connectionParams
  )

  const spendParams: string[] = [period]
  let spendWhere = 'WHERE ms.period = $1 AND ms.client_id IS NULL'
  if (spendPlatform && spendPlatform !== 'all') {
    spendWhere += ` AND ms.platform = $${spendParams.length + 1}`
    spendParams.push(spendPlatform)
  }

  const unmappedSpend = await queryRows<SpendDiagnosticUnmappedInput>(
    `SELECT
       ms.platform AS "platform",
       sc.account_id AS "accountId",
       COALESCE(sc.account_name, MIN(ms.campaign_name)) AS "accountName",
       COALESCE(SUM(ms.actual_spend), 0)::float AS "spend",
       COALESCE(SUM(ms.budget_allocated), 0)::float AS "budget",
       COUNT(ms.id)::int AS "campaignCount"
     FROM media_spend ms
     LEFT JOIN social_connections sc ON sc.id = ms.connection_id
     ${spendWhere}
     GROUP BY ms.platform, sc.account_id, sc.account_name
     ORDER BY spend DESC`,
    spendParams
  )

  return {
    month,
    year,
    period,
    platform: rawPlatform || 'all',
    generatedAt: new Date().toISOString(),
    ...buildSpendControlDiagnostics({ connections, unmappedSpend })
  }
})
