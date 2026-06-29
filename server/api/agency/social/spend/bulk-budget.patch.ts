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

  const { spendIds, budgetAllocated, rolling, note, commissionRate, allocationMode } = body as {
    spendIds: string[]
    budgetAllocated: number
    rolling?: boolean | string
    note?: string
    commissionRate?: number
    allocationMode?: 'per_record' | 'even_total'
  }

  if (!Array.isArray(spendIds) || spendIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'spendIds must be a non-empty array' })
  }
  const uniqueSpendIds = Array.from(new Set(spendIds))
  const budget = parseFloat(String(budgetAllocated))
  if (isNaN(budget) || budget < 0) {
    throw createError({ statusCode: 400, statusMessage: 'budgetAllocated must be a non-negative number' })
  }
  const mode = allocationMode ?? 'per_record'
  if (mode !== 'per_record' && mode !== 'even_total') {
    throw createError({ statusCode: 400, statusMessage: 'allocationMode must be per_record or even_total' })
  }

  const currentRows = await queryRows<{
    id: string
    budget_allocated: string
    period: string
    platform: string
    client_id: string | null
  }>(
    `SELECT id::text, budget_allocated::text, period, platform, client_id::text
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

  const budgetBySpendId = new Map<string, number>()
  if (mode === 'even_total') {
    const totalCents = Math.round(budget * 100)
    const baseCents = Math.floor(totalCents / uniqueSpendIds.length)
    const remainderCents = totalCents % uniqueSpendIds.length
    uniqueSpendIds.forEach((id, index) => {
      const cents = baseCents + (index < remainderCents ? 1 : 0)
      budgetBySpendId.set(id, cents / 100)
    })
  } else {
    uniqueSpendIds.forEach(id => budgetBySpendId.set(id, budget))
  }

  const params: any[] = []
  const updateValues = uniqueSpendIds.map((id) => {
    params.push(id, budgetBySpendId.get(id) ?? budget)
    return `($${params.length - 1}::uuid, $${params.length}::numeric)`
  })

  params.push(rollingBool)
  const setClauses = ['budget_allocated = updates.budget_allocated', `budget_rolling = $${params.length}`]

  if (commRate != null) {
    params.push(commRate)
    setClauses.push(`commission_rate = $${params.length}`)
  }

  const updatedRows = await queryRows<{ id: string; budget_allocated: number; budget_rolling: boolean }>(
    `UPDATE media_spend
     SET ${setClauses.join(', ')}, updated_at = NOW()
     FROM (VALUES ${updateValues.join(', ')}) AS updates(id, budget_allocated)
     WHERE media_spend.id = updates.id
     RETURNING media_spend.id::text AS id, media_spend.budget_allocated, media_spend.budget_rolling`,
    params
  )

  // Audit log for each row (fire-and-forget)
  for (const row of currentRows) {
    const previousBudget = parseFloat(row.budget_allocated || '0')
    const nextBudget = budgetBySpendId.get(row.id) ?? budget
    if (Math.round(previousBudget * 100) === Math.round(nextBudget * 100)) continue
    queryOne(
      `INSERT INTO budget_audit_log (media_spend_id, previous_budget, new_budget, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.id, previousBudget, nextBudget, user.id, note || null]
    ).catch(() => {})
  }

  const cacheTargets = new Map<string, { period: string; platform: string; clientId: string | null }>()
  for (const row of currentRows) {
    cacheTargets.set(`${row.period}:${row.platform}:${row.client_id || 'all'}`, { period: row.period, platform: row.platform, clientId: row.client_id })
  }
  Promise.all(
    Array.from(cacheTargets.values()).map(target =>
      invalidateSpendPeriodCaches(event, { ...target, tenantId })
    )
  ).catch(() => {})

  return { updated: true, count: uniqueSpendIds.length, rollingSet: rollingBool, updatedRows: updatedRows.length }
})
