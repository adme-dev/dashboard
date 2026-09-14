import { handlePageStudioEmailConfiguration } from '~~/server/utils/pageStudio/emailConfigurationHttp'

export default eventHandler(event => handlePageStudioEmailConfiguration(event, 'portal', 'GET'))
