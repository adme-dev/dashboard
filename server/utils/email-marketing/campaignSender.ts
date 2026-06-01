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
import { RESEND_BATCH_LIMIT, buildBatchEmail, isRateLimitError, parseRetryAfter, canEnterSending, buildCampaignBridgeInput } from './campaignSend'
import { bridgeCommunication } from '~~/server/utils/crm/commsDb'
import { signEmailToken, emailLinkSecret } from './links'
import { getCampaign, materializeRecipients, setCampaignStatus, type Campaign } from './campaigns'

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
// Atomic claim under FOR UPDATE SKIP LOCKED so an overlapping /send click and a
// cron dispatch tick never grab the same rows. Sets claimed_at; the row stays
// 'pending' until the batch succeeds (→ 'sent') or hard-fails (→ 'failed'); a
// 429 releases the claim (claimed_at → NULL) so it's retried next pass.
async function claimPendingChunk(campaignId: string, size: number): Promise<RecipientRow[]> {
  return queryRows<RecipientRow>(`
    UPDATE campaign_recipients cr
    SET claimed_at = NOW()
    FROM (
      SELECT id FROM campaign_recipients
      WHERE campaign_id = $1 AND status = 'pending' AND claimed_at IS NULL
      ORDER BY created_at
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    ) sel
    WHERE cr.id = sel.id
    RETURNING cr.id, cr.subscriber_id, cr.email::text AS email,
      (SELECT s.name FROM email_subscribers s WHERE s.id = cr.subscriber_id) AS name
  `, [campaignId, size])
}

async function releaseClaims(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await execute('UPDATE campaign_recipients SET claimed_at = NULL WHERE id = ANY($1::uuid[])', [ids])
}

// Watchdog: free rows whose claim went stale (sender crashed after claiming,
// before sending), so the next dispatch tick re-sends them.
export async function releaseStaleClaims(campaignId: string, olderThanMinutes = 10): Promise<number> {
  return execute(`
    UPDATE campaign_recipients
    SET claimed_at = NULL
    WHERE campaign_id = $1 AND status = 'pending' AND claimed_at IS NOT NULL
      AND claimed_at < NOW() - MAKE_INTERVAL(mins => $2)
  `, [campaignId, olderThanMinutes])
}

async function countPending(campaignId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM campaign_recipients WHERE campaign_id = $1 AND status = $2',
    [campaignId, 'pending']
  )
  return row?.n ?? 0
}

export interface ChunkResult { sent: number, failed: number, rateLimited: boolean, retryAfterSec: number }

// Send one batch chunk for a campaign. Gated — throws if sending is disabled so
// no path reaches Resend by accident. On 429 the claim is released (not failed)
// so the recipients retry on the next pass.
export async function sendCampaignChunk(campaign: Campaign): Promise<ChunkResult> {
  if (!isCampaignSendingEnabled()) {
    throw createError({ statusCode: 403, statusMessage: 'sending_disabled' })
  }
  const client = getResendClient()
  if (!client) throw createError({ statusCode: 503, statusMessage: 'resend_unavailable' })

  const recipients = await claimPendingChunk(campaign.id, RESEND_BATCH_LIMIT)
  if (recipients.length === 0) return { sent: 0, failed: 0, rateLimited: false, retryAfterSec: 0 }

  const appUrl = getAppUrl()
  const secret = emailLinkSecret()
  const payload = await Promise.all(recipients.map(async r =>
    buildBatchEmail(
      campaign,
      { email: r.email, name: r.name, subscriber_id: r.subscriber_id },
      campaign.id,
      appUrl,
      await signEmailToken(secret, 'unsub', campaign.id, r.subscriber_id)
    )
  ))

  let sent = 0
  let failed = 0
  try {
    const { data, error } = await client.batch.send(payload)
    if (error) {
      if (isRateLimitError(error)) {
        await releaseClaims(recipients.map(r => r.id))
        return { sent: 0, failed: 0, rateLimited: true, retryAfterSec: parseRetryAfter(undefined) }
      }
      throw new Error(error.message || 'batch_send_failed')
    }
    const ids = (data?.data ?? []) as Array<{ id: string }>
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i]
      if (!r) continue
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
      // F10 bridge: log this send onto the CRM timeline when the recipient maps
      // to a CRM person. Gated + idempotent inside bridgeCommunication; never let
      // a CRM failure abort the batch loop.
      const bridge = buildCampaignBridgeInput(campaign, { email: r.email, subscriber_id: r.subscriber_id })
      if (bridge) {
        try { await bridgeCommunication(bridge) } catch (e) { console.warn('crmBridge.email.error', e) }
      }
      sent++
    }
  } catch (err) {
    if (isRateLimitError(err)) {
      await releaseClaims(recipients.map(r => r.id))
      return { sent: 0, failed: 0, rateLimited: true, retryAfterSec: parseRetryAfter(undefined) }
    }
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
  return { sent, failed, rateLimited: false, retryAfterSec: 0 }
}

