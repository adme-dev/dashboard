import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { recordSocialPublishingAudit } from '~~/server/utils/socialPublishing/audit'
import {
  executeGodModeSocialPublishingAccountDisconnect
} from '~~/server/utils/social/publishingAccountGodMode'

interface SocialAccountDisconnectRow {
  client_id: string
  platform: string
  platform_account_id: string
  access_token: string | null
  metadata: Record<string, unknown> | null
}

interface SocialAccountDisconnectResult {
  id: string
  row: SocialAccountDisconnectRow | null
}

/**
 * DELETE /api/agency/social/publishing/accounts/:id
 * Disconnect a publishing account. CREATIVE-permission gated.
 * Best-effort unsubscribes the Meta Page webhook without blocking the durable disconnect.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const result = await executeGodModeSocialPublishingAccountDisconnect<SocialAccountDisconnectResult>(event, async (db) => {
    const locked = await db.query(
      `SELECT client_id, platform, platform_account_id, access_token, metadata
         FROM social_accounts
        WHERE id = $1
        FOR UPDATE`,
      [id]
    )
    const current = locked.rows[0] as SocialAccountDisconnectRow | undefined
    if (!current) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
    await requireSocialClientAccess(event, current.client_id)

    await recordSocialPublishingAudit({
      clientId: current.client_id,
      socialAccountId: id,
      actorId: user.id,
      action: 'account_disconnected',
      metadata: { platform: current.platform, platformAccountId: current.platform_account_id }
    }, async (sql, params) => await db.query(sql, params))
    // Persist while the account still satisfies the audit table's foreign key. Its ON DELETE SET NULL
    // action then preserves the immutable event after the publishing credential row is removed.
    await db.query('DELETE FROM social_accounts WHERE id = $1 AND client_id = $2', [id, current.client_id])
    return { id, row: current }
  }, async (_db, resultReference) => {
    if (resultReference !== id) {
      throw createError({ statusCode: 409, statusMessage: 'Account disconnection replay belongs to another account' })
    }
    return { id, row: null }
  })

  if (result.row?.platform === 'facebook' && result.row.access_token && result.row.metadata?.webhook_subscribed) {
    try {
      await fetch(
        `https://graph.facebook.com/v25.0/${result.row.platform_account_id}/subscribed_apps?access_token=${encodeURIComponent(result.row.access_token)}`,
        { method: 'DELETE' })
    } catch { /* ignore — the row is being deleted regardless */ }
  }
  return { ok: true }
})
