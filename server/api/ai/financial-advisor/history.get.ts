/**
 * GET /api/ai/financial-advisor/history
 *
 * Lists archived Financial Advisor runs for the active tenant.
 * Optional ?period=YYYY-MM-DD returns the latest report for that
 * specific period instead of a list.
 */

import { createError } from 'h3'
import { queryRows, queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

export default eventHandler(async (event) => {
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const q = getQuery(event)
  const period = typeof q.period === 'string' ? q.period : null

  if (period) {
    const row = await queryOne<any>(
      `SELECT id, period_key, period_label, grade, score, headline, verdict, payload, generated_at
       FROM financial_advisor_reports
       WHERE tenant_id = $1 AND period_key = $2
       ORDER BY generated_at DESC LIMIT 1`,
      [tenantId, period]
    )
    return { report: row ?? null }
  }

  const rows = await queryRows<any>(
    `SELECT id, period_key, period_label, grade, score, headline, verdict, generated_at
     FROM financial_advisor_reports
     WHERE tenant_id = $1
     ORDER BY period_key DESC, generated_at DESC
     LIMIT 24`,
    [tenantId]
  )
  return { reports: rows }
})
