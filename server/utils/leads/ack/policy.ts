// server/utils/leads/ack/policy.ts
// Pure eligibility gates for visitor auto-acknowledgements. Each gate fails
// closed: a lead without positive evidence gets no email.

import { createHash } from 'node:crypto'
import type { Lead, LeadDelivery } from '~~/app/types'
import { singleEmailAddress } from '../emailHeaders'

export type LeadAckVerification = 'platform_lead_form' | 'turnstile'

/** Reserved attribution key holding server-side verification evidence. Only
 * acceptLead writes it, from its trusted `ackVerification` argument, and it
 * strips any caller-supplied value first (see withLeadAckVerification). */
export const LEAD_ACK_VERIFICATION_KEY = 'xf_ack_verification'

// Each method is only evidence for the ingest path that can produce it.
const VERIFIED_SOURCES: Record<LeadAckVerification, ReadonlySet<Lead['source']>> = {
  // The ad platform's own lead form, fetched or delivered by its signed webhook.
  platform_lead_form: new Set(['meta', 'google']),
  // A hosted QR form whose Turnstile token passed server-side verification.
  turnstile: new Set(['qr'])
}

/** Drops any caller-supplied verification key, then records `method` when the
 * trusted ingest path supplies one. */
export function withLeadAckVerification(
  attribution: Record<string, string> | null,
  method: LeadAckVerification | undefined
): Record<string, string> | null {
  const { [LEAD_ACK_VERIFICATION_KEY]: _dropped, ...rest } = attribution ?? {}
  if (method) return { ...rest, [LEAD_ACK_VERIFICATION_KEY]: method }
  return attribution ? rest : null
}

/**
 * Whether the submission is verified as coming from a real person. `source`
 * alone is not evidence: CSV imports, manual entry and generic webhooks can
 * all claim `meta` or `google`. Only the server-written key counts, and only
 * for the source that can produce it, on a lead no staff member created.
 * Page Studio forms pass mandatory Turnstile, but that proof is not linked to
 * the lead yet, so they stay ineligible.
 */
export function leadAckVerification(
  lead: Pick<Lead, 'source' | 'attribution' | 'created_by'>
): LeadAckVerification | null {
  if (lead.created_by) return null
  const method = lead.attribution?.[LEAD_ACK_VERIFICATION_KEY] as LeadAckVerification | undefined
  if (!method || !Object.hasOwn(VERIFIED_SOURCES, method)) return null
  return VERIFIED_SOURCES[method].has(lead.source) ? method : null
}

/** Synthetic leads: flagged test data, capture-test runs, and the rule
 * editor's test-fire fake leads (which are never persisted). */
export function isSyntheticLead(lead: Pick<Lead, 'is_test' | 'test_run_id' | 'source_lead_id'>): boolean {
  return Boolean(lead.is_test)
    || Boolean(lead.test_run_id)
    || String(lead.source_lead_id ?? '').startsWith('test-fire:')
}

export function leadAckRecipient(lead: Pick<Lead, 'field_data'>): string | null {
  return singleEmailAddress(lead.field_data?.email)
}

export function leadAckFormKey(lead: Pick<Lead, 'source' | 'form_id'>): string {
  return `${lead.source}:${lead.form_id ?? ''}`
}

/** Pseudonymous recipient identity for the dedupe ledger (no raw address stored). */
export function leadAckRecipientHash(address: string): string {
  return createHash('sha256').update(`lead-ack-recipient:${address.toLowerCase()}`).digest('hex')
}

/** One key per submission and acknowledgement destination. Lead identity is
 * the submission identity (`source`, `source_lead_id`), so a re-ingested or
 * replayed submission maps to the same key even under a new lead row. */
export function leadAckIdempotencyKey(
  lead: Pick<Lead, 'client_id' | 'source' | 'source_lead_id'>,
  delivery: Pick<LeadDelivery, 'rule_destination_id' | 'idempotency_key'>
): string {
  return createHash('sha256')
    .update(['lead-ack', lead.client_id ?? '', lead.source, lead.source_lead_id, delivery.rule_destination_id ?? delivery.idempotency_key].join('\u0000'))
    .digest('hex')
}
