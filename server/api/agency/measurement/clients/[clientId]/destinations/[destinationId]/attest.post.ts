import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireMeasurementClientAccess } from '~~/server/utils/measurement/access'
import { throwMeasurementHttpError } from '~~/server/utils/measurement/http'
import { createMeasurementAttestationRuntime } from '~~/server/utils/measurement/runtime'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  const destinationId = getRouterParam(event, 'destinationId')
  if (!clientId || !destinationId) {
    throw createError({ statusCode: 400, statusMessage: 'Client and destination IDs are required' })
  }

  const user = await requireMeasurementClientAccess(event, clientId, 'configure')
  const body = await readBody(event)

  try {
    return await createMeasurementAttestationRuntime(event).attest({
      ...body,
      clientId,
      destinationId,
      actor: { id: user.id }
    })
  } catch (error) {
    throwMeasurementHttpError(error)
  }
})
