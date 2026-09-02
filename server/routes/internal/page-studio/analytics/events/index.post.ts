import { PageStudioIdempotencyKeySchema } from '~~/server/utils/pageStudio/contracts'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import {
  acceptPageStudioPublicAnalyticsEvent,
  PageStudioPublicAnalyticsEventSchema
} from '~~/server/utils/pageStudio/publicBoundary'

export default defineEventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const parsed = PageStudioPublicAnalyticsEventSchema.safeParse(await readBody(event))
    const idempotency = PageStudioIdempotencyKeySchema.safeParse(getHeader(event, 'idempotency-key'))
    if (!parsed.success || !idempotency.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid public analytics event',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid public analytics event' } }
      })
    }
    return await acceptPageStudioPublicAnalyticsEvent(event, {
      ...parsed.data,
      idempotencyKey: idempotency.data
    })
  } catch (error) {
    throw pageStudioInternalHttpError(error)
  }
})