export interface SendRunResult {
  sent: number
  failed: number
  remaining: number
  drained: boolean
  rateLimited: boolean
}

// Drive a campaign's send in a capped, paced loop (≤2 req/s → ~500ms between
// batches, under Resend's default cap). Capped at maxChunks per invocation to
// keep one request/tick bounded; larger campaigns continue on the next cron
// dispatch tick (state persists in campaign_recipients → resumable). Stops early
// on a 429 so the next tick backs off.
export async function runCampaignSend(
  campaign: Campaign,
  opts: { maxChunks?: number, pacingMs?: number } = {}
): Promise<SendRunResult> {
  const maxChunks = opts.maxChunks ?? 50
  const pacingMs = opts.pacingMs ?? 500
  let sent = 0
  let failed = 0
  let rateLimited = false
  for (let i = 0; i < maxChunks; i++) {
    const result = await sendCampaignChunk(campaign)
    sent += result.sent
    failed += result.failed
    if (result.rateLimited) {
      rateLimited = true
      break
    }
    if (result.sent === 0 && result.failed === 0) break
    if (i < maxChunks - 1) await new Promise(resolve => setTimeout(resolve, pacingMs))
  }
  const remaining = await countPending(campaign.id)
  return { sent, failed, remaining, drained: remaining === 0, rateLimited }
}

// ── Dispatcher (cron-driven) ────────────────────────────────────────────────
// One tick of the campaign engine: promote due scheduled campaigns, then drain
// in-flight ones a bounded amount (paced). Single-flight by design — the cron
// runs one tick at a time, giving global ≤2 req/s pacing without the
// multi-consumer 429 self-DoS a parallel queue fan-out risks. Resumable + a
// watchdog (releaseStaleClaims) by virtue of all state living in
// campaign_recipients. Gated: a no-op when sending is disabled.
export interface DispatchSummary {
  skipped?: string
  promoted: number
  drained: number
  sent: number
  failed: number
}

export async function dispatchCampaigns(opts: { maxChunksPerCampaign?: number } = {}): Promise<DispatchSummary> {
  if (!isCampaignSendingEnabled()) {
    return { skipped: 'sending_disabled', promoted: 0, drained: 0, sent: 0, failed: 0 }
  }

  // 1. Promote due scheduled campaigns (re-checking the send gate first).
  const due = await queryRows<{ id: string }>(`
    SELECT id FROM campaigns
    WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
  `)
  let promoted = 0
  for (const c of due) {
    try {
      await materializeRecipients(c.id)
      const full = await getCampaign(c.id)
      if (!full) continue
      const gate = canEnterSending({ status: full.status, toSend: full.to_send, bodyHtml: full.body_html })
      if (!gate.ok) {
        console.warn(`[campaign-dispatch] scheduled campaign ${c.id} blocked: ${gate.reason}`)
        continue
      }
      await setCampaignStatus(c.id, 'sending')
      promoted++
    } catch (err) {
      console.error(`[campaign-dispatch] promote failed for ${c.id}:`, err)
    }
  }

  // 2. Drain in-flight campaigns (bounded per tick; stale claims released first).
  const sending = await queryRows<Campaign>(`SELECT * FROM campaigns WHERE status = 'sending'`)
  let sent = 0
  let failed = 0
  let drained = 0
  for (const campaign of sending) {
    try {
      await releaseStaleClaims(campaign.id)
      const result = await runCampaignSend(campaign, { maxChunks: opts.maxChunksPerCampaign ?? 50 })
      sent += result.sent
      failed += result.failed
      if (result.drained) {
        await setCampaignStatus(campaign.id, 'sent')
        drained++
      }
    } catch (err) {
      console.error(`[campaign-dispatch] drain failed for ${campaign.id}:`, err)
    }
  }

  return { promoted, drained, sent, failed }
}
