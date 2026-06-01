import { defineEventHandler, readRawBody, getHeader, createError } from 'h3'
import { queryOne, execute } from '~~/server/utils/db'
import { verifyMetaWebhookSignature } from '~~/server/utils/socialInbox/metaWebhook'
import { normalizeMetaCommentWebhook } from '~~/server/utils/socialInbox/normalize'
import { recordInbound } from '~~/server/utils/socialInbox/store'

/**
 * POST /api/webhooks/social/meta — Facebook/Instagram comment + mention events.
 * HMAC-verified (X-Hub-Signature-256). Routes each entry by page id → social_accounts → client,
 * normalizes comment `feed` changes, and records them idempotently. DM/mention channels (2d)
 * will extend the change handling here; 2a only ingests comments.
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
  for (const entry of payload.entry ?? []) {
    const pageId = String(entry.id ?? '')
    if (!pageId) continue
    const account = await queryOne<{ id: string; client_id: string }>(
      `SELECT id, client_id FROM social_accounts
         WHERE platform_account_id = $1 AND platform = $2 AND is_active = TRUE LIMIT 1`,
      [pageId, platform],
    )
    if (!account) continue
    for (const change of entry.changes ?? []) {
      const ev = normalizeMetaCommentWebhook(platform, change)
      if (ev) await recordInbound({ queryOne, execute }, account.client_id, account.id, ev)
    }
  }
  return { ok: true }
})
