import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { requireMeasurementClientAccess } from '~~/server/utils/measurement/access'
import { throwMeasurementHttpError } from '~~/server/utils/measurement/http'
import { createMeasurementDestinationRuntime } from '~~/server/utils/measurement/runtime'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }

  await requireMeasurementClientAccess(event, clientId, 'view')
  const query = getQuery(event)
  const service = createMeasurementDestinationRuntime(event)

  try {
    return await service.list({
      clientId,
      page: query.page,
      pageSize: query.pageSize,
      platform: query.platform
    })
  } catch (error) {
    throwMeasurementHttpError(error)
  }
})
