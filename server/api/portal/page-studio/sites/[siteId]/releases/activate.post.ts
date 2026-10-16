import { handlePortalPageStudioPublishing } from '~~/server/utils/pageStudio/portalPublishing'

export default eventHandler(event => handlePortalPageStudioPublishing(event, 'activate'))
