import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '~~/server/utils/auth'
import { getGooglePmaxLaunch } from '~~/server/utils/googlePmaxLaunchStore'
import { getLatestGooglePmaxOnboardingAttestation } from '~~/server/utils/googlePmaxOnboardingAttestation'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')
  const tenantId = await getSelectedTenant(event)
  const launchId = getRouterParam(event, 'id')
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!launchId) throw createError({ statusCode: 400, statusMessage: 'Launch ID is required' })
  const launch = await getGooglePmaxLaunch({ launchId, tenantId })
  if (!launch) throw createError({ statusCode: 404, statusMessage: 'Launch plan not found' })
  await requireSocialClientAccess(event, launch.clientId)

  const current = await getLatestGooglePmaxOnboardingAttestation({
    launchId,
    tenantId,
    configVersion: launch.configVersion,
    configHash: launch.configHash
  })
  const attestation = current || await getLatestGooglePmaxOnboardingAttestation({
    launchId,
    tenantId,
    configVersion: launch.configVersion,
    configHash: launch.configHash,
    activeOnly: false
  })
  return { attestation, active: Boolean(current) }
})
