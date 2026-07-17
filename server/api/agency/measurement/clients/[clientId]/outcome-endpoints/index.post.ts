import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireMeasurementClientAccess } from '~~/server/utils/measurement/access'
import { throwMeasurementHttpError } from '~~/server/utils/measurement/http'
import { createMeasurementOutcomeEndpointRuntime } from '~~/server/utils/measurement/runtime'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }

  const user = await requireMeasurementClientAccess(event, clientId, 'configure')
  const body = await readBody(event)
  const service = createMeasurementOutcomeEndpointRuntime(event)

  try {
    return await service.create({
      clientId,
      expectedProfileVersion: body?.expectedProfileVersion,
      actor: { type: 'team_member', id: user.id },
      reason: body?.reason,
      endpoint: body?.endpoint
    })
  } catch (error) {
    throwMeasurementHttpError(error)
  }
})
