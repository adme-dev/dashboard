import { portalCodeCheckpointRoute } from '~~/server/utils/pageStudio/portalCodeCheckpointRoute'
export default eventHandler(event => portalCodeCheckpointRoute(event, 'latest'))
