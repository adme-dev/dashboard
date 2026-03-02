import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { kvDelete } from '~~/server/utils/kv'

/**
 * PATCH /api/agency/social/spend/bulk-budget
 * Updates budget_allocated for multiple media_spend rows (grouped by client/platform).
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { spendIds, budgetAllocated, rolling, note } = body as {
    spendIds: string[]
    budgetAllocated: number
    rolling?: boolean
    note?: string
  }

  if (!Array.isArray(spendIds) || spendIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'spendIds must be a non-empty array' })
  }
  const budget = parseFloat(String(budgetAllocated))
  if (isNaN(budget) || budget < 0) {
    throw createError({ statusCode: 400, statusMessage: 'budgetAllocated must be a non-negative number' })
  }

  // Get period/platform for cache busting (from first row)
  const first = await queryOne<{ period: string; platform: string }>(
    `SELECT period, platform FROM media_spend WHERE id = $1`,
    [spendIds[0]]
  )
  if (!first) {
    throw createError({ statusCode: 404, statusMessage: 'Spend records not found' })
  }

  // Build parameterized IN clause
  const placeholders = spendIds.map((_, i) => `$${i + 2}`).join(', ')

  const rollingClause = typeof rolling === 'boolean' ? `, budget_rolling = ${rolling}` : ''
  await execute(
    `UPDATE media_spend SET budget_allocated = $1${rollingClause} WHERE id IN (${placeholders})`,
    [budget, ...spendIds]
  )

  // Audit log for each row (fire-and-forget)
  for (const sid of spendIds) {
    queryOne(
      `INSERT INTO budget_audit_log (media_spend_id, previous_budget, new_budget, changed_by, note)
       VALUES ($1, (SELECT budget_allocated FROM media_spend WHERE id = $1), $2, $3, $4)`,
      [sid, budget, user.id, note || null]
    ).catch(() => {})
  }

  // Bust KV cache
  const period = first.period
  const kvPlatform = first.platform === 'google_ads' ? 'google' : first.platform
  Promise.all([
    kvDelete(event, `spend:summary:${period}:all`),
    kvDelete(event, `spend:summary:${period}:${first.platform}`),
    kvDelete(event, `spend:${kvPlatform}:accounts:${period}`),
  ]).catch(() => {})

  return { updated: true, count: spendIds.length }
})
