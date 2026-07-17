import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireMeasurementClientAccess } from '~~/server/utils/measurement/access'
import { throwMeasurementHttpError } from '~~/server/utils/measurement/http'
import { createMeasurementDestinationRuntime } from '~~/server/utils/measurement/runtime'

export default defineEventHandler(async (event) => {
  const destinationId = getRouterParam(event, 'destinationId')
  if (!destinationId) {
    throw createError({ statusCode: 400, statusMessage: 'Destination ID is required' })
  }

  const body = await readBody(event)
  const clientId = body?.clientId
  const user = await requireMeasurementClientAccess(event, clientId, 'configure')
  const service = createMeasurementDestinationRuntime(event)

  try {
    return await service.update({
      clientId,
      destinationId,
      expectedProfileVersion: body?.expectedProfileVersion,
      reason: body?.reason,
      actor: { type: 'team_member', id: user.id },
      patch: body?.patch
    })
  } catch (error) {
    throwMeasurementHttpError(error)
  }
})
