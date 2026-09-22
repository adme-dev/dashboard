import { eventHandler } from 'h3'
import { handlePublishedFeaturePage } from '~~/server/utils/pageStudio/publishedFeatureHttp'

export default eventHandler(event => handlePublishedFeaturePage(event))
