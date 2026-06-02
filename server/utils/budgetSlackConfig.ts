import { queryOne, execute } from '~~/server/utils/db'

export interface BudgetSlackConfig {
  webhook_url: string | null
  channel: string | null
  digest_enabled: boolean
  realtime_enabled: boolean
  digest_hour: number
  create_tasks: boolean
  task_assignee_id: string | null
}

export const DEFAULT_BUDGET_SLACK_CONFIG: BudgetSlackConfig = {
  webhook_url: null,
  channel: null,
  digest_enabled: true,
  realtime_enabled: true,
  digest_hour: 9,
  create_tasks: false,
  task_assignee_id: null,
}

export async function getBudgetSlackConfig(tenantId: string): Promise<BudgetSlackConfig> {
  const row = await queryOne<{ value: Partial<BudgetSlackConfig> }>(
    `SELECT value FROM agency_settings WHERE tenant_id = $1 AND key = 'budget_slack'`,
    [tenantId],
  )
  return { ...DEFAULT_BUDGET_SLACK_CONFIG, ...(row?.value ?? {}) }
}

export async function saveBudgetSlackConfig(
  tenantId: string,
  cfg: BudgetSlackConfig,
  updatedBy: string | null,
): Promise<void> {
  await execute(
    `INSERT INTO agency_settings (tenant_id, key, value, updated_by, updated_at, created_at)
     VALUES ($1, 'budget_slack', $2::jsonb, $3, NOW(), NOW())
     ON CONFLICT (tenant_id, key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [tenantId, JSON.stringify(cfg), updatedBy],
  )
}
