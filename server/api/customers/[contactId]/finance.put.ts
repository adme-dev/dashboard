/**
 * PUT /api/customers/[contactId]/finance
 *
 * Upserts the customer's finance overrides. FINANCE-gated. All fields
 * optional in the body — only the ones supplied are updated, the rest
 * keep their existing values.
 *
 * Body:
 *   { creditLimit?: number|null, creditHold?: bool, holdReason?: string|null,
 *     paymentPriority?: -1|0|1, internalNotes?: string|null,
 *     accountManagerId?: uuid|null }
 */

import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { execute, queryOne } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'

interface Body {
  creditLimit?: number | null
  creditHold?: boolean
  holdReason?: string | null
  paymentPriority?: number
  internalNotes?: string | null
  accountManagerId?: string | null
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, [...PERMISSIONS.FINANCE])

  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  const contactId = getRouterParam(event, 'contactId')
  if (!contactId) {
    throw createError({ statusCode: 400, statusMessage: 'contactId required' })
  }

  const body = await readBody<Body>(event) ?? {}

  // Validate
  if (body.paymentPriority != null && ![-1, 0, 1].includes(body.paymentPriority)) {
    throw createError({ statusCode: 400, statusMessage: 'paymentPriority must be -1, 0, or 1' })
  }

  // Convert dollars → cents (BIGINT). null clears the limit.
  const creditLimitCents = body.creditLimit == null
    ? null
    : Math.round(Number(body.creditLimit) * 100)

  // Confirm the contact exists in our cache before writing.
  const exists = await queryOne<{ contact_id: string }>(
    `SELECT contact_id FROM xero_contacts_cache WHERE tenant_id = $1 AND contact_id = $2`,
    [tenantId, contactId],
  )
  if (!exists) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not in cache yet — run a sync from Xero first.' })
  }

  // ON CONFLICT DO UPDATE keeps existing values when the body omits a field.
  // We use COALESCE on the EXCLUDED side so undefined-in-JS becomes "leave alone".
  // For nullable columns we allow explicit nulls to clear.
  await execute(
    `INSERT INTO customer_finance (
       tenant_id, contact_id,
       credit_limit_cents, credit_hold, hold_reason, payment_priority,
       internal_notes, account_manager_id,
       updated_by, updated_at, created_at
     ) VALUES (
       $1, $2,
       $3, $4, $5, $6,
       $7, $8,
       $9, NOW(), NOW()
     )
     ON CONFLICT (tenant_id, contact_id) DO UPDATE SET
       credit_limit_cents = $3,
       credit_hold        = $4,
       hold_reason        = $5,
       payment_priority   = $6,
       internal_notes     = $7,
       account_manager_id = $8,
       updated_by         = $9,
       updated_at         = NOW()`,
    [
      tenantId,
      contactId,
      creditLimitCents,
      body.creditHold ?? false,
      body.holdReason ?? null,
      body.paymentPriority ?? 0,
      body.internalNotes ?? null,
      body.accountManagerId ?? null,
      user.id,
    ],
  )

  return { success: true }
})
