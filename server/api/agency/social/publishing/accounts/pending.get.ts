import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { verifyState } from '~~/server/utils/socialOAuth/state'
import { getPending } from '~~/server/utils/socialOAuth/pending'

/** GET ...accounts/pending?token=  → the page names for the selection modal (no tokens leaked). */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.META_APP_SECRET || ''
  const sel = verifyState<{ nonce: string }>(String(getQuery(event).token || ''), secret, 600_000)
  if (!sel) throw createError({ statusCode: 400, statusMessage: 'invalid token' })
  const pending = await getPending(event, sel.nonce)
  if (!pending) throw createError({ statusCode: 410, statusMessage: 'expired' })
  return pending.pages.map(p => ({ id: p.id, name: p.name, igUsername: p.igUsername }))
})
