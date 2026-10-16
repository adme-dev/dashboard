import { createError } from 'h3'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { authorizeManagedTransferResources } from '~~/server/utils/pageStudio/managedTransferResources'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioProvisioningRuntime } from '~~/server/utils/pageStudio/provisioningBinding'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    if (requirePageStudioProvisioningRuntime(env).environment !== 'production') {
      throw createError({ statusCode: 503, statusMessage: 'Production transfer resources are unavailable in this environment' })
    }
    return await authorizeManagedTransferResources(await readBody(event))
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
