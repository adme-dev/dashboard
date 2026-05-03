/**
 * GET /api/xero/get-out/config
 *
 * Returns the tenant's Get Out configuration (line items + summary totals).
 * Falls back to historical defaults when nothing is configured.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const config = await loadGetOutConfig(tenantId)
  const totals = summariseConfig(config)
  return {
    config,
    totals: {
      wages: totals.wagesCents / 100,
      expenses: totals.expensesCents / 100,
      extras: totals.extrasCents / 100,
      total: totals.totalCents / 100,
    },
  }
})
