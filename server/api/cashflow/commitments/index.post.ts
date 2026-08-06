/**
 * POST /api/cashflow/commitments
 *
 * Creates a forecast-only commitment. Body: { supplier, amountCents,
 * expectedDate, recurrence?, recurrenceEnd?, paymentAccount?, status?,
 * confidence?, owner?, notes?, description?, contactId?, source? }.
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { validateCommitmentBody } from '~~/server/utils/cashflowCommitments'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const body = await readBody<Record<string, unknown>>(event) ?? {}
  const v = validateCommitmentBody(body, { partial: false })

  const inserted = await queryOne(
    `INSERT INTO cashflow_commitments (
       tenant_id, supplier, contact_id, description, amount_cents, expected_date,
       recurrence, recurrence_end, payment_account, status, confidence,
       owner, notes, source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      tenantId, v.supplier, v.contactId, v.description, v.amountCents, v.expectedDate,
      v.recurrence, v.recurrenceEnd, v.paymentAccount, v.status, v.confidence,
      v.owner, v.notes, v.source, user.id,
    ],
  )
  return { id: (inserted as any)?.id }
})
