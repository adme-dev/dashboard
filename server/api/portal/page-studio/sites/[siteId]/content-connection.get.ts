import { handlePageStudioContentConnection } from '~~/server/utils/pageStudio/contentConnectionHttp'

export default eventHandler(event => handlePageStudioContentConnection(event, 'portal', 'GET'))
