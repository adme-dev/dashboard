import { eventHandler } from 'h3'
import { handlePageStudioImageEditor } from '~~/server/utils/pageStudio/imageInternalHttp'

export default eventHandler(event => handlePageStudioImageEditor(event, 'generate'))
