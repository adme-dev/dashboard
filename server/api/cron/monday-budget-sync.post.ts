// POST /api/cron/monday-budget-sync
// monday Marketing board Client Budget → media_spend.budget_allocated (keyed on Campaign ID),
// and pacing write-back to the board's machine-written columns.
// Auth: x-cron-secret header matched against CRON_SECRET env var.
// Gated by MONDAY_BUDGET_SYNC_ENABLED (default off).
import { defineEventHandler, getHeader, createError } from 'h3'
import { runMondayBudgetSync } from '~~/server/utils/mondayBudgetSync'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret || cronSecret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (process.env.MONDAY_BUDGET_SYNC_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'Monday budget sync disabled' })
  }
  const report = await runMondayBudgetSync()
  return { ok: true, report }
})
