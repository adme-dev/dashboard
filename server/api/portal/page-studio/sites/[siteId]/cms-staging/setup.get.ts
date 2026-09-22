import { handlePageStudioCollectionStagingSetup } from '~~/server/utils/pageStudio/collectionStagingSetupHttp'

export default eventHandler(event =>
  handlePageStudioCollectionStagingSetup(event, 'portal', 'GET')
)
