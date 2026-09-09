import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { authorizePageStudioProvisioning } from '~~/server/utils/pageStudio/provisioningAuthority'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import type { PageStudioProvisionerBinding } from '~~/server/utils/pageStudio/provisioningBinding'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const input = await readBody(event)
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    return await authorizePageStudioProvisioning(env?.PAGE_STUDIO_PROVISIONER as PageStudioProvisionerBinding | undefined, input)
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
