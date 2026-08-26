type SqlParam = string | number | boolean | null

export function buildSocialInboxAccountsQuery(clientId?: string | null): { sql: string, params: SqlParam[] } {
  const params: SqlParam[] = []
  let sql = `SELECT sa.id, sa.client_id, sa.platform, sa.platform_account_id, sa.account_name,
                    sa.access_token, sa.refresh_token, sa.token_expires_at
             FROM social_accounts sa
             WHERE sa.is_active = TRUE AND sa.access_token IS NOT NULL`

  if (clientId) {
    params.push(clientId)
    sql += ` AND sa.client_id = $${params.length}`
  }

  // An aggregate run can exceed the request budget. Always put accounts that have never synced,
  // then the stalest accounts, first so repeated manual/cron runs rotate through every connection
  // instead of starving accounts that happen to appear late in Postgres' unordered result set.
  sql += ` ORDER BY (
             SELECT MIN(c.last_synced_at)
             FROM social_sync_cursors c
             WHERE c.social_account_id = sa.id
           ) ASC NULLS FIRST, sa.id ASC`

  return { sql, params }
}
