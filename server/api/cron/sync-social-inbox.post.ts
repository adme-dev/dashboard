import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { getProvider } from '~~/server/utils/social-providers/registry'
import { normalizeInboxItem } from '~~/server/utils/socialInbox/normalize'
import { recordInbound } from '~~/server/utils/socialInbox/store'
import { isSocialAutomationEnabled } from '~~/server/utils/socialInbox/automationGate'
import { processPendingAutomation } from '~~/server/utils/socialInbox/automation'
import { generateReplyDraft } from '~~/server/utils/socialInbox/aiDraft'
import { dispatchReply } from '~~/server/utils/socialInbox/dispatch'
import { onInboundRecorded } from '~~/server/utils/socialInbox/workflow'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import { findBreaches } from '~~/server/utils/socialInbox/sla'
import { createNotification } from '~~/server/utils/notifications'

/**
 * POST /api/cron/sync-social-inbox
 * Poll dispatcher for the engagement inbox. Invoked by the social-inbox-cron companion Worker
 * every ~5 min (Cloudflare Pages has no scheduled() handler). For each active account whose
 * provider supports fetchInbox, pulls new comments/reviews since the per-account/per-channel
 * cursor and records them idempotently. Meta comments arrive separately via the webhook.
 */
const POLL_CHANNELS: Record<string, Array<'comment' | 'review'>> = {
  youtube: ['comment'],
  linkedin: ['comment'],
  tiktok: ['comment'],
  'google-business': ['review'],
  facebook: ['review'],
}

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const accounts = await queryRows<any>(
    `SELECT id, client_id, platform, platform_account_id, access_token
       FROM social_accounts WHERE is_active = TRUE AND access_token IS NOT NULL`,
  )

  let synced = 0
  for (const acct of accounts) {
    const provider = getProvider(acct.platform)
    if (!provider?.fetchInbox) continue
    for (const channel of POLL_CHANNELS[acct.platform] ?? []) {
      const cur = await queryOne<{ cursor: string | null }>(
        `SELECT cursor FROM social_sync_cursors WHERE social_account_id = $1 AND channel_type = $2`,
        [acct.id, channel],
      )
      try {
        const { items, nextCursor } = await provider.fetchInbox({
          accountId: acct.platform_account_id,
          accessToken: acct.access_token,
          cursor: cur?.cursor ?? null,
        })
        for (const item of items.filter(i => i.channelType === channel)) {
          const res = await recordInbound({ queryOne, execute }, acct.client_id, acct.id, normalizeInboxItem(acct.platform, item))
          if (res.inserted) {
            synced++
            emitInboxEvent({ clientId: acct.client_id, type: 'message.added', conversationId: res.conversationId }, event)
            await onInboundRecorded({ queryOne, queryRows, execute }, {
              notifyAssigned: (userId, conversationId, clientId) => createNotification({
                userId, type: 'social_assigned', title: 'New conversation assigned',
                message: 'A social conversation was auto-assigned to you.',
                link: `/agency/social/inbox?c=${conversationId}`, metadata: { conversationId, clientId },
              }).then(() => {}),
            }, { conversationId: res.conversationId, clientId: acct.client_id, channelType: item.channelType })
          }
        }
        await execute(
          `INSERT INTO social_sync_cursors (social_account_id, channel_type, cursor, last_synced_at, last_error, updated_at)
           VALUES ($1, $2, $3, NOW(), NULL, NOW())
           ON CONFLICT (social_account_id, channel_type) DO UPDATE SET
             cursor = EXCLUDED.cursor, last_synced_at = NOW(), last_error = NULL, updated_at = NOW()`,
          [acct.id, channel, nextCursor ?? null],
        )
      } catch (e: any) {
        await execute(
          `INSERT INTO social_sync_cursors (social_account_id, channel_type, last_synced_at, last_error, updated_at)
           VALUES ($1, $2, NOW(), $3, NOW())
           ON CONFLICT (social_account_id, channel_type) DO UPDATE SET
             last_synced_at = NOW(), last_error = $3, updated_at = NOW()`,
          [acct.id, channel, String(e?.message ?? e).slice(0, 500)],
        )
      }
    }
  }

  // --- Phase 2b: automation pass (fully dormant unless the master gate is on) ---
  let automated = 0
  if (isSocialAutomationEnabled()) {
    const engineDb = { queryOne, queryRows, execute }
    const deps = {
      generateDraft: generateReplyDraft,
      dispatch: (a: { conversationId: string; clientId: string; content: string; aiGenerated: boolean; queueId: string }) =>
        dispatchReply(engineDb, a.conversationId, { content: a.content, sentByUserId: 'automation', aiGenerated: a.aiGenerated }),
    }
    const r = await processPendingAutomation(engineDb, deps, 50)
    automated = r.processed
  }

  // SLA breach scan — flag overdue unanswered conversations and notify the assignee.
  let breaches = 0
  try {
    const breached = await findBreaches({ queryOne, queryRows, execute })
    breaches = breached.length
    for (const b of breached) {
      if (b.assigned_to) {
        await createNotification({
          userId: b.assigned_to, type: 'social_sla_breach', title: 'SLA breached',
          message: 'A social conversation passed its first-response SLA.',
          link: `/agency/social/inbox?c=${b.id}`, sendEmail: true, metadata: { conversationId: b.id, clientId: b.client_id },
        })
      }
    }
  } catch (e: any) { console.error('social-inbox-sla.error', String(e?.message ?? e)) }

  console.log('social-inbox-sync.run', { accounts: accounts.length, synced, automated, breaches })
  return { synced, automated, breaches }
})
