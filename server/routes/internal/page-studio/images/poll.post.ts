import { eventHandler } from 'h3'
import { handlePageStudioImageWorker } from '~~/server/utils/pageStudio/imageInternalHttp'

export default eventHandler(event => handlePageStudioImageWorker(event, 'poll'))
