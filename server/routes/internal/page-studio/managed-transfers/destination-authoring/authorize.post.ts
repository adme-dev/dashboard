import { createError } from 'h3'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { authorizeManagedTransferDestinationAuthoring } from '~~/server/utils/pageStudio/managedTransferDestinationAuthoring'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioProvisioningRuntime } from '~~/server/utils/pageStudio/provisioningBinding'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    if (requirePageStudioProvisioningRuntime(env).environment !== 'production') {
      throw createError({ statusCode: 503, statusMessage: 'Production destination authoring is unavailable in this environment' })
    }
    return await authorizeManagedTransferDestinationAuthoring(await readBody(event), { env: env! })
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
