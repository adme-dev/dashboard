import { execute, queryOne } from '~~/server/utils/db'

export interface SocialBudgetControlConfig {
  liveBudgetChangesEnabled: boolean
  metaBudgetWritesEnabled: boolean
  googleBudgetWritesEnabled: boolean
  maxMultiple: number          // new daily <= maxMultiple * current daily
  monthlyMarginPct: number     // allowed overshoot of monthly budget
}

export const DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG: SocialBudgetControlConfig = {
  liveBudgetChangesEnabled: false,
  metaBudgetWritesEnabled: false,
  googleBudgetWritesEnabled: false,
  maxMultiple: 2,
  monthlyMarginPct: 0.1,
}

/** Pure merge of a stored partial config over defaults. */
export function mergeBudgetControlConfig(stored: Partial<SocialBudgetControlConfig> | null | undefined): SocialBudgetControlConfig {
  return { ...DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG, ...(stored ?? {}) }
}

export async function getSocialBudgetControlConfig(tenantId: string): Promise<SocialBudgetControlConfig> {
  const row = await queryOne<{ value: Partial<SocialBudgetControlConfig> }>(
    `SELECT value FROM agency_settings WHERE tenant_id = $1 AND key = 'social_budget_control'`,
    [tenantId]
  )

  return mergeBudgetControlConfig(row?.value)
}

export async function saveSocialBudgetControlConfig(
  tenantId: string,
  config: SocialBudgetControlConfig,
  updatedBy: string | null
): Promise<void> {
  await execute(
    `INSERT INTO agency_settings (tenant_id, key, value, updated_by, updated_at, created_at)
     VALUES ($1, 'social_budget_control', $2::jsonb, $3, NOW(), NOW())
     ON CONFLICT (tenant_id, key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [tenantId, JSON.stringify(config), updatedBy]
  )
}
