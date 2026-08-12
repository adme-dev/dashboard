import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '~~/server/utils/auth'
import { runGooglePmaxLaunchPreflight } from '~~/server/utils/googlePmaxLaunchPreflightService'
import {
  getGooglePmaxLaunch,
  GooglePmaxLaunchConflictError
} from '~~/server/utils/googlePmaxLaunchStore'
import { GooglePmaxLaunchOrchestratorError } from '~~/server/utils/googlePmaxLaunchOrchestrator'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'MEDIA_BUYING')
  const tenantId = await getSelectedTenant(event)
  const launchId = getRouterParam(event, 'id')
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!launchId) throw createError({ statusCode: 400, statusMessage: 'Launch ID is required' })
  const launch = await getGooglePmaxLaunch({ launchId, tenantId })
  if (!launch) throw createError({ statusCode: 404, statusMessage: 'Launch plan not found' })
  await requireSocialClientAccess(event, launch.clientId)

  try {
    return await runGooglePmaxLaunchPreflight({
      event,
      launchId,
      tenantId,
      actorId: user.id,
      actorEmail: user.email
    })
  } catch (error: unknown) {
    if (
      error instanceof GooglePmaxLaunchConflictError
      || error instanceof GooglePmaxLaunchOrchestratorError
    ) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    console.error('[google-pmax-preflight] orchestration unavailable', {
      errorClass: error instanceof Error ? error.name : 'UnknownError'
    })
    throw createError({ statusCode: 502, statusMessage: 'Google PMax preflight is temporarily unavailable' })
  }
})
