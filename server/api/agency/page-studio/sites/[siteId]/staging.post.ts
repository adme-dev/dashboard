import { handlePageStudioStaging } from '~~/server/utils/pageStudio/stagingHttp'

export default eventHandler(event => handlePageStudioStaging(event, 'agency', 'update'))
