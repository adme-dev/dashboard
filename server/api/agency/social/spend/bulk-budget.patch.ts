import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { invalidateSpendPeriodCaches } from '~~/server/utils/socialSpendCache'

/**
 * PATCH /api/agency/social/spend/bulk-budget
 * Updates budget_allocated for multiple media_spend rows (grouped by client/platform).
 */
export default eventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const tenantId = await getSelectedTenant(event)
  const body = await readBody(event)

  const { spendIds, budgetAllocated, rolling, note, commissionRate } = body as {
    spendIds: string[]
    budgetAllocated: number
    rolling?: boolean | string
    note?: string
    commissionRate?: number
  }

  if (!Array.isArray(spendIds) || spendIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'spendIds must be a non-empty array' })
  }
  const uniqueSpendIds = Array.from(new Set(spendIds))
  const budget = parseFloat(String(budgetAllocated))
  if (isNaN(budget) || budget < 0) {
    throw createError({ statusCode: 400, statusMessage: 'budgetAllocated must be a non-negative number' })
  }

  const currentRows = await queryRows<{
    id: string
    budget_allocated: string
    period: string
    platform: string
  }>(
    `SELECT id::text, budget_allocated::text, period, platform
     FROM media_spend
     WHERE id = ANY($1::uuid[])`,
    [uniqueSpendIds]
  )
  if (currentRows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Spend records not found' })
  }
  if (currentRows.length !== uniqueSpendIds.length) {
    throw createError({ statusCode: 404, statusMessage: 'One or more spend records were not found' })
  }

  // Coerce rolling to a strict boolean (handles string "true"/"false" from body parsing)
  const rollingBool = rolling === true || rolling === 'true'

  // Validate commission rate if provided
  const commRate = commissionRate != null ? parseFloat(String(commissionRate)) : null
  if (commRate != null && (isNaN(commRate) || commRate < 0 || commRate > 100)) {
    throw createError({ statusCode: 400, statusMessage: 'commissionRate must be between 0 and 100' })
  }

  // Build parameterized query
  const setClauses = ['budget_allocated = $1', 'budget_rolling = $2']
  const params: any[] = [budget, rollingBool]

  if (commRate != null) {
    params.push(commRate)
    setClauses.push(`commission_rate = $${params.length}`)
  }

  const updatedRows = await queryRows<{ id: string; budget_allocated: number; budget_rolling: boolean }>(
    `UPDATE media_spend
     SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = ANY($${params.length + 1}::uuid[])
     RETURNING id, budget_allocated, budget_rolling`,
    [...params, uniqueSpendIds]
  )

  // Audit log for each row (fire-and-forget)
  for (const row of currentRows) {
    const previousBudget = parseFloat(row.budget_allocated || '0')
    if (previousBudget === budget) continue
    queryOne(
      `INSERT INTO budget_audit_log (media_spend_id, previous_budget, new_budget, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.id, previousBudget, budget, user.id, note || null]
    ).catch(() => {})
  }

  const cacheTargets = new Map<string, { period: string; platform: string }>()
  for (const row of currentRows) {
    cacheTargets.set(`${row.period}:${row.platform}`, { period: row.period, platform: row.platform })
  }
  Promise.all(
    Array.from(cacheTargets.values()).map(target =>
      invalidateSpendPeriodCaches(event, { ...target, tenantId })
    )
  ).catch(() => {})

  return { updated: true, count: uniqueSpendIds.length, rollingSet: rollingBool, updatedRows: updatedRows.length }
})
