import type { CmsGraphPrincipal, CmsGraphTransitionInput, CmsGraphCommitReceipt } from './cmsGraphRead'
import type { PageStudioCheckpointCommitInput } from './controlStore'
import { callCmsManagement } from './cmsManagementClient'

export { cmsGraphConflict, cmsAuthoringScopeConflict, cmsGraphEnvironment, assertSoleCmsAuthoringScope, readCmsGraphSnapshot, assertCmsGraphSnapshotCurrent, lookupCmsGraphOperation } from './cmsGraphRead'
export type { CmsGraphPrincipal, CmsGraphDependencies, CmsGraphSnapshot, CmsGraphTransitionInput, CmsGraphCommitReceipt } from './cmsGraphRead'
export async function coordinateCmsGraphTransition(input: CmsGraphTransitionInput, principal: CmsGraphPrincipal, _dependencies: unknown = {}): Promise<CmsGraphCommitReceipt> {
  return callCmsManagement('transition', input, principal)
}
export async function coordinateCmsGraphCheckpoint(input: PageStudioCheckpointCommitInput, principal: CmsGraphPrincipal, _dependencies: unknown = {}, internal: Record<string, unknown> = {}): Promise<CmsGraphCommitReceipt> {
  return callCmsManagement('checkpoint', { input, internal }, principal)
}
export async function coordinateCmsGraphRestore(input: unknown, principal: CmsGraphPrincipal, _dependencies: unknown = {}) {
  return callCmsManagement('restore', input, principal)
}
