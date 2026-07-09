import { requireRole } from '~~/server/utils/auth'
import { upsertDealerLink } from '~~/server/utils/feeds/dealerLinkStore'
import { resolveDealerFeedOrganization } from '~~/server/utils/feeds/organizationResolver'
import { cloudflareRuntimeEnv } from '~~/server/utils/feeds/serverContext'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const body = await readBody(event)

  try {
    const externalOrgId = await resolveDealerFeedOrganization({
      clientId: body?.clientId,
      actingUserEmail: user.email || user.id,
      externalOrgId: body?.externalOrgId,
      sellerRefs: body?.sellerRefs,
      platforms: body?.platforms
    }, { runtimeEnv: cloudflareRuntimeEnv(event) })

    const link = await upsertDealerLink({
      clientId: body?.clientId,
      providerId: body?.providerId,
      externalOrgId,
      sellerRefs: body?.sellerRefs,
      defaultFeedIds: body?.defaultFeedIds,
      status: body?.status
    }, { actorId: user.id })

    return { ok: true, link }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upsert dealer feed link'
    const statusCode = /required|not found/i.test(message) ? 400 : 500
    if (statusCode >= 500) console.error('[dealer-feed-links] upsert failed:', error)
    throw createError({ statusCode, statusMessage: message })
  }
})
