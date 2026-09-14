import { handlePageStudioBusinessContent } from '~~/server/utils/pageStudio/businessContentHttp'

export default eventHandler(event => handlePageStudioBusinessContent(event, 'agency', 'PUT'))
