import { requireAuth } from '~~/server/utils/auth'
import { MANUAL_SYNC_RUN_TIMEOUT_MS } from '~~/server/utils/socialInbox/syncBudget'

interface SocialInboxSyncChannelResult {
  accountId: string
  accountName?: string | null
  platform: string
  channelType: string
  status: 'success' | 'error' | 'skipped'
  synced: number
  error?: string
}

interface SocialInboxSyncResult {
  synced: number
  automated?: number
  breaches?: number
  skipped?: number
  timedOut?: boolean
  channels?: SocialInboxSyncChannelResult[]
}

const internalFetch = (<T = unknown>(
  request: string,
  options: { method: string; headers?: Record<string, string>; body?: unknown }
) => (globalThis as any).$fetch(request, options) as Promise<T>) as <T = unknown>(
  request: string,
  options: { method: string; headers?: Record<string, string>; body?: unknown }
) => Promise<T>

/**
 * POST /api/agency/social/inbox/accounts/sync
 * Manual "Refresh" — triggers the poll dispatcher immediately rather than waiting for the
 * 5-min cron tick. Syncs all active accounts (the dispatcher is global); the UI then reloads
 * the current client's conversations.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body: { clientId?: string | null } = await readBody<{ clientId?: string | null }>(event).catch(() => ({}))
  const result = await internalFetch<SocialInboxSyncResult>('/api/cron/sync-social-inbox', {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET || '' },
    body: {
      ...(body?.clientId ? { clientId: body.clientId } : {}),
      maxMs: MANUAL_SYNC_RUN_TIMEOUT_MS
    }
  })
  return result
})
