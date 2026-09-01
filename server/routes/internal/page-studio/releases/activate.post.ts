import {
  PageStudioIdempotencyKeySchema,
  PageStudioReleaseActivationSchema
} from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { activatePageStudioRelease } from '~~/server/utils/pageStudio/publishing'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const body = PageStudioReleaseActivationSchema.safeParse(await readBody(event))
    const idempotencyKey = PageStudioIdempotencyKeySchema.safeParse(
      getHeader(event, 'idempotency-key')
    )
    if (!body.success || !idempotencyKey.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid release activation',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid release activation' } }
      })
    }
    return await activatePageStudioRelease({
      ...body.data,
      expectedActiveReleaseId: body.data.expectedActiveReleaseId ?? null,
      idempotencyKey: idempotencyKey.data
    })
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
