// server/utils/leads/destinations/autoresponderEmail.ts
// Opt-in acknowledgement to the visitor who submitted a lead. Only exists for
// a form when staff add this destination to its rule (default off).
// Gates, in order: config, synthetic lead, verified submission, recipient,
// sender configured, suppression, then the ledger (submission key, 24 h
// per form+recipient window, per-site daily cap).

import { Resend } from 'resend'
import { registerAdapter } from './registry'
import type { DestinationAdapter, DispatchResult, Lead, LeadDelivery } from './types'
import { checkLeadAckConfig, leadAckSenderAddress } from '../ack/config'
import {
  isSyntheticLead, leadAckFormKey, leadAckIdempotencyKey, leadAckRecipient,
  leadAckRecipientHash, leadAckVerification
} from '../ack/policy'
import { createPostgresLeadAckLedger, reserveLeadAck, type LeadAckLedger } from '../ack/ledger'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const skipped = (reason: string): DispatchResult => ({ status: 'skipped', reason: `ack_${reason}` })

export interface LeadAckDependencies {
  ledger: LeadAckLedger
  apiKey: () => string | undefined
  sender: () => string | null
  send: (apiKey: string, payload: Parameters<Resend['emails']['send']>[0], idempotencyKey: string)
  => Promise<{ id: string | null, error: string | null }>
}

const defaultDependencies = (): LeadAckDependencies => ({
  ledger: createPostgresLeadAckLedger(),
  apiKey: () => process.env.RESEND_API_KEY,
  sender: leadAckSenderAddress,
  async send(apiKey, payload, idempotencyKey) {
    const { data, error } = await new Resend(apiKey).emails.send(payload, { idempotencyKey })
    return { id: data?.id ?? null, error: error ? (error.message || 'resend_error') : null }
  }
})

export async function dispatchLeadAck(
  delivery: LeadDelivery,
  lead: Lead,
  rawConfig: unknown,
  deps: LeadAckDependencies = defaultDependencies()
): Promise<DispatchResult> {
  const checked = checkLeadAckConfig(rawConfig)
  if (!checked.valid) return skipped('config_invalid')
  if (isSyntheticLead(lead)) return skipped('synthetic_lead')
  if (lead.status === 'spam_suspected') return skipped('spam_suspected')
  if (!lead.client_id) return skipped('no_client')
  if (!leadAckVerification(lead)) return skipped('unverified')
  const recipient = leadAckRecipient(lead)
  if (!recipient) return skipped('no_recipient')
  const sender = deps.sender()
  if (!sender) return skipped('sender_unconfigured')
  const apiKey = deps.apiKey()
  if (!apiKey) return { status: 'failed', error: 'RESEND_API_KEY missing' }
  const { config } = checked

  try {
    if (await deps.ledger.isSuppressed(recipient)) return skipped('suppressed')
    const idempotencyKey = leadAckIdempotencyKey(lead, delivery)
    const reservation = await reserveLeadAck(deps.ledger, {
      idempotencyKey,
      clientId: lead.client_id,
      leadId: lead.id,
      ruleDestinationId: delivery.rule_destination_id,
      formKey: leadAckFormKey(lead),
      recipientHash: leadAckRecipientHash(recipient),
      dailyCap: config.daily_cap
    })
    if (reservation.outcome === 'already_sent') return { status: 'delivered', response_meta: { ack: 'already_sent' } }
    if (reservation.outcome !== 'reserved') return skipped(reservation.outcome)

    const sent = await deps.send(apiKey, {
      from: config.from_name ? `${config.from_name} <${sender}>` : sender,
      to: [recipient],
      replyTo: config.reply_to,
      subject: config.subject,
      text: config.body_text,
      html: `<p style="white-space:pre-wrap">${escapeHtml(config.body_text)}</p>`,
      headers: { 'X-Leads-Idempotency-Key': delivery.idempotency_key }
    }, `lead-ack/${idempotencyKey}`)
    if (sent.error) {
      await deps.ledger.markFailed(idempotencyKey)
      return { status: 'failed', error: `resend_error: ${sent.error}` }
    }
    await deps.ledger.markSent(idempotencyKey, sent.id)
    return { status: 'delivered', response_meta: { resend_id: sent.id } }
  } catch (e) {
    // The reservation (if any) stays counted; a retry resends under the same
    // provider idempotency key.
    return { status: 'failed', error: `ack_error: ${e instanceof Error ? e.message : String(e)}` }
  }
}

const adapter: DestinationAdapter<unknown> = {
  type: 'autoresponder_email',
  validateConfig(config) {
    const checked = checkLeadAckConfig(config)
    return checked.valid ? { valid: true } : { valid: false, errors: checked.errors }
  },
  dispatch(delivery, lead, config) {
    return dispatchLeadAck(delivery, lead, config)
  }
}

registerAdapter(adapter)
export default adapter
