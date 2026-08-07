/**
 * PATCH /api/cashflow/commitments/:id
 *
 * Partial update of a commitment. Accepts any subset of the create fields
 * plus matchedInvoiceId (set when a real Xero bill supersedes the estimate;
 * setting it also moves status to 'matched' unless a status is supplied).
 */

import { defineEventHandler, readBody, createError, getRouterParam } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { validateCommitmentBody } from '~~/server/utils/cashflowCommitments'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const body = await readBody<Record<string, unknown>>(event) ?? {}
  const v = validateCommitmentBody(body, { partial: true })

  const sets: string[] = []
  const params: unknown[] = [tenantId, id]
  const add = (col: string, val: unknown) => {
    params.push(val)
    sets.push(`${col} = $${params.length}`)
  }

  if (body.supplier !== undefined) add('supplier', v.supplier)
  if (body.contactId !== undefined) add('contact_id', v.contactId)
  if (body.description !== undefined) add('description', v.description)
  if (body.amountCents !== undefined) add('amount_cents', v.amountCents)
  if (body.expectedDate !== undefined) add('expected_date', v.expectedDate)
  if (body.recurrence !== undefined) add('recurrence', v.recurrence)
  if (body.recurrenceEnd !== undefined) add('recurrence_end', v.recurrenceEnd)
  if (body.paymentAccount !== undefined) add('payment_account', v.paymentAccount)
  if (body.status !== undefined) add('status', v.status)
  if (body.confidence !== undefined) add('confidence', v.confidence)
  if (body.owner !== undefined) add('owner', v.owner)
  if (body.notes !== undefined) add('notes', v.notes)
  if (body.matchedInvoiceId !== undefined) {
    add('matched_invoice_id', body.matchedInvoiceId ? String(body.matchedInvoiceId) : null)
    if (body.matchedInvoiceId && body.status === undefined) add('status', 'matched')
  }

  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')

  const updated = await queryOne(
    `UPDATE cashflow_commitments SET ${sets.join(', ')}
     WHERE tenant_id = $1 AND id = $2
     RETURNING id`,
    params,
  )
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Commitment not found' })
  return { id: (updated as any).id }
})
