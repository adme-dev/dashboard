import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { requireMeasurementClientAccess } from '~~/server/utils/measurement/access'
import { createMeasurementEventLineageService } from '~~/server/utils/measurement/eventLineage'
import { throwMeasurementHttpError } from '~~/server/utils/measurement/http'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }

  await requireMeasurementClientAccess(event, clientId, 'view')
  const service = createMeasurementEventLineageService()

  try {
    return await service.list(clientId, getQuery(event))
  } catch (error) {
    throwMeasurementHttpError(error)
  }
})
