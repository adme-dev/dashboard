import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { kvDelete } from '~~/server/utils/kv'

/**
 * PATCH /api/agency/social/spend/:id
 * Updates budget_allocated for a media_spend row and logs the change
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)

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

  // Update the budget (and rolling flag if provided)
  const rollingClause = typeof body.rolling === 'boolean' ? `, budget_rolling = ${body.rolling}` : ''
  const row = await queryOne<{ id: string; budget_allocated: number }>(
    `UPDATE media_spend SET budget_allocated = $1${rollingClause} WHERE id = $2 RETURNING id, budget_allocated`,
    [budgetAllocated, id]
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
  const period = current.period
  const kvPlatform = current.platform === 'google_ads' ? 'google' : current.platform
  Promise.all([
    kvDelete(event, `spend:summary:${period}:all`),
    kvDelete(event, `spend:summary:${period}:${current.platform}`),
    kvDelete(event, `spend:${kvPlatform}:accounts:${period}`),
    kvDelete(event, `spend:daily:${kvPlatform}:${period}`),
  ]).catch(() => {})

  return { updated: true, id: row!.id, budgetAllocated: row!.budget_allocated }
})
