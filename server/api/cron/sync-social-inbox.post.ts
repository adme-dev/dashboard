import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { getProvider } from '~~/server/utils/social-providers/registry'
import { normalizeInboxItem } from '~~/server/utils/socialInbox/normalize'
import { recordInbound } from '~~/server/utils/socialInbox/store'

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
          if (res.inserted) synced++
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

  console.log('social-inbox-sync.run', { accounts: accounts.length, synced })
  return { synced }
})
