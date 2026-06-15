import { execute, queryOne } from '~~/server/utils/db'

export type AutoActionMode = 'off' | 'notify' | 'propose'
export interface AutoActionPolicy {
  enabled: boolean
  perSeverity: { critical: AutoActionMode; warning: AutoActionMode; info: AutoActionMode }
}

export const DEFAULT_AUTO_ACTION_POLICY: AutoActionPolicy = {
  enabled: false,
  perSeverity: { critical: 'off', warning: 'off', info: 'off' },
}

export function mergeAutoActionPolicy(stored: Partial<AutoActionPolicy> | null | undefined): AutoActionPolicy {
  if (!stored) return { ...DEFAULT_AUTO_ACTION_POLICY, perSeverity: { ...DEFAULT_AUTO_ACTION_POLICY.perSeverity } }
  return {
    enabled: stored.enabled ?? DEFAULT_AUTO_ACTION_POLICY.enabled,
    perSeverity: { ...DEFAULT_AUTO_ACTION_POLICY.perSeverity, ...(stored.perSeverity ?? {}) },
  }
}

export async function getSpendAutoActionPolicy(tenantId: string): Promise<AutoActionPolicy> {
  const row = await queryOne<{ value: Partial<AutoActionPolicy> }>(
    `SELECT value FROM agency_settings WHERE tenant_id = $1 AND key = 'spend_auto_action'`,
    [tenantId],
  )
  return mergeAutoActionPolicy(row?.value)
}

export async function saveSpendAutoActionPolicy(tenantId: string, policy: AutoActionPolicy, updatedBy: string | null): Promise<void> {
  await execute(
    `INSERT INTO agency_settings (tenant_id, key, value, updated_by, updated_at, created_at)
     VALUES ($1, 'spend_auto_action', $2::jsonb, $3, NOW(), NOW())
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [tenantId, JSON.stringify(policy), updatedBy],
  )
}
