// server/utils/socialOAuth/store.ts
// DB-injected upsert for social_accounts honoring UNIQUE(platform, platform_account_id).
// Google Business also gets a metadata-location-id fallback so the same GBP location cannot be
// duplicated just because it was authorized through a different Google account container.

export interface AccountRow {
  platform: 'facebook' | 'instagram' | 'google-business' | 'youtube' | 'linkedin' | 'tiktok'
  platform_account_id: string
  account_name: string
  access_token: string
  refresh_token?: string | null
  token_expires_at: string | null
  metadata: Record<string, unknown>
}

export interface AccountDb {
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>
  execute(sql: string, params?: unknown[]): Promise<number>
}

export type UpsertResult
  = { status: 'inserted' | 'updated', id: string }
    | { status: 'conflict', conflictClientName: string | null }

export async function upsertSocialAccount(db: AccountDb, clientId: string, row: AccountRow, createdBy: string): Promise<UpsertResult> {
  const existing = await findExistingSocialAccount(db, row)

  if (existing && existing.client_id !== clientId) {
    const owner = await db.queryOne<{ name: string }>(`SELECT name FROM agency_clients WHERE id = $1`, [existing.client_id])
    return { status: 'conflict', conflictClientName: owner?.name ?? null }
  }

  if (existing) {
    await db.queryOne(
      `UPDATE social_accounts SET platform_account_id = $2, account_name = $3, access_token = $4,
         refresh_token = COALESCE($5, social_accounts.refresh_token),
         token_expires_at = $6,
         metadata = social_accounts.metadata || $7::jsonb, is_active = TRUE, last_error = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [existing.id, row.platform_account_id, row.account_name, row.access_token, row.refresh_token ?? null, row.token_expires_at, JSON.stringify(row.metadata)])
    return { status: 'updated', id: existing.id }
  }

  const inserted = await db.queryOne<{ id: string }>(
    `INSERT INTO social_accounts
       (client_id, platform, platform_account_id, account_name, access_token, refresh_token, token_expires_at, metadata, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb, TRUE, $9) RETURNING id`,
    [clientId, row.platform, row.platform_account_id, row.account_name, row.access_token, row.refresh_token ?? null, row.token_expires_at, JSON.stringify(row.metadata), createdBy])
  return { status: 'inserted', id: inserted!.id }
}

async function findExistingSocialAccount(db: AccountDb, row: AccountRow): Promise<{ id: string, client_id: string } | null> {
  const existing = await db.queryOne<{ id: string, client_id: string }>(
    `SELECT id, client_id FROM social_accounts WHERE platform = $1 AND platform_account_id = $2`,
    [row.platform, row.platform_account_id])
  if (existing) return existing

  const googleBusinessLocationId = getGoogleBusinessLocationId(row)
  if (!googleBusinessLocationId) return null

  return db.queryOne<{ id: string, client_id: string }>(
    `SELECT id, client_id
       FROM social_accounts
      WHERE platform = 'google-business'
        AND metadata->>'googleBusinessLocationId' = $1
      LIMIT 1`,
    [googleBusinessLocationId])
}

function getGoogleBusinessLocationId(row: AccountRow): string | null {
  if (row.platform !== 'google-business') return null
  const value = row.metadata.googleBusinessLocationId
  return typeof value === 'string' && value.trim() ? value : null
}

/** Patch a saved account's metadata.webhook_subscribed flag (after the subscribe attempt). */
export async function markWebhookSubscribed(db: AccountDb, accountId: string, subscribed: boolean, error: string | null): Promise<void> {
  await db.execute(
    `UPDATE social_accounts SET metadata = metadata || $2::jsonb, last_error = $3, updated_at = NOW() WHERE id = $1`,
    [accountId, JSON.stringify({ webhook_subscribed: subscribed }), error])
}
