import { callCmsManagement } from './cmsManagementClient'
import type { CmsGraphPrincipal } from './cmsGraphRead'

export { CmsAdoptionControlRequestSchema } from '~~/shared/pageStudio/cmsAdoptionControl'
export function coordinateCmsAdoption(input: unknown, principal: CmsGraphPrincipal, _dependencies: unknown = {}) {
  return callCmsManagement('adoption', input, principal)
}
