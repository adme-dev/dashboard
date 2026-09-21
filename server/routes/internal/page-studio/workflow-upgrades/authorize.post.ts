import { readContentBody } from '~~/server/utils/pageStudio/businessContentHttp'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { authorizePageStudioWorkflowUpgrade } from '~~/server/utils/pageStudio/workflowUpgradeAuthority'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioProvisioningRuntime } from '~~/server/utils/pageStudio/provisioningBinding'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const { environment } = requirePageStudioProvisioningRuntime(env)
    return await authorizePageStudioWorkflowUpgrade(await readContentBody(event), environment)
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
