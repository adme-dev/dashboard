// server/utils/email-marketing/resendEvents.ts
// Phase 3: ingest Resend delivery/engagement webhook events → email_events +
// denormalized campaign counters + suppression of hard bounces/complaints.
// Idempotent on the Svix message id (stored as resend_event_id).

import { queryOne, execute } from '~~/server/utils/db'

// Resend event type → our normalized event_type, the campaigns counter column to
// bump (null = don't bump; 'sent' is already counted at send time), and whether
// it triggers global suppression. `email.sent` is recorded but not re-counted.
export interface ResendEventRule {
  eventType: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained'
  counterColumn: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | null
  suppress: false | 'hard_bounce' | 'complaint'
}

export const RESEND_EVENT_MAP: Record<string, ResendEventRule> = {
  'email.sent': { eventType: 'sent', counterColumn: null, suppress: false },
  'email.delivered': { eventType: 'delivered', counterColumn: 'delivered', suppress: false },
  'email.opened': { eventType: 'opened', counterColumn: 'opened', suppress: false },
  'email.clicked': { eventType: 'clicked', counterColumn: 'clicked', suppress: false },
  'email.bounced': { eventType: 'bounced', counterColumn: 'bounced', suppress: 'hard_bounce' },
  'email.complained': { eventType: 'complained', counterColumn: 'complained', suppress: 'complaint' }
}

export function ruleForResendType(type: string): ResendEventRule | null {
  return RESEND_EVENT_MAP[type] ?? null
}

export interface ResendWebhookPayload {
  type: string
  created_at?: string
  data?: {
    email_id?: string
    to?: string | string[]
    click?: { link?: string }
    [key: string]: unknown
  }
}

// Process one verified Resend event. `eventId` is the Svix message id (unique
// per delivery attempt) used for idempotency. Safe to call repeatedly.
export async function handleResendEvent(
  payload: ResendWebhookPayload,
  eventId: string
): Promise<{ status: 'recorded' | 'duplicate' | 'ignored' | 'unmatched' }> {
  const rule = ruleForResendType(payload.type)
  if (!rule) return { status: 'ignored' }

  const messageId = payload.data?.email_id
  if (!messageId) return { status: 'unmatched' }

  // Map the Resend message id back to our recipient → campaign + subscriber.
  const recipient = await queryOne<{ campaign_id: string, subscriber_id: string }>(
    'SELECT campaign_id, subscriber_id FROM campaign_recipients WHERE resend_message_id = $1',
    [messageId]
  )
  if (!recipient) return { status: 'unmatched' }

  const url = typeof payload.data?.click?.link === 'string' ? payload.data.click.link : null

  // Idempotent insert keyed on the Svix event id. If it conflicts, this delivery
  // was already processed → don't double-count.
  const inserted = await execute(`
    INSERT INTO email_events
      (campaign_id, subscriber_id, resend_message_id, resend_event_id, event_type, url, raw)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    ON CONFLICT (resend_event_id) DO NOTHING
  `, [
    recipient.campaign_id,
    recipient.subscriber_id,
    messageId,
    eventId,
    rule.eventType,
    url,
    JSON.stringify(payload)
  ])
  if (inserted === 0) return { status: 'duplicate' }

  // Bump the denormalized campaign counter (column name is from our fixed map,
  // never user input — safe to interpolate).
  if (rule.counterColumn) {
    await execute(
      `UPDATE campaigns SET ${rule.counterColumn} = ${rule.counterColumn} + 1, updated_at = NOW() WHERE id = $1`,
      [recipient.campaign_id]
    )
  }

  // Global suppression + blocklist on hard bounce / complaint.
  if (rule.suppress) {
    const email = await queryOne<{ email: string }>(
      'SELECT email::text AS email FROM email_subscribers WHERE id = $1',
      [recipient.subscriber_id]
    )
    if (email?.email) {
      await execute(`
        INSERT INTO suppression_list (email, reason, campaign_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO NOTHING
      `, [email.email, rule.suppress, recipient.campaign_id])
      await execute(
        `UPDATE email_subscribers SET status = 'blocklisted', updated_at = NOW() WHERE id = $1`,
        [recipient.subscriber_id]
      )
    }
  }

  return { status: 'recorded' }
}
