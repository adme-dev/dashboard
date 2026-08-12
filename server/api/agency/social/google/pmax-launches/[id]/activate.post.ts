import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '~~/server/utils/auth'
import {
  executeGooglePmaxActivation,
  GooglePmaxExecutionGateError
} from '~~/server/utils/googlePmaxExecutionService'
import { getGooglePmaxLaunch, GooglePmaxLaunchConflictError } from '~~/server/utils/googlePmaxLaunchStore'
import { GooglePmaxPausedExecutorError } from '~~/server/utils/googlePmaxPausedExecutor'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'ADMIN')
  const tenantId = await getSelectedTenant(event)
  const launchId = getRouterParam(event, 'id')
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!launchId) throw createError({ statusCode: 400, statusMessage: 'Launch ID is required' })
  const launch = await getGooglePmaxLaunch({ launchId, tenantId })
  if (!launch) throw createError({ statusCode: 404, statusMessage: 'Launch plan not found' })
  await requireSocialClientAccess(event, launch.clientId)

  try {
    return await executeGooglePmaxActivation({ event, launchId, tenantId, actorId: user.id })
  } catch (error: unknown) {
    if (error instanceof GooglePmaxExecutionGateError) {
      throw createError({ statusCode: 503, statusMessage: error.message })
    }
    if (
      error instanceof GooglePmaxLaunchConflictError
      || error instanceof GooglePmaxPausedExecutorError
    ) throw createError({ statusCode: 409, statusMessage: error.message })
    console.error('[google-pmax-activate] provider unavailable', {
      errorClass: error instanceof Error ? error.name : 'UnknownError'
    })
    throw createError({ statusCode: 502, statusMessage: 'Google PMax activation is temporarily unavailable' })
  }
})
