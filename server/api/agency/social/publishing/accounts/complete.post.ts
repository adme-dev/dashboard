import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, execute } from '~~/server/utils/db'
import { verifyState } from '~~/server/utils/socialOAuth/state'
import { mapPagesToAccountRows, subscribePageWebhook } from '~~/server/utils/socialOAuth/meta'
import { upsertSocialAccount, markWebhookSubscribed } from '~~/server/utils/socialOAuth/store'
import { getPending, delPending } from '~~/server/utils/socialOAuth/pending'

/**
 * POST /api/agency/social/publishing/accounts/complete  body { token, pageIds: string[] }
 * Finalizes the operator's page selection from the KV-stashed pending connection.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const { token, pageIds } = await readBody(event)
  if (!token || !Array.isArray(pageIds) || !pageIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'token and pageIds required' })
  }
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.META_APP_SECRET || ''
  const sel = verifyState<{ nonce: string; clientId: string; userId: string }>(String(token), secret, 600_000)
  if (!sel) throw createError({ statusCode: 400, statusMessage: 'invalid or expired selection' })

  const pending = await getPending(event, sel.nonce)
  if (!pending) throw createError({ statusCode: 410, statusMessage: 'selection expired' })

  const chosen = pending.pages.filter(p => pageIds.includes(p.id))
  if (!chosen.length) throw createError({ statusCode: 400, statusMessage: 'no matching pages' })

  const connected: string[] = []
  const conflicts: string[] = []
  for (const page of chosen) {
    const rows = mapPagesToAccountRows(page, pending.expiresAt)
    const sub = await subscribePageWebhook(page.id, page.accessToken)
    let conflict = false
    for (const row of rows) {
      row.metadata.webhook_subscribed = sub.ok
      const res = await upsertSocialAccount({ queryOne, execute }, pending.clientId, row, String(user.id))
      if (res.status === 'conflict') { conflict = true; conflicts.push(`${page.name} → ${res.conflictClientName || 'another client'}`); break }
      if (!sub.ok) await markWebhookSubscribed({ queryOne, execute }, res.id, false, `webhook subscribe failed: ${sub.error}`)
    }
    if (!conflict) connected.push(page.name)
  }
  await delPending(event, sel.nonce)
  return { connected, conflicts }
})
