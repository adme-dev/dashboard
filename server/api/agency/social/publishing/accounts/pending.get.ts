import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryRows } from '~~/server/utils/db'
import { verifyState } from '~~/server/utils/socialOAuth/state'
import { getPending } from '~~/server/utils/socialOAuth/pending'

/**
 * GET ...accounts/pending?token=  → the page names for the selection modal (NEVER any token).
 * Cross-references social_accounts so the modal can pre-check/flag pages already connected to this
 * client and disable pages owned by another client.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.META_APP_SECRET || ''
  const sel = verifyState<{ nonce: string; userId: string }>(String(getQuery(event).token || ''), secret, 600_000)
  if (!sel) throw createError({ statusCode: 400, statusMessage: 'invalid token' })
  if (sel.userId !== String(user.id)) throw createError({ statusCode: 403, statusMessage: 'not your selection' })

  const pending = await getPending(event, sel.nonce)
  if (!pending) throw createError({ statusCode: 410, statusMessage: 'expired' })

  // Which of these pages already exist as facebook accounts, and for which client?
  const ids = pending.pages.map(p => p.id)
  const existing = ids.length
    ? await queryRows<{ platform_account_id: string; client_id: string }>(
        `SELECT platform_account_id, client_id FROM social_accounts WHERE platform = 'facebook' AND platform_account_id = ANY($1)`,
        [ids])
    : []
  const owner = new Map(existing.map(e => [e.platform_account_id, e.client_id]))

  return pending.pages.map((p) => {
    const ownerId = owner.get(p.id)
    const status = !ownerId ? 'new' : ownerId === pending.clientId ? 'connected' : 'conflict'
    return { id: p.id, name: p.name, igUsername: p.igUsername, status }
  })
})
