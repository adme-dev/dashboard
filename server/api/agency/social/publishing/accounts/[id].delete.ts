import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, execute } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { recordSocialPublishingAudit } from '~~/server/utils/socialPublishing/audit'

interface SocialAccountDisconnectRow {
  client_id: string
  platform: string
  platform_account_id: string
  access_token: string | null
  metadata: Record<string, unknown> | null
}

/**
 * DELETE /api/agency/social/publishing/accounts/:id
 * Disconnect a publishing account. CREATIVE-permission gated.
 * Best-effort unsubscribes the Meta Page webhook first (never blocks the delete).
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const row = await queryOne<SocialAccountDisconnectRow>(
    'SELECT client_id, platform, platform_account_id, access_token, metadata FROM social_accounts WHERE id = $1',
    [id]
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
  await requireSocialClientAccess(event, row.client_id)

  if (row?.platform === 'facebook' && row.access_token && row.metadata?.webhook_subscribed) {
    try {
      await fetch(
        `https://graph.facebook.com/v25.0/${row.platform_account_id}/subscribed_apps?access_token=${encodeURIComponent(row.access_token)}`,
        { method: 'DELETE' })
    } catch { /* ignore — the row is being deleted regardless */ }
  }

  await execute('DELETE FROM social_accounts WHERE id = $1 AND client_id = $2', [id, row.client_id])
  await recordSocialPublishingAudit({
    clientId: row.client_id,
    socialAccountId: id,
    actorId: user.id,
    action: 'account_disconnected',
    metadata: { platform: row.platform, platformAccountId: row.platform_account_id }
  })
  return { ok: true }
})
