/**
 * POST /api/customers/[contactId]/collections
 *
 * Append a collections action to the log. Used by:
 *  • the per-row "Send reminder" button (action: reminder_*)
 *  • the "Log call" / "Log note" actions on the collections queue
 *  • the auto-marker when an invoice flips to PAID (called by the cron)
 *
 * Body: { action: string, invoiceId?: string, notes?: string }
 */

import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { execute } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

const VALID_ACTIONS = new Set([
  'reminder_gentle',
  'reminder_firm',
  'reminder_final',
  'phone_call',
  'email_custom',
  'escalated_to_handover',
  'note',
  'paid',
])

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  const contactId = getRouterParam(event, 'contactId')
  if (!contactId) {
    throw createError({ statusCode: 400, statusMessage: 'contactId required' })
  }

  const body = await readBody<{ action?: string; invoiceId?: string; notes?: string }>(event) ?? {}
  const action = String(body.action ?? '')
  if (!VALID_ACTIONS.has(action)) {
    throw createError({
      statusCode: 400,
      statusMessage: `action must be one of: ${[...VALID_ACTIONS].join(', ')}`,
    })
  }

  await execute(
    `INSERT INTO customer_collections_log
       (tenant_id, contact_id, action, invoice_id, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, contactId, action, body.invoiceId ?? null, body.notes ?? null, user.id],
  )

  return { success: true }
})
