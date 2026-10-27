// server/utils/leads/ack/events.ts
// Feeds hard bounces and complaints on visitor acknowledgements into the
// global suppression list, so the next acknowledgement (or campaign) skips the
// address. Called by the Resend webhook for messages that are not campaign sends.

import { execute, queryOne } from '~~/server/utils/db'
import { recordSuppressionEvent } from '~~/server/utils/email-marketing/audit'
import { singleEmailAddress } from '../emailHeaders'
import { leadAckRecipientHash } from './policy'

const UNDEFINED_TABLE = '42P01'

export async function suppressBouncedLeadAck(input: {
  messageId: string
  reason: 'hard_bounce' | 'complaint'
  to: unknown
  eventId: string
  resendType: string
}): Promise<boolean> {
  let row: { recipient_hash: string } | null
  try {
    row = await queryOne<{ recipient_hash: string }>(
      'SELECT recipient_hash FROM lead_ack_sends WHERE provider_message_id = $1 LIMIT 1', [input.messageId])
  } catch (error) {
    // Before migration 483 is applied there are no acknowledgements to match.
    if ((error as { code?: string })?.code === UNDEFINED_TABLE) return false
    throw error
  }
  if (!row) return false
  // Acknowledgements have exactly one recipient; it must be the one we hashed.
  const to = Array.isArray(input.to) && input.to.length === 1 ? input.to[0] : input.to
  const address = singleEmailAddress(to)
  if (!address || leadAckRecipientHash(address) !== row.recipient_hash) return false
  const inserted = await execute(`
    INSERT INTO suppression_list (email, reason)
    VALUES ($1, $2)
    ON CONFLICT (email) DO UPDATE
      SET reason = EXCLUDED.reason, updated_at = NOW()
      WHERE suppression_list.reason = 'soft_bounce'
  `, [address, input.reason])
  await recordSuppressionEvent({
    email: address,
    reason: input.reason,
    action: inserted > 0 ? 'added' : 'ignored',
    source: 'webhook',
    metadata: { resendEventId: input.eventId, resendMessageId: input.messageId, resendType: input.resendType, origin: 'lead_ack' }
  })
  return true
}
