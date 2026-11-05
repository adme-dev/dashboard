import { handleAgencyStagingVisibility } from '~~/server/utils/pageStudio/stagingVisibilityHttp'

export default eventHandler(event => handleAgencyStagingVisibility(event, 'suspend'))
