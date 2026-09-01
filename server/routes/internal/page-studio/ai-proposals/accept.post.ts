import { acceptPageStudioAiProposal } from '~~/server/utils/pageStudio/controlStore'
import {
  PageStudioAiProposalAcceptanceSchema,
  PageStudioIdempotencyKeySchema
} from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const parsed = PageStudioAiProposalAcceptanceSchema.safeParse(await readBody(event))
    const idempotency = PageStudioIdempotencyKeySchema.safeParse(
      getHeader(event, 'idempotency-key')
    )
    if (!parsed.success || !idempotency.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid AI proposal acceptance',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid AI proposal acceptance' } }
      })
    }
    setResponseStatus(event, 201)
    return await acceptPageStudioAiProposal({
      ...parsed.data,
      idempotencyKey: idempotency.data
    })
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
