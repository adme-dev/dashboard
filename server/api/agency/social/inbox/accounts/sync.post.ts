import { requireAuth } from '~~/server/utils/auth'

/**
 * POST /api/agency/social/inbox/accounts/sync
 * Manual "Refresh" — triggers the poll dispatcher immediately rather than waiting for the
 * 5-min cron tick. Syncs all active accounts (the dispatcher is global); the UI then reloads
 * the current client's conversations.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body: { clientId?: string | null } = await readBody<{ clientId?: string | null }>(event).catch(() => ({}))
  const result = await $fetch<{ synced: number }>('/api/cron/sync-social-inbox', {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET || '' },
    body: body?.clientId ? { clientId: body.clientId } : {},
  })
  return result
})
