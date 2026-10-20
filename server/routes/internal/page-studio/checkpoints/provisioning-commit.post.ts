import { commitPageStudioProvisioningCheckpoint, PageStudioProvisioningCheckpointSchema } from '~~/server/utils/pageStudio/provisioningCheckpoint'
import { customerProvisioningCallbackRuntime } from '~~/server/utils/pageStudio/customerPreviewCallbacks'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const parsed = PageStudioProvisioningCheckpointSchema.safeParse(await readBody(event))
    if (!parsed.success || getHeader(event, 'idempotency-key') !== parsed.data.checkpoint.checkpointId) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid setup checkpoint request' })
    }
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const { binding, environment } = customerProvisioningCallbackRuntime(env ?? {}, parsed.data.provisioning)
    return await commitPageStudioProvisioningCheckpoint(parsed.data, binding, environment)
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
