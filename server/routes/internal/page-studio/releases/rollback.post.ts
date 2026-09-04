import {
  PageStudioIdempotencyKeySchema,
  PageStudioReleaseRollbackSchema
} from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { rollbackPageStudioRelease } from '~~/server/utils/pageStudio/publishing'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const body = PageStudioReleaseRollbackSchema.safeParse(await readBody(event))
    const idempotencyKey = PageStudioIdempotencyKeySchema.safeParse(
      getHeader(event, 'idempotency-key')
    )
    if (!body.success || !idempotencyKey.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid release rollback',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid release rollback' } }
      })
    }
    return await rollbackPageStudioRelease({
      ...body.data,
      idempotencyKey: idempotencyKey.data
    })
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
