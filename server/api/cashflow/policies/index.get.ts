/**
 * GET /api/cashflow/policies
 *
 * Returns the tenant's treasury policies (tax_transfer, amex_paydown) and
 * the forecast lines they derive over the next 13 weeks, so the UI can
 * show config and effect side by side.
 */

import { defineEventHandler, createError } from 'h3'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryRows } from '~~/server/utils/db'
import { derivePolicyLines } from '~~/server/utils/treasuryPolicy'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const policies = await queryRows<{
    policy_type: string
    config: unknown
    active: boolean
    updated_by: string | null
    updated_at: string
  }>(
    `SELECT policy_type, config, active, updated_by, updated_at
     FROM treasury_policies WHERE tenant_id = $1
     ORDER BY policy_type`,
    [tenantId],
  )

  const start = new Date()
  const end = new Date(start.getTime() + 13 * 7 * 86400_000)
  const lines = await derivePolicyLines(tenantId, start, end)

  return { policies, lines }
})
