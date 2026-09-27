import { handlePublishedFeaturePage } from '~~/server/utils/pageStudio/publishedFeatureHttp'

export default eventHandler(event => handlePublishedFeaturePage(event, 'runtime-forms'))
