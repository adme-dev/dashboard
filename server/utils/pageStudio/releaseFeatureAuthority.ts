import { PageStudioBusinessContentError } from './businessContent'
import { withCmsCommitAuthority } from './cmsCommitAuthority'
import { readCmsGraphSnapshot, type CmsGraphPrincipal, type CmsGraphSnapshot, type CmsGraphDependencies } from './cmsGraphCoordinator'
import { cmsEqual } from './cmsVisibility'
import type { PageStudioControlQueryClient } from './controlStore'

export type FeaturePublisher = Extract<CmsGraphPrincipal, { source: 'native-login' }>
export const featureDenied = () => new PageStudioBusinessContentError('CMS_AUTHORITY_DENIED', 403, 'Feature publication requires current edit and publish access')
export const featureConflict = () => new PageStudioBusinessContentError('CMS_GRAPH_CONFLICT', 409, 'The approved feature release changed. Retry the same operation to check its status.')
async function assertPublishPermission(db: PageStudioControlQueryClient, principal: FeaturePublisher) {
  if (principal.source !== 'native-login' || principal.request.actor.role !== 'agency') throw featureDenied()
  const rows = (await db.query(`SELECT permission.role_id FROM team_members owner
    JOIN custom_roles role ON ((owner.custom_role_id IS NOT NULL AND role.id=owner.custom_role_id)
      OR (owner.custom_role_id IS NULL AND role.slug=owner.user_role AND role.is_system=TRUE))
    JOIN role_permission_groups permission ON permission.role_id=role.id AND permission.permission_group='PAGE_STUDIO_PUBLISH'
    WHERE owner.id::text=$1 AND owner.is_active=TRUE AND owner.user_role NOT IN ('viewer','guest') AND role.is_read_only=FALSE
    FOR SHARE OF permission NOWAIT`, [principal.request.actor.actorId])).rows
  if (rows.length !== 1) throw featureDenied()
}
/** SQL-only composition under the original human login. Public invocation never
 * calls this with the publisher's identity. Site-first locking is inherited. */
export async function withFeaturePublisher<T>(snapshot: CmsGraphSnapshot, principal: FeaturePublisher,
  work: (db: PageStudioControlQueryClient, current: CmsGraphSnapshot) => Promise<T>, dependencies: CmsGraphDependencies = {}) {
  return withCmsCommitAuthority({ scope: snapshot.scope, principal, mutation: 'business-content' }, async (db) => {
    const check = async () => {
      await assertPublishPermission(db, principal)
      const current = await readCmsGraphSnapshot(principal, { runTransaction: callback => callback(db) })
      if (!cmsEqual(current, snapshot)) throw featureConflict()
      return current
    }
    const current = await check()
    const result = await work(db, current)
    await check()
    return result
  }, dependencies)
}
export async function readFeaturePublisherSnapshot(principal: FeaturePublisher, dependencies: CmsGraphDependencies = {}) {
  if (principal.source !== 'native-login' || principal.request.actor.role !== 'agency') throw featureDenied()
  const snapshot = await readCmsGraphSnapshot(principal, dependencies)
  return withFeaturePublisher(snapshot, principal, async (_db, current) => current, dependencies)
}
