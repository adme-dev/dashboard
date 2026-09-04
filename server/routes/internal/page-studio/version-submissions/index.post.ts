import { submitPageStudioVersionForReview } from '~~/server/utils/pageStudio/controlStore'
import {
  PageStudioIdempotencyKeySchema,
  PageStudioVersionSubmissionSchema
} from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const parsed = PageStudioVersionSubmissionSchema.safeParse(await readBody(event))
    const idempotency = PageStudioIdempotencyKeySchema.safeParse(
      getHeader(event, 'idempotency-key')
    )
    if (!parsed.success || !idempotency.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid version submission',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid version submission' } }
      })
    }
    return await submitPageStudioVersionForReview({
      ...parsed.data,
      idempotencyKey: idempotency.data
    })
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
