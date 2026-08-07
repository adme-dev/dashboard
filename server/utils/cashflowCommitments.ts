/**
 * Validation shared by the commitment-register endpoints.
 *
 * A commitment is forecast intelligence, never an accounting document —
 * validation is deliberately strict on the enum fields so ledger-ish
 * states can't creep in.
 */

import { createError } from 'h3'

const RECURRENCES = new Set(['none', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'])
const ACCOUNTS = new Set(['NAB_BUSINESS', 'NAB_TAX', 'AMEX'])
const STATUSES = new Set(['expected', 'hold', 'disputed', 'matched', 'closed'])
const CONFIDENCES = new Set(['committed', 'probable', 'provisional'])
const SOURCES = new Set(['manual', 'spreadsheet-import', 'statutory-seed'])

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function bad(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

export interface CommitmentInput {
  supplier: string
  contactId: string | null
  description: string | null
  amountCents: number
  expectedDate: string
  recurrence: string
  recurrenceEnd: string | null
  paymentAccount: string
  status: string
  confidence: string
  owner: string | null
  notes: string | null
  source: string
}

export function validateCommitmentBody(body: Record<string, unknown>, opts: { partial: boolean }): CommitmentInput {
  const str = (k: string): string | null => {
    const raw = body[k]
    if (raw == null) return null
    const s = String(raw).trim()
    return s.length ? s : null
  }

  const supplier = str('supplier')
  if (!supplier && !opts.partial) bad('supplier is required')
  if (supplier && supplier.length > 120) bad('supplier must be 120 characters or fewer')

  const amountRaw = body.amountCents
  let amountCents = 0
  if (amountRaw != null) {
    amountCents = Math.round(Number(amountRaw))
    if (!Number.isFinite(amountCents) || amountCents <= 0) bad('amountCents must be a positive integer')
  } else if (!opts.partial) {
    bad('amountCents is required')
  }

  const expectedDate = str('expectedDate')
  if (!expectedDate && !opts.partial) bad('expectedDate is required')
  if (expectedDate && !ISO_DATE.test(expectedDate)) bad('expectedDate must be YYYY-MM-DD')

  const recurrence = str('recurrence') ?? 'none'
  if (!RECURRENCES.has(recurrence)) bad(`recurrence must be one of: ${[...RECURRENCES].join(', ')}`)

  const recurrenceEnd = str('recurrenceEnd')
  if (recurrenceEnd && !ISO_DATE.test(recurrenceEnd)) bad('recurrenceEnd must be YYYY-MM-DD')

  const paymentAccount = str('paymentAccount') ?? 'NAB_BUSINESS'
  if (!ACCOUNTS.has(paymentAccount)) bad(`paymentAccount must be one of: ${[...ACCOUNTS].join(', ')}`)

  const status = str('status') ?? 'expected'
  if (!STATUSES.has(status)) bad(`status must be one of: ${[...STATUSES].join(', ')}`)

  const confidence = str('confidence') ?? 'probable'
  if (!CONFIDENCES.has(confidence)) bad(`confidence must be one of: ${[...CONFIDENCES].join(', ')}`)

  const source = str('source') ?? 'manual'
  if (!SOURCES.has(source)) bad(`source must be one of: ${[...SOURCES].join(', ')}`)

  const notes = str('notes')
  if (notes && notes.length > 2000) bad('notes must be 2000 characters or fewer')

  return {
    supplier: supplier ?? '',
    contactId: str('contactId'),
    description: str('description'),
    amountCents,
    expectedDate: expectedDate ?? '',
    recurrence,
    recurrenceEnd,
    paymentAccount,
    status,
    confidence,
    owner: str('owner'),
    notes,
    source,
  }
}
