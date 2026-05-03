/**
 * Get Out configuration — load + save tenant-specific cashflow target inputs.
 *
 * Stored in agency_settings under key 'get_out_config'. Falls back to a
 * historical default when nothing is configured (matches the values that
 * were hardcoded prior to migration 095).
 */

import { execute, queryOne } from './db'

export interface GetOutLine {
  id: string
  label: string
  category: 'wages' | 'expenses' | 'extras'
  amountCents: number
  notes?: string | null
}

export interface GetOutConfig {
  lines: GetOutLine[]
}

/**
 * Defaults preserve the old hardcoded values from get-out.get.ts so that
 * pre-migration behaviour is unchanged for any tenant who hasn't yet
 * configured anything.
 */
export function getDefaultConfig(): GetOutConfig {
  return {
    lines: [
      { id: 'wages-default', label: 'Monthly wages',  category: 'wages',    amountCents: 10_226_300 },
      { id: 'expenses-default', label: 'Operating expenses', category: 'expenses', amountCents: 4_402_600 },
      { id: 'ato-default',  label: 'ATO repayment',  category: 'extras',   amountCents:    500_000 },
      { id: 'loan1-default', label: 'Loan 1',         category: 'extras',   amountCents:    300_000 },
      { id: 'loan2-default', label: 'Loan 2',         category: 'extras',   amountCents:    150_000 },
      { id: 'loan-int-default', label: 'Loan interest', category: 'extras', amountCents:     82_400 },
    ],
  }
}

export async function loadGetOutConfig(tenantId: string): Promise<GetOutConfig> {
  const row = await queryOne<{ value: GetOutConfig }>(
    `SELECT value FROM agency_settings WHERE tenant_id = $1 AND key = 'get_out_config'`,
    [tenantId],
  )
  if (!row?.value || !Array.isArray(row.value.lines) || row.value.lines.length === 0) {
    return getDefaultConfig()
  }
  return row.value
}

export async function saveGetOutConfig(opts: {
  tenantId: string
  config: GetOutConfig
  updatedBy?: string | null
}): Promise<void> {
  await execute(
    `INSERT INTO agency_settings (tenant_id, key, value, updated_by, updated_at, created_at)
     VALUES ($1, 'get_out_config', $2::jsonb, $3, NOW(), NOW())
     ON CONFLICT (tenant_id, key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [opts.tenantId, JSON.stringify(opts.config), opts.updatedBy ?? null],
  )
}

/**
 * Sums + bucketed totals for a config — used everywhere the page surfaces
 * "wages / expenses / extras / total" so the math stays consistent.
 */
export function summariseConfig(config: GetOutConfig) {
  let wagesCents = 0
  let expensesCents = 0
  let extrasCents = 0
  for (const line of config.lines) {
    if (line.category === 'wages') wagesCents += line.amountCents
    else if (line.category === 'expenses') expensesCents += line.amountCents
    else if (line.category === 'extras') extrasCents += line.amountCents
  }
  const totalCents = wagesCents + expensesCents + extrasCents
  return { wagesCents, expensesCents, extrasCents, totalCents }
}
