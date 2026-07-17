import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireMeasurementClientAccess } from '~~/server/utils/measurement/access'
import { throwMeasurementHttpError } from '~~/server/utils/measurement/http'
import { createMeasurementProfileRuntime } from '~~/server/utils/measurement/runtime'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }

  await requireMeasurementClientAccess(event, clientId, 'view')
  const service = createMeasurementProfileRuntime(event)

  try {
    return { profile: await service.get(clientId) }
  } catch (error) {
    throwMeasurementHttpError(error)
  }
})
