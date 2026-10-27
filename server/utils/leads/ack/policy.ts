// server/utils/leads/ack/policy.ts
// Pure eligibility gates for visitor auto-acknowledgements. Each gate fails
// closed: a lead without positive evidence gets no email.

import { createHash } from 'node:crypto'
import type { Lead, LeadDelivery } from '~~/app/types'
import { singleEmailAddress } from '../emailHeaders'

export type LeadAckVerification = 'platform_lead_form'

/**
 * Whether the submission is verified as coming from a real person, without
 * trusting anything the browser sent. `attribution` and `field_data` are
 * visitor-influenced on website sources, so they are never consulted.
 *
 * - meta / google: submitted through the ad platform's own lead form by a
 *   signed-in platform user and delivered by a signed provider webhook.
 * - Website sources (page_studio, qr, webhook, email, csv, manual) have no
 *   persisted, server-side Turnstile proof on the lead today, so they are not
 *   eligible until one exists.
 */
export function leadAckVerification(lead: Pick<Lead, 'source'>): LeadAckVerification | null {
  return lead.source === 'meta' || lead.source === 'google' ? 'platform_lead_form' : null
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
