import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { invalidateSpendPeriodCaches } from '~~/server/utils/socialSpendCache'

/**
 * PATCH /api/agency/social/spend/:id
 * Updates budget_allocated for a media_spend row and logs the change
 */
export default eventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const tenantId = await getSelectedTenant(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  const body = await readBody(event)
  const budgetAllocated = parseFloat(body.budgetAllocated)

  if (isNaN(budgetAllocated) || budgetAllocated < 0) {
    throw createError({ statusCode: 400, statusMessage: 'budgetAllocated must be a non-negative number' })
  }

  // Get current budget and period before update
  const current = await queryOne<{ id: string; budget_allocated: string; period: string; platform: string }>(
    `SELECT id, budget_allocated::text, period, platform FROM media_spend WHERE id = $1`,
    [id]
  )

  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Spend record not found' })
  }

  const previousBudget = parseFloat(current.budget_allocated || '0')

  // Update the budget and rolling flag
  const rollingBool = body.rolling === true || body.rolling === 'true'
  const row = await queryOne<{ id: string; budget_allocated: number; budget_rolling: boolean }>(
    `UPDATE media_spend
     SET budget_allocated = $1, budget_rolling = $3, updated_at = NOW()
     WHERE id = $2
     RETURNING id, budget_allocated, budget_rolling`,
    [budgetAllocated, id, rollingBool]
  )

  // Log the change (fire-and-forget — don't block response)
  if (previousBudget !== budgetAllocated) {
    queryOne(
      `INSERT INTO budget_audit_log (media_spend_id, previous_budget, new_budget, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, previousBudget, budgetAllocated, user.id, body.note || null]
    ).catch(err => {
      console.error('[BudgetAudit] Failed to log change:', err.message)
    })
  }

  // Bust KV cache for this period (fire-and-forget)
  invalidateSpendPeriodCaches(event, {
    tenantId,
    period: current.period,
    platform: current.platform,
  }).catch(() => {})

  return { updated: true, id: row!.id, budgetAllocated: row!.budget_allocated, rolling: row!.budget_rolling }
})
