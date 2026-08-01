import { requireRole } from '~~/server/utils/auth'
import { isUuid, requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { siteIntelligenceDomainInputSchema } from '~~/server/utils/siteIntelligence/contracts'
import { updateSiteIntelligenceDomain } from '~~/server/utils/siteIntelligence/repository'
import { assertPublicSiteOrigin } from '~~/server/utils/siteIntelligence/urlPolicy'

const DOMAIN_ADMIN_ROLES = ['owner', 'admin'] as const

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, DOMAIN_ADMIN_ROLES)
  const domainId = getRouterParam(event, 'id')
  if (!isUuid(domainId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site intelligence domain id' })
  }

  const parsed = siteIntelligenceDomainInputSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site intelligence domain' })
  }
  await requireClientTrackingAccess(event, parsed.data.clientId)

  let origin: string
  try {
    origin = await assertPublicSiteOrigin(parsed.data.origin)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Public HTTP(S) origin required' })
  }

  try {
    const domain = await updateSiteIntelligenceDomain(
      user,
      domainId!,
      { ...parsed.data, origin }
    )
    if (!domain) {
      throw createError({ statusCode: 404, statusMessage: 'Site intelligence domain not found' })
    }
    return { domain }
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'This domain is already monitored for the selected client and lane'
      })
    }
    throw error
  }
})
