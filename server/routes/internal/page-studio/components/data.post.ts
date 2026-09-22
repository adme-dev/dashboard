import { eventHandler } from 'h3'
import { handleStudioComponentCmsData } from '~~/server/utils/pageStudio/componentCmsDataHttp'

export default eventHandler(event => handleStudioComponentCmsData(event))
