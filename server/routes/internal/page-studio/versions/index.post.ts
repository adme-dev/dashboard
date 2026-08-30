import { registerPageStudioVersion } from '~~/server/utils/pageStudio/controlStore'
import {
  PageStudioIdempotencyKeySchema,
  PageStudioVersionRegistrationSchema
} from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const parsed = PageStudioVersionRegistrationSchema.safeParse(await readBody(event))
    const idempotency = PageStudioIdempotencyKeySchema.safeParse(
      getHeader(event, 'idempotency-key')
    )
    if (!parsed.success || !idempotency.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid version registration',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid version registration' } }
      })
    }
    const version = await registerPageStudioVersion({
      ...parsed.data,
      idempotencyKey: idempotency.data
    })
    setResponseStatus(event, 201)
    return version
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
