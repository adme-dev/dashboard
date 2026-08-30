import { recordPageStudioAuditEvent } from '~~/server/utils/pageStudio/controlStore'
import {
  PageStudioAuditEventSchema,
  PageStudioIdempotencyKeySchema
} from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const parsed = PageStudioAuditEventSchema.safeParse(await readBody(event))
    const idempotency = PageStudioIdempotencyKeySchema.safeParse(
      getHeader(event, 'idempotency-key')
    )
    if (!parsed.success || !idempotency.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid audit event',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid audit event' } }
      })
    }
    return await recordPageStudioAuditEvent({
      ...parsed.data,
      idempotencyKey: idempotency.data
    })
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
