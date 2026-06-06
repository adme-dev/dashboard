// server/utils/email-marketing/resendEvents.ts
// Phase 3: ingest Resend delivery/engagement webhook events → email_events +
// denormalized campaign counters + suppression of hard bounces/complaints.
// Idempotent on the Svix message id (stored as resend_event_id).

import { queryOne, execute } from '~~/server/utils/db'
import { recordSuppressionEvent } from './audit'

// Resend event type → our normalized event_type, the campaigns counter column to
// bump (null = don't bump; 'sent' is already counted at send time), and whether
// it triggers global suppression. `email.sent` is recorded but not re-counted.
export interface ResendEventRule {
  eventType: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'delivery_delayed'
  counterColumn: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | null
  suppress: false | 'hard_bounce' | 'complaint'
  softBounce?: boolean
}

export const RESEND_EVENT_MAP: Record<string, ResendEventRule> = {
  'email.sent': { eventType: 'sent', counterColumn: null, suppress: false },
  'email.delivered': { eventType: 'delivered', counterColumn: 'delivered', suppress: false },
  'email.delivery_delayed': { eventType: 'delivery_delayed', counterColumn: null, suppress: false, softBounce: true },
  'email.opened': { eventType: 'opened', counterColumn: 'opened', suppress: false },
  'email.clicked': { eventType: 'clicked', counterColumn: 'clicked', suppress: false },
  'email.bounced': { eventType: 'bounced', counterColumn: 'bounced', suppress: 'hard_bounce' },
  'email.complained': { eventType: 'complained', counterColumn: 'complained', suppress: 'complaint' }
}

export function ruleForResendType(type: string): ResendEventRule | null {
  return RESEND_EVENT_MAP[type] ?? null
}

export function softBounceSuppressionThreshold(): number | null {
  const value = Number.parseInt(process.env.EMAIL_SOFT_BOUNCE_SUPPRESSION_THRESHOLD || '', 10)
  return Number.isFinite(value) && value >= 2 ? value : null
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

  if (rule.eventType === 'delivered') {
    const reset = await queryOne<{ email: string }>(
      `UPDATE email_subscribers
       SET soft_bounce_count = 0,
           last_soft_bounce_at = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND soft_bounce_count > 0
       RETURNING email::text AS email`,
      [recipient.subscriber_id]
    )
    if (reset?.email) {
      const removed = await execute(`
        DELETE FROM suppression_list
        WHERE email = $1
          AND reason = 'soft_bounce'
      `, [reset.email])
      if (removed > 0) {
        await recordSuppressionEvent({
          email: reset.email,
          subscriberId: recipient.subscriber_id,
          campaignId: recipient.campaign_id,
          reason: 'soft_bounce',
          action: 'removed',
          source: 'webhook',
          metadata: {
            resendEventId: eventId,
            resendMessageId: messageId,
            resendType: payload.type
          }
        })
      }
    }
  }

  if (rule.softBounce) {
    const email = await queryOne<{ email: string, soft_bounce_count?: number }>(
      'SELECT email::text AS email, soft_bounce_count::int AS soft_bounce_count FROM email_subscribers WHERE id = $1',
      [recipient.subscriber_id]
    )
    if (email?.email) {
      const nextSoftBounceCount = Number(email.soft_bounce_count ?? 0) + 1
      await execute(
        `UPDATE email_subscribers
         SET soft_bounce_count = soft_bounce_count + 1,
             last_soft_bounce_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [recipient.subscriber_id]
      )
      await recordSuppressionEvent({
        email: email.email,
        subscriberId: recipient.subscriber_id,
        campaignId: recipient.campaign_id,
        reason: 'soft_bounce',
        action: 'recorded',
        source: 'webhook',
        metadata: {
          resendEventId: eventId,
          resendMessageId: messageId,
          resendType: payload.type
        }
      })
      const threshold = softBounceSuppressionThreshold()
      if (threshold && nextSoftBounceCount >= threshold) {
        const suppressionInserted = await execute(`
          INSERT INTO suppression_list (email, reason, campaign_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (email) DO NOTHING
        `, [email.email, 'soft_bounce', recipient.campaign_id])
        await recordSuppressionEvent({
          email: email.email,
          subscriberId: recipient.subscriber_id,
          campaignId: recipient.campaign_id,
          reason: 'soft_bounce',
          action: suppressionInserted > 0 ? 'added' : 'ignored',
          source: 'webhook',
          metadata: {
            resendEventId: eventId,
            resendMessageId: messageId,
            resendType: payload.type,
            softBounceCount: nextSoftBounceCount,
            threshold
          }
        })
      }
    }
  }

  // Global suppression + blocklist on hard bounce / complaint.
  if (rule.suppress) {
    const email = await queryOne<{ email: string }>(
      'SELECT email::text AS email FROM email_subscribers WHERE id = $1',
      [recipient.subscriber_id]
    )
    if (email?.email) {
      const suppressionInserted = await execute(`
        INSERT INTO suppression_list (email, reason, campaign_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO UPDATE
          SET reason = EXCLUDED.reason,
              campaign_id = EXCLUDED.campaign_id,
              updated_at = NOW()
          WHERE suppression_list.reason = 'soft_bounce'
      `, [email.email, rule.suppress, recipient.campaign_id])
      await recordSuppressionEvent({
        email: email.email,
        subscriberId: recipient.subscriber_id,
        campaignId: recipient.campaign_id,
        reason: rule.suppress,
        action: suppressionInserted > 0 ? 'added' : 'ignored',
        source: 'webhook',
        metadata: {
          resendEventId: eventId,
          resendMessageId: messageId,
          resendType: payload.type
        }
      })
      await execute(
        `UPDATE email_subscribers SET status = 'blocklisted', updated_at = NOW() WHERE id = $1`,
        [recipient.subscriber_id]
      )
    }
  }

  return { status: 'recorded' }
}
