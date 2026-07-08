import { requireRole } from '~~/server/utils/auth'
import { deactivateDealerLink } from '~~/server/utils/feeds/dealerLinkStore'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const clientId = event.context.params?.clientId
  const query = getQuery(event)
  const providerId = typeof query.providerId === 'string' ? query.providerId : undefined

  try {
    const link = await deactivateDealerLink(clientId || '', { providerId })
    return { ok: true, link }
  } catch (error: any) {
    const message = error?.message || 'Failed to deactivate dealer feed link'
    const statusCode = /required|not found/i.test(message) ? 404 : 500
    if (statusCode >= 500) console.error('[dealer-feed-links] deactivate failed:', error)
    throw createError({ statusCode, statusMessage: message })
  }
})
