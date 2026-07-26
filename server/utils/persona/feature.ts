import { queryOne, queryRows } from '~~/server/utils/db'
import type { LeadTransactionClient } from '~~/server/utils/leads/db'

export const PERSONA_IDENTITY_FEATURE = 'persona.identity'

interface EntitlementRow {
  enabled: boolean
}

export async function isPersonaIdentityEnabled(
  clientId: string,
  db?: LeadTransactionClient
): Promise<boolean> {
  const sql = `
    SELECT EXISTS (
      SELECT 1
        FROM client_feature_entitlements
       WHERE client_id = $1
         AND feature_key = $2
         AND status IN ('active', 'trial')
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (expires_at IS NULL OR expires_at > NOW())
    ) AS enabled`
  const params = [clientId, PERSONA_IDENTITY_FEATURE]
  if (db) {
    const result = await db.query(sql, params)
    return Boolean((result.rows?.[0] as EntitlementRow | undefined)?.enabled)
  }
  return Boolean((await queryOne<EntitlementRow>(sql, params))?.enabled)
}

export async function listPersonaIdentityEnabledClientIds(): Promise<string[]> {
  const rows = await queryRows<{ client_id: string }>(
    `SELECT DISTINCT client_id
       FROM client_feature_entitlements
      WHERE feature_key = $1
        AND status IN ('active', 'trial')
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (expires_at IS NULL OR expires_at > NOW())`,
    [PERSONA_IDENTITY_FEATURE]
  )
  return rows.map(row => row.client_id)
}
