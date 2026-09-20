import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { authorizePageStudioCollectionUpgrade } from '~~/server/utils/pageStudio/collectionUpgradeAuthority'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioProvisioningRuntime } from '~~/server/utils/pageStudio/provisioningBinding'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const { environment } = requirePageStudioProvisioningRuntime(env)
    return await authorizePageStudioCollectionUpgrade(await readBody(event), environment)
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
