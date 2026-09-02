import { PageStudioIdempotencyKeySchema } from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import {
  acceptPageStudioPublicLead,
  PageStudioPublicLeadSubmissionSchema
} from '~~/server/utils/pageStudio/publicBoundary'

export default defineEventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const parsed = PageStudioPublicLeadSubmissionSchema.safeParse(await readBody(event))
    const idempotency = PageStudioIdempotencyKeySchema.safeParse(getHeader(event, 'idempotency-key'))
    if (!parsed.success || !idempotency.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid public lead submission',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid public lead submission' } }
      })
    }
    const result = await acceptPageStudioPublicLead(event, {
      ...parsed.data,
      idempotencyKey: idempotency.data
    })
    setResponseStatus(event, result.duplicate ? 200 : 201)
    return result
  } catch (error) {
    throw pageStudioInternalHttpError(error)
  }
})
