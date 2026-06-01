// server/utils/socialOAuth/store.ts
// DB-injected upsert for social_accounts honoring UNIQUE(platform, platform_account_id):
// new page → insert; page owned by THIS client → update (re-auth refresh); page owned by ANOTHER
// client → 'conflict' (no write), so the endpoint can return a clear 409.
import type { AccountRow } from './meta'

export interface AccountDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  execute(sql: string, params?: any[]): Promise<number>
}

export type UpsertResult =
  | { status: 'inserted' | 'updated'; id: string }
  | { status: 'conflict'; conflictClientName: string | null }

export async function upsertSocialAccount(db: AccountDb, clientId: string, row: AccountRow, createdBy: string): Promise<UpsertResult> {
  const existing = await db.queryOne<{ id: string; client_id: string }>(
    `SELECT id, client_id FROM social_accounts WHERE platform = $1 AND platform_account_id = $2`,
    [row.platform, row.platform_account_id])

  if (existing && existing.client_id !== clientId) {
    const owner = await db.queryOne<{ name: string }>(`SELECT name FROM agency_clients WHERE id = $1`, [existing.client_id])
    return { status: 'conflict', conflictClientName: owner?.name ?? null }
  }

  if (existing) {
    await db.queryOne(
      `UPDATE social_accounts SET account_name = $2, access_token = $3, token_expires_at = $4,
         metadata = social_accounts.metadata || $5::jsonb, is_active = TRUE, last_error = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [existing.id, row.account_name, row.access_token, row.token_expires_at, JSON.stringify(row.metadata)])
    return { status: 'updated', id: existing.id }
  }

  const inserted = await db.queryOne<{ id: string }>(
    `INSERT INTO social_accounts
       (client_id, platform, platform_account_id, account_name, access_token, token_expires_at, metadata, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb, TRUE, $8) RETURNING id`,
    [clientId, row.platform, row.platform_account_id, row.account_name, row.access_token, row.token_expires_at, JSON.stringify(row.metadata), createdBy])
  return { status: 'inserted', id: inserted!.id }
}

/** Patch a saved account's metadata.webhook_subscribed flag (after the subscribe attempt). */
export async function markWebhookSubscribed(db: AccountDb, accountId: string, subscribed: boolean, error: string | null): Promise<void> {
  await db.execute(
    `UPDATE social_accounts SET metadata = metadata || $2::jsonb, last_error = $3, updated_at = NOW() WHERE id = $1`,
    [accountId, JSON.stringify({ webhook_subscribed: subscribed }), error])
}
