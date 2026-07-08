import { requireRole } from '~~/server/utils/auth'
import { listDealerLinks } from '~~/server/utils/feeds/dealerLinkStore'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const query = getQuery(event)
  const status = typeof query.status === 'string' && query.status.trim() ? query.status : 'active'
  const providerId = typeof query.providerId === 'string' ? query.providerId : undefined
  const clientId = typeof query.clientId === 'string' ? query.clientId : undefined

  try {
    const links = await listDealerLinks({ status, providerId, clientId })
    return { ok: true, links }
  } catch (error: any) {
    console.error('[dealer-feed-links] list failed:', error)
    throw createError({ statusCode: 500, statusMessage: error?.message || 'Failed to list dealer feed links' })
  }
})
