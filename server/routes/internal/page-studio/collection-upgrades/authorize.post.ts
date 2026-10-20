import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { authorizePageStudioCollectionUpgrade } from '~~/server/utils/pageStudio/collectionUpgradeAuthority'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { customerSchemaCallbackEnvironment } from '~~/server/utils/pageStudio/customerPreviewCallbacks'
import { collectionUpgradeContract } from '~~/server/utils/pageStudio/schemaUpgradeContract'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const input = await readBody(event)
    const environment = customerSchemaCallbackEnvironment(env ?? {}, input, collectionUpgradeContract)
    return await authorizePageStudioCollectionUpgrade(input, environment)
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
