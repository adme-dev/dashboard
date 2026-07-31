import type { H3Event } from 'h3'
import type { ServerClientUser } from '~~/server/utils/clientAuth'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import {
  isUuid,
  requireClientTrackingAccess
} from '~~/server/utils/tracking/analytics-access'
import { isSearchAuthorityEnabled } from './feature'

type AgencySearchAuthorityUser = Awaited<ReturnType<typeof requireClientTrackingAccess>>

export interface AgencySearchAuthorityAccessOptions {
  requireEntitlement?: boolean
  requireClientAccess?: (
    event: H3Event,
    clientId: string
  ) => Promise<AgencySearchAuthorityUser>
  isEnabled?: (clientId: string) => Promise<boolean>
}

export interface PortalSearchAuthorityAccessOptions {
  requirePortalAuth?: (event: H3Event) => Promise<ServerClientUser>
  isEnabled?: (clientId: string) => Promise<boolean>
}

function featureUnavailable(): never {
  throw createError({
    statusCode: 404,
    statusMessage: 'Search Authority is not available for this client'
  })
}

export async function requireAgencySearchAuthorityAccess(
  event: H3Event,
  clientId: string | undefined,
  options: AgencySearchAuthorityAccessOptions = {}
): Promise<AgencySearchAuthorityUser> {
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'clientId is required' })
  }
  if (!isUuid(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
  }

  const requireClientAccess = options.requireClientAccess ?? requireClientTrackingAccess
  const user = await requireClientAccess(event, clientId)

  if (options.requireEntitlement !== false) {
    const isEnabled = options.isEnabled ?? isSearchAuthorityEnabled
    if (!await isEnabled(clientId)) featureUnavailable()
  }

  return user
}

export async function requirePortalSearchAuthorityAccess(
  event: H3Event,
  options: PortalSearchAuthorityAccessOptions = {}
): Promise<ServerClientUser> {
  const requirePortalAuth = options.requirePortalAuth ?? requireClientAuth
  const user = await requirePortalAuth(event)

  if (!user.permissions.canViewAnalytics) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Analytics access is required'
    })
  }

  const isEnabled = options.isEnabled ?? isSearchAuthorityEnabled
  if (!await isEnabled(user.clientId)) featureUnavailable()

  return user
}
