import { commitPageStudioCheckpoint } from '~~/server/utils/pageStudio/controlStore'
import { PageStudioCheckpointCommitSchema } from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const parsed = PageStudioCheckpointCommitSchema.safeParse(await readBody(event))
    const idempotencyKey = getHeader(event, 'idempotency-key')
    if (!parsed.success || idempotencyKey !== parsed.data.checkpoint.checkpointId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid checkpoint commit request',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid checkpoint commit request' } }
      })
    }
    return await commitPageStudioCheckpoint(parsed.data)
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
