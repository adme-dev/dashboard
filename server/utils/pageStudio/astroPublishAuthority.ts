import { withCustomerPublishAuthority, type CustomerPublishPrincipal } from './customerPublishAuthority'
import { withPageStudioPublishAuthority, type PageStudioPublishPrincipal } from './publishAuthority'
import type { PageStudioPublishingQueryClient, PageStudioPublishingScope } from './publishing'
import { PageStudioPublishingError } from './publishingError'

export type AstroPublishPrincipal = PageStudioPublishPrincipal | CustomerPublishPrincipal
export type AstroPublishDependencies = NonNullable<Parameters<typeof withPageStudioPublishAuthority>[3]>

/** Keep each login model's authority intact; never translate a native account
 * into a portal/staff login. Native candidates currently support static sites. */
export function withAstroPublishAuthority<T>(scope: PageStudioPublishingScope, principal: AstroPublishPrincipal,
  work: (db: PageStudioPublishingQueryClient) => Promise<T>, dependencies: AstroPublishDependencies = {}): Promise<T> {
  if (!('kind' in principal)) return withPageStudioPublishAuthority(scope, principal, work, dependencies)
  const params = [scope.tenantId, scope.clientId, scope.siteId]
  return withCustomerPublishAuthority(scope, principal, async (db) => {
    const checkStatic = async () => {
      if ((await db.query(`SELECT id FROM page_studio_sites
        WHERE tenant_id=$1 AND client_id=$2 AND id=$3 AND delivery_mode='static'`, params)).rows.length !== 1) {
        throw new PageStudioPublishingError('SITE_NOT_PUBLISHABLE', 409, 'This website requires a different publishing flow.')
      }
    }
    await checkStatic()
    const result = await work(db)
    await checkStatic()
    return result
  }, dependencies)
}

/** Audit projection only, after fresh publication authority has succeeded. */
export function astroPublisherActor(principal: AstroPublishPrincipal) {
  return 'kind' in principal
    ? { id: principal.identityId, role: 'customer' as const }
    : { id: principal.actorId, role: principal.login.role }
}
