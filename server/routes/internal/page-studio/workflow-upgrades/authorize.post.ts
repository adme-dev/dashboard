import { readContentBody } from '~~/server/utils/pageStudio/businessContentHttp'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { authorizePageStudioWorkflowUpgrade } from '~~/server/utils/pageStudio/workflowUpgradeAuthority'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { customerSchemaCallbackEnvironment } from '~~/server/utils/pageStudio/customerPreviewCallbacks'
import { workflowUpgradeContract } from '~~/server/utils/pageStudio/schemaUpgradeContract'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const input = await readContentBody(event)
    const environment = customerSchemaCallbackEnvironment(env ?? {}, input, workflowUpgradeContract)
    return await authorizePageStudioWorkflowUpgrade(input, environment)
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
