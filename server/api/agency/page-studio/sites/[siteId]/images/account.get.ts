import { handlePageStudioImages } from '~~/server/utils/pageStudio/imageGenerationHttp'

export default eventHandler(event => handlePageStudioImages(event, 'agency', 'account'))
