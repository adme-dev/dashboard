import { handlePageStudioCollection } from '~~/server/utils/pageStudio/collectionsHttp'

export default eventHandler(event => handlePageStudioCollection(event, 'agency', 'readRecord'))
