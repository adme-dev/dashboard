/**
 * POST /api/agency/eom/runs/:id/validate-contacts
 * Dry-run contact validation without pushing invoices to Xero.
 * Returns which client names match Xero contacts and which are missing.
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { validateContacts } from '~~/server/utils/xeroInvoiceWriter'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const runId = getRouterParam(event, 'id')

  if (!runId) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })
  }

  return await validateContacts(event, runId)
})
