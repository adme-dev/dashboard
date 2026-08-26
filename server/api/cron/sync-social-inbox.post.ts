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
import { startSocialInboxAutomationWorkflow } from '~~/server/utils/agencyWorkflows/client'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import { findBreaches } from '~~/server/utils/socialInbox/sla'
import { getSocialInboxPollChannels, type SocialInboxPollChannel } from '~~/server/utils/socialInbox/syncChannels'
import { resolveSocialInboxAccessToken } from '~~/server/utils/socialInbox/tokenRefresh'
import {
  DEFAULT_SYNC_RUN_TIMEOUT_MS,
  PROVIDER_SYNC_TIMEOUT_MS,
  createSyncBudget,
  normaliseSyncMaxMs,
  withSyncTimeout
} from '~~/server/utils/socialInbox/syncBudget'
import { createNotification } from '~~/server/utils/notifications'
import { isSocialDmEnabled } from '~~/server/utils/socialOAuth/meta'
import { buildSocialInboxAccountsQuery } from '~~/server/utils/socialInbox/syncAccounts'

/**
 * POST /api/cron/sync-social-inbox
 * Poll dispatcher for the engagement inbox. Invoked by the social-inbox-cron companion Worker
 * every ~5 min (Cloudflare Pages has no scheduled() handler). For each active account whose
 * provider supports fetchInbox, pulls new comments/reviews since the per-account/per-channel
 * cursor and records them idempotently. Meta comments arrive separately via the webhook.
 */
interface SocialInboxSyncChannelRun {
  accountId: string
  accountName: string | null
  platform: string
  channelType: SocialInboxPollChannel
  status: 'success' | 'error' | 'skipped'
  synced: number
  error?: string
}

interface SocialInboxAccountRow {
  id: string
  client_id: string
  platform: string
  platform_account_id: string
  account_name: string | null
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body: { clientId?: string | null, maxMs?: number | null } = await readBody<{ clientId?: string | null, maxMs?: number | null }>(event).catch(() => ({}))
  const budget = createSyncBudget(normaliseSyncMaxMs(body?.maxMs, DEFAULT_SYNC_RUN_TIMEOUT_MS))
  const { sql, params } = buildSocialInboxAccountsQuery(body?.clientId)
  const accounts = await queryRows<SocialInboxAccountRow>(sql, params)

