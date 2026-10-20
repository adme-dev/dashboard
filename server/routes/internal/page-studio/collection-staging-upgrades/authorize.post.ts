import { readContentBody } from '~~/server/utils/pageStudio/businessContentHttp'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { authorizePageStudioCollectionStagingUpgrade } from '~~/server/utils/pageStudio/collectionStagingUpgradeAuthority'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { customerSchemaCallbackEnvironment } from '~~/server/utils/pageStudio/customerPreviewCallbacks'
import { collectionStagingUpgradeContract } from '~~/server/utils/pageStudio/schemaUpgradeContract'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare
      ?.env
    const input = await readContentBody(event)
    const environment = customerSchemaCallbackEnvironment(env ?? {}, input, collectionStagingUpgradeContract)
    return await authorizePageStudioCollectionStagingUpgrade(
      input,
      environment
    )
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
