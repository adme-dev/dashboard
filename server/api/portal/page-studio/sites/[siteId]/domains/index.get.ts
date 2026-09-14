import { handlePortalDomains } from '~~/server/utils/pageStudio/portalDomains'

export default eventHandler(event => handlePortalDomains(event, 'list'))
