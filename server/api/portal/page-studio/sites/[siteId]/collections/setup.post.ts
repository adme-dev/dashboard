import { handlePageStudioCollectionSetup } from '~~/server/utils/pageStudio/collectionSetupHttp'

export default eventHandler(event => handlePageStudioCollectionSetup(event, 'portal', 'POST'))
