import { recordPageStudioCheckpoint } from '~~/server/utils/pageStudio/controlStore'
import { PageStudioCheckpointSchema } from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const parsed = PageStudioCheckpointSchema.safeParse(await readBody(event))
    const idempotencyKey = getHeader(event, 'idempotency-key')
    if (!parsed.success || idempotencyKey !== parsed.data.checkpointId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid checkpoint request',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid checkpoint request' } }
      })
    }
    return await recordPageStudioCheckpoint(parsed.data)
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
