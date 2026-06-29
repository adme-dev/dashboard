import { requireAuth } from '~~/server/utils/auth'
import { MANUAL_SYNC_RUN_TIMEOUT_MS } from '~~/server/utils/socialInbox/syncBudget'

/**
 * POST /api/agency/social/inbox/accounts/sync
 * Manual "Refresh" — triggers the poll dispatcher immediately rather than waiting for the
 * 5-min cron tick. Syncs all active accounts (the dispatcher is global); the UI then reloads
 * the current client's conversations.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body: { clientId?: string | null } = await readBody<{ clientId?: string | null }>(event).catch(() => ({}))
  const result = await $fetch<{ synced: number; automated?: number; breaches?: number; skipped?: number; timedOut?: boolean }>('/api/cron/sync-social-inbox', {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET || '' },
    body: {
      ...(body?.clientId ? { clientId: body.clientId } : {}),
      maxMs: MANUAL_SYNC_RUN_TIMEOUT_MS,
    },
  })
  return result
})
