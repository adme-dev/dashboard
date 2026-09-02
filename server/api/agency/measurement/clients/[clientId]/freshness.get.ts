import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireMeasurementClientAccess } from '~~/server/utils/measurement/access'
import { measurementFreshnessRepository } from '~~/server/utils/measurement/freshnessRepository'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  await requireMeasurementClientAccess(event, clientId, 'view')
  return await measurementFreshnessRepository.list({ clientId })
})
