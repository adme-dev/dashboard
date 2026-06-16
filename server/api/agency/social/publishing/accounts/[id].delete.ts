import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, execute } from '~~/server/utils/db'

/**
 * DELETE /api/agency/social/publishing/accounts/:id
 * Disconnect a publishing account. CREATIVE-permission gated.
 * Best-effort unsubscribes the Meta Page webhook first (never blocks the delete).
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const row = await queryOne<{ platform: string; platform_account_id: string; access_token: string | null; metadata: any }>(
    'SELECT platform, platform_account_id, access_token, metadata FROM social_accounts WHERE id = $1', [id])

  if (row?.platform === 'facebook' && row.access_token && row.metadata?.webhook_subscribed) {
    try {
      await fetch(
        `https://graph.facebook.com/v25.0/${row.platform_account_id}/subscribed_apps?access_token=${encodeURIComponent(row.access_token)}`,
        { method: 'DELETE' })
    } catch { /* ignore — the row is being deleted regardless */ }
  }

  await execute('DELETE FROM social_accounts WHERE id = $1', [id])
  return { ok: true }
})
