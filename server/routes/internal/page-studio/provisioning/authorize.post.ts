import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { authorizePageStudioProvisioning } from '~~/server/utils/pageStudio/provisioningAuthority'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { customerProvisioningCallbackRuntime } from '~~/server/utils/pageStudio/customerPreviewCallbacks'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const input = await readBody(event)
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const { binding, environment } = customerProvisioningCallbackRuntime(env ?? {}, input)
    return await authorizePageStudioProvisioning(binding, input, environment)
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
