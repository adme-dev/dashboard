import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireMeasurementOwnerOverrideAccess } from '~~/server/utils/measurement/access'
import { throwMeasurementHttpError } from '~~/server/utils/measurement/http'
import { createMeasurementActivationRuntime } from '~~/server/utils/measurement/runtime'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }

  const user = await requireMeasurementOwnerOverrideAccess(event, clientId)
  const body = await readBody(event)
  const service = createMeasurementActivationRuntime(event)

  try {
    return await service.approve({
      clientId,
      expectedConfigVersion: body?.expectedConfigVersion,
      approvalKind: 'live',
      actor: { type: 'team_member', id: user.id },
      reason: body?.reason,
      separationOverride: true
    })
  } catch (error) {
    throwMeasurementHttpError(error)
  }
})