  let synced = 0
  let skipped = 0
  let timedOut = false
  const channels: SocialInboxSyncChannelRun[] = []
  for (const acct of accounts) {
    const provider = getProvider(acct.platform)
    const fetchInbox = provider?.fetchInbox
    if (!fetchInbox) continue
    for (const channel of getSocialInboxPollChannels(acct.platform, { messagingEnabled: isSocialDmEnabled() })) {
      const channelRun: SocialInboxSyncChannelRun = {
        accountId: acct.id,
        accountName: acct.account_name ?? null,
        platform: acct.platform,
        channelType: channel,
        status: 'success',
        synced: 0
      }
      channels.push(channelRun)
      const providerTimeoutMs = budget.timeoutFor(PROVIDER_SYNC_TIMEOUT_MS)
      if (providerTimeoutMs < 1_000) {
        skipped++
        timedOut = true
        channelRun.status = 'skipped'
        channelRun.error = 'Sync time limit reached before this channel could start.'
        continue
      }
      const cur = await queryOne<{ cursor: string | null }>(
        `SELECT cursor FROM social_sync_cursors WHERE social_account_id = $1 AND channel_type = $2`,
        [acct.id, channel]
      )
      try {
        const { items, nextCursor } = await withSyncTimeout(
          (async () => {
            const accessToken = await resolveSocialInboxAccessToken({
              event,
              db: { execute },
              account: acct
            })
            return fetchInbox({
              accountId: acct.platform_account_id,
              accessToken,
              channelType: channel,
              cursor: cur?.cursor ?? null
            })
          })(),
          providerTimeoutMs,
          `${acct.platform}:${channel}`
        )
        for (const item of items.filter(i => i.channelType === channel)) {
          if (budget.expired(1_000)) {
            skipped++
            timedOut = true
            break
          }
          const normalized = normalizeInboxItem(acct.platform, item)
          const res = await recordInbound({ queryOne, execute }, acct.client_id, acct.id, normalized)
          if (res.inserted) {
            synced++
            channelRun.synced++
            emitInboxEvent({ clientId: acct.client_id, type: 'message.added', conversationId: res.conversationId }, event)
            if (normalized.message.direction === 'in') {
              await onInboundRecorded({ queryOne, queryRows, execute }, {
                notifyAssigned: (userId, conversationId, clientId) => createNotification({
                  userId, type: 'social_assigned', title: 'New conversation assigned',
                  message: 'A social conversation was auto-assigned to you.',
                  link: `/agency/social/inbox?c=${conversationId}`, metadata: { conversationId, clientId }
                }).then(() => {}),
                startAutomationWorkflow: workflow =>
                  startSocialInboxAutomationWorkflow(event, workflow).then(() => {})
              }, {
                conversationId: res.conversationId,
                clientId: acct.client_id,
                channelType: item.channelType,
                messageId: normalized.message.platformMessageId ?? undefined
              })
            }
          }
        }
        await execute(
          `INSERT INTO social_sync_cursors (social_account_id, channel_type, cursor, last_synced_at, last_error, updated_at)
           VALUES ($1, $2, $3, NOW(), NULL, NOW())
           ON CONFLICT (social_account_id, channel_type) DO UPDATE SET
             cursor = EXCLUDED.cursor, last_synced_at = NOW(), last_error = NULL, updated_at = NOW()`,
          [acct.id, channel, nextCursor ?? null]
        )
      } catch (error: unknown) {
        const message = getErrorMessage(error)
        if (/timed out/i.test(message)) timedOut = true
        channelRun.status = 'error'
        channelRun.error = message.slice(0, 500)
        await execute(
          `INSERT INTO social_sync_cursors (social_account_id, channel_type, last_synced_at, last_error, updated_at)
           VALUES ($1, $2, NOW(), $3, NOW())
           ON CONFLICT (social_account_id, channel_type) DO UPDATE SET
             last_synced_at = NOW(), last_error = $3, updated_at = NOW()`,
          [acct.id, channel, message.slice(0, 500)]
        )
      }
    }
  }

  // --- Phase 2b: automation pass (fully dormant unless the master gate is on) ---
  let automated = 0
  if (!budget.expired(5_000) && isSocialAutomationEnabled()) {
    const engineDb = { queryOne, queryRows, execute }
    const deps = {
      generateDraft: generateReplyDraft,
      dispatch: (a: { conversationId: string, clientId: string, content: string, aiGenerated: boolean, queueId: string }) =>
        dispatchReply(engineDb, a.conversationId, { content: a.content, sentByUserId: 'automation', aiGenerated: a.aiGenerated })
    }
    const r = await processPendingAutomation(engineDb, deps, 50)
    automated = r.processed
  }

  // SLA breach scan — flag overdue unanswered conversations and notify the assignee.
  let breaches = 0
  if (budget.expired(5_000)) {
    timedOut = true
  } else {
    try {
      const breached = await findBreaches({ queryOne, queryRows, execute })
      breaches = breached.length
      for (const b of breached) {
        if (b.assigned_to) {
          await createNotification({
            userId: b.assigned_to, type: 'social_sla_breach', title: 'SLA breached',
            message: 'A social conversation passed its first-response SLA.',
            link: `/agency/social/inbox?c=${b.id}`, sendEmail: true, metadata: { conversationId: b.id, clientId: b.client_id }
          })
        }
      }
    } catch (error: unknown) {
      console.error('social-inbox-sla.error', getErrorMessage(error))
    }
  }

  console.log('social-inbox-sync.run', { accounts: accounts.length, synced, automated, breaches, skipped, timedOut })
  return { synced, automated, breaches, skipped, timedOut, channels }
})
