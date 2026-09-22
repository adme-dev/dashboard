import { eventHandler } from 'h3'
import { handleStudioFormActions } from '~~/server/utils/pageStudio/formActionHttp'

export default eventHandler(event => handleStudioFormActions(event))
