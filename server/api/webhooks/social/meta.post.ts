import { defineEventHandler, readRawBody, getHeader, createError } from 'h3'
import { queryOne, execute } from '~~/server/utils/db'
import { verifyMetaWebhookSignature } from '~~/server/utils/socialInbox/metaWebhook'
import {
  normalizeMetaCommentWebhook, normalizeMetaMentionWebhook, normalizeMetaMessageWebhook,
} from '~~/server/utils/socialInbox/normalize'
import { recordInbound } from '~~/server/utils/socialInbox/store'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import type { NormalizedEvent } from '~~/server/utils/socialInbox/types'

/**
 * POST /api/webhooks/social/meta — Facebook/Instagram engagement events.
 * HMAC-verified (X-Hub-Signature-256). Routes each entry by page/IG id → social_accounts → client.
 * Handles `feed` comments + `mention` changes (entry.changes[]) and DMs (entry.messaging[]).
 * Comments/reviews ship today; DMs + mentions are App-Review-gated (Slice 2d) — the Page is only
 * subscribed to those fields once SOCIAL_DM_ENABLED, so they simply never arrive until activated.
 */
export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event)) || ''
  const sig = getHeader(event, 'x-hub-signature-256')
  const secret = process.env.META_APP_SECRET || ''
  if (!import.meta.dev && !verifyMetaWebhookSignature(raw, sig, secret)) {
    throw createError({ statusCode: 401, statusMessage: 'bad signature' })
  }

  let payload: any
  try { payload = JSON.parse(raw || '{}') } catch { throw createError({ statusCode: 400, statusMessage: 'bad json' }) }

  const platform = payload.object === 'instagram' ? 'instagram' : 'facebook'

  const ingest = async (account: { id: string; client_id: string }, ev: NormalizedEvent | null) => {
    if (!ev) return
    const rec = await recordInbound({ queryOne, execute }, account.client_id, account.id, ev)
    if (rec.inserted) emitInboxEvent({ clientId: account.client_id, type: 'message.added', conversationId: rec.conversationId }, event)
  }

  for (const entry of payload.entry ?? []) {
    const accountId = String(entry.id ?? '')
    if (!accountId) continue
    const account = await queryOne<{ id: string; client_id: string }>(
      `SELECT id, client_id FROM social_accounts
         WHERE platform_account_id = $1 AND platform = $2 AND is_active = TRUE LIMIT 1`,
      [accountId, platform],
    )
    if (!account) continue
    // Comments + mentions (entry.changes[]).
    for (const change of entry.changes ?? []) {
      await ingest(account, normalizeMetaCommentWebhook(platform, change) ?? normalizeMetaMentionWebhook(platform, change))
    }
    // DMs (entry.messaging[]) — Messenger / IG direct messages.
    for (const messaging of entry.messaging ?? []) {
      await ingest(account, normalizeMetaMessageWebhook(platform, messaging))
    }
  }
  return { ok: true }
})
