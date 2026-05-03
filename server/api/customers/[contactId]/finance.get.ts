/**
 * GET /api/customers/[contactId]/finance
 *
 * Returns the customer's finance overrides (credit hold/limit, internal
 * notes, account manager) — or sensible defaults if none are set yet.
 *
 * Read access requires PERMISSIONS.FINANCE since margins/credit-hold
 * status is not appropriate for non-finance roles. Mutations are gated
 * on the PUT endpoint.
 */

import { defineEventHandler, getRouterParam, createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'

interface FinanceRow {
  credit_limit_cents: string | number | null
  credit_hold: boolean
  hold_reason: string | null
  payment_priority: number
  internal_notes: string | null
  account_manager_id: string | null
  account_manager_name: string | null
  updated_at: string
  created_at: string
}

export default defineEventHandler(async (event) => {
  await requireRole(event, [...PERMISSIONS.FINANCE])

  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  const contactId = getRouterParam(event, 'contactId')
  if (!contactId) {
    throw createError({ statusCode: 400, statusMessage: 'contactId required' })
  }

  const row = await queryOne<FinanceRow>(
    `SELECT cf.credit_limit_cents, cf.credit_hold, cf.hold_reason,
            cf.payment_priority, cf.internal_notes, cf.account_manager_id,
            tm.name AS account_manager_name,
            cf.updated_at, cf.created_at
       FROM customer_finance cf
       LEFT JOIN team_members tm ON tm.id = cf.account_manager_id
       WHERE cf.tenant_id = $1 AND cf.contact_id = $2`,
    [tenantId, contactId],
  )

  if (!row) {
    return {
      creditLimit: null,
      creditHold: false,
      holdReason: null,
      paymentPriority: 0,
      internalNotes: null,
      accountManager: null,
      updatedAt: null,
      createdAt: null,
    }
  }

  return {
    creditLimit: row.credit_limit_cents != null ? Number(row.credit_limit_cents) / 100 : null,
    creditHold: row.credit_hold,
    holdReason: row.hold_reason,
    paymentPriority: row.payment_priority,
    internalNotes: row.internal_notes,
    accountManager: row.account_manager_id ? {
      id: row.account_manager_id,
      name: row.account_manager_name,
    } : null,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
})
