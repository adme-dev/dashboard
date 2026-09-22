import { eventHandler } from 'h3'
import { handleStudioCmsAdoption } from '~~/server/utils/pageStudio/cmsAdoptionHttp'

export default eventHandler(event => handleStudioCmsAdoption(event))
