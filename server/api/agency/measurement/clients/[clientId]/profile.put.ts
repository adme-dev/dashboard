import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireMeasurementClientAccess } from '~~/server/utils/measurement/access'
import { throwMeasurementHttpError } from '~~/server/utils/measurement/http'
import { createMeasurementProfileRuntime } from '~~/server/utils/measurement/runtime'
import { executeGodModeMeasurementProfileUpdate } from '~~/server/utils/measurement/configurationGodMode'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }

  const user = await requireMeasurementClientAccess(event, clientId, 'configure')
  const body = await readBody(event)

  try {
    return await executeGodModeMeasurementProfileUpdate(
      event,
      async (db) => await createMeasurementProfileRuntime(event, db).update({
        clientId,
        expectedVersion: body?.expectedVersion,
        reason: body?.reason,
        actor: { type: 'team_member', id: user.id },
        patch: body?.patch
      }),
      async (db, resultReference) => {
        const profile = await createMeasurementProfileRuntime(event, db).get(clientId)
        if (profile.id !== resultReference) {
          throw createError({ statusCode: 409, statusMessage: 'Measurement profile replay no longer matches' })
        }
        return { profile, warnings: [] }
      }
    )
  } catch (error) {
    throwMeasurementHttpError(error)
  }
})
