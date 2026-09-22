import { eventHandler } from 'h3'
import { handleFeatureApplication } from '~~/server/utils/pageStudio/featureApplicationHttp'

export default eventHandler(event => handleFeatureApplication(event, 'context'))
