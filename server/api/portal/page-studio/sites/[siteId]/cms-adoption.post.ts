import { eventHandler } from 'h3'
import { handleNativeCmsAdoption } from '~~/server/utils/pageStudio/cmsAdoptionHttp'

export default eventHandler(event => handleNativeCmsAdoption(event, 'portal', 'POST'))
