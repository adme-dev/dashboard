import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireMeasurementClientAccess } from '~~/server/utils/measurement/access'
import { throwMeasurementHttpError } from '~~/server/utils/measurement/http'
import { createMeasurementDestinationRuntime } from '~~/server/utils/measurement/runtime'
import { executeGodModeMeasurementDestinationCreate } from '~~/server/utils/measurement/configurationGodMode'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }

  const user = await requireMeasurementClientAccess(event, clientId, 'configure')
  const body = await readBody(event)

  try {
    return await executeGodModeMeasurementDestinationCreate(
      event,
      async (db) => await createMeasurementDestinationRuntime(event, db).create({
        clientId,
        expectedProfileVersion: body?.expectedProfileVersion,
        reason: body?.reason,
        actor: { type: 'team_member', id: user.id },
        destination: body?.destination
      }),
      async (db, resultReference) => {
        const page = await createMeasurementDestinationRuntime(event, db).list({
          clientId,
          page: 1,
          pageSize: 100
        })
        const destination = page.items.find(item => item.id === resultReference)
        if (!destination) {
          throw createError({ statusCode: 409, statusMessage: 'Measurement destination replay no longer matches' })
        }
        return {
          destination,
          profileConfigVersion: destination.configVersion,
          warnings: []
        }
      }
    )
  } catch (error) {
    throwMeasurementHttpError(error)
  }
})
