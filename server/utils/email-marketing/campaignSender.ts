// server/utils/email-marketing/campaignSender.ts
// The chunked campaign send engine (Phase 2b-2a). Behind a HARD GATE:
// isCampaignSendingEnabled() defaults closed, so building/deploying never sends.
// Pure helpers (merge tags, batch payload) live in campaignSend.ts and are
// unit-tested; the Resend Batch call here is reached only when the operator
// explicitly enables sending.
//
// NOTE (2b-2b, deferred): true fan-out + cross-request resumability moves the
// per-chunk work onto CF Queues with FOR UPDATE SKIP LOCKED claiming + a cron
// watchdog. This module sends synchronously in a capped, paced loop for now.

import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { getResendClient, getAppUrl, isEmailConfigured } from '~~/server/utils/email'
import { RESEND_BATCH_LIMIT, buildBatchEmail } from './campaignSend'
import type { Campaign } from './campaigns'

export interface RecipientRow {
  id: string
  subscriber_id: string
  email: string
  name: string | null
}

// ── Hard send gate ────────────────────────────────────────────────────────
// Sending is OFF unless the operator sets EMAIL_SENDING_ENABLED='true' AND a
// Resend key is configured. This is the single switch that lets real email out.
export function isCampaignSendingEnabled(): boolean {
  return process.env.EMAIL_SENDING_ENABLED === 'true' && isEmailConfigured()
}

// ── DB: claim a chunk of pending recipients ─────────────────────────────────
// 2b-2a single-flight claim. 2b-2b will switch to FOR UPDATE SKIP LOCKED for
// concurrent queue consumers.
async function claimPendingChunk(campaignId: string, size: number): Promise<RecipientRow[]> {
  return queryRows<RecipientRow>(`
    SELECT cr.id, cr.subscriber_id, cr.email::text AS email, s.name
    FROM campaign_recipients cr
    JOIN email_subscribers s ON s.id = cr.subscriber_id
    WHERE cr.campaign_id = $1 AND cr.status = 'pending'
    ORDER BY cr.created_at
    LIMIT $2
  `, [campaignId, size])
}

async function countPending(campaignId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM campaign_recipients WHERE campaign_id = $1 AND status = $2',
    [campaignId, 'pending']
  )
  return row?.n ?? 0
}

export interface ChunkResult { sent: number, failed: number }

// Send one batch chunk for a campaign. Gated — throws if sending is disabled so
// no path reaches Resend by accident.
export async function sendCampaignChunk(campaign: Campaign): Promise<ChunkResult> {
  if (!isCampaignSendingEnabled()) {
    throw createError({ statusCode: 403, statusMessage: 'sending_disabled' })
  }
  const client = getResendClient()
  if (!client) throw createError({ statusCode: 503, statusMessage: 'resend_unavailable' })

  const recipients = await claimPendingChunk(campaign.id, RESEND_BATCH_LIMIT)
  if (recipients.length === 0) return { sent: 0, failed: 0 }

  const appUrl = getAppUrl()
  const payload = recipients.map(r =>
    buildBatchEmail(campaign, { email: r.email, name: r.name, subscriber_id: r.subscriber_id }, campaign.id, appUrl)
  )

  let sent = 0
  let failed = 0
  try {
    const { data, error } = await client.batch.send(payload)
    if (error) throw new Error(error.message || 'batch_send_failed')
    const ids = (data?.data ?? []) as Array<{ id: string }>
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i]
      const messageId = ids[i]?.id ?? null
      await execute(`
        UPDATE campaign_recipients
        SET status = 'sent', resend_message_id = $2, attempts = attempts + 1, sent_at = NOW()
        WHERE id = $1
      `, [r.id, messageId])
      await execute(`
        INSERT INTO email_events (campaign_id, subscriber_id, resend_message_id, event_type)
        VALUES ($1, $2, $3, 'sent')
      `, [campaign.id, r.subscriber_id, messageId])
      sent++
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send_failed'
    for (const r of recipients) {
      await execute(`
        UPDATE campaign_recipients
        SET status = 'failed', attempts = attempts + 1, error = $2
        WHERE id = $1
      `, [r.id, message.slice(0, 500)])
      failed++
    }
  }

  await execute(
    'UPDATE campaigns SET sent = sent + $2, updated_at = NOW() WHERE id = $1',
    [campaign.id, sent]
  )
  return { sent, failed }
}

export interface SendRunResult { sent: number, failed: number, remaining: number, drained: boolean }

// Drive a campaign's send in a capped, paced loop (≤2 req/s → ~500ms between
// batches, under Resend's default cap). Capped at maxChunks per invocation to
// keep a single request bounded; larger campaigns continue on the next call
// (2b-2b moves this to the queue for unbounded, resumable fan-out).
export async function runCampaignSend(
  campaign: Campaign,
  opts: { maxChunks?: number, pacingMs?: number } = {}
): Promise<SendRunResult> {
  const maxChunks = opts.maxChunks ?? 50
  const pacingMs = opts.pacingMs ?? 500
  let sent = 0
  let failed = 0
  for (let i = 0; i < maxChunks; i++) {
    const result = await sendCampaignChunk(campaign)
    sent += result.sent
    failed += result.failed
    if (result.sent === 0 && result.failed === 0) break
    if (i < maxChunks - 1) await new Promise(resolve => setTimeout(resolve, pacingMs))
  }
  const remaining = await countPending(campaign.id)
  return { sent, failed, remaining, drained: remaining === 0 }
}
