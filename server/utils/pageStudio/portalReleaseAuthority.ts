import { withPageStudioPublishAuthority, type PageStudioPublishPrincipal } from './publishAuthority'
import type { PageStudioPublishingQueryClient, PageStudioPublishingScope } from './publishing'
import { PageStudioPublishingError } from './publishingError'
import { PageStudioReleaseActivationBody } from './schemas'

/** Check the selected hostname inside the same transaction as the live pointer.
 * Customer static releases cannot be assigned to foreign/unverified hostnames or
 * used to replace a runtime application. Provider calls belong outside this lock. */
export function withPortalPageStudioReleaseAuthority<T>(
  scope: PageStudioPublishingScope,
  principal: PageStudioPublishPrincipal,
  hostnameInput: string,
  work: (db: PageStudioPublishingQueryClient) => Promise<T>,
  dependencies: Parameters<typeof withPageStudioPublishAuthority>[3] = {}
): Promise<T> {
  const hostname = PageStudioReleaseActivationBody.shape.hostname.safeParse(hostnameInput)
  if (principal.login.role !== 'client' || !hostname.success) {
    return Promise.reject(new PageStudioPublishingError('PUBLISH_AUTHORITY_DENIED', 403, 'Current publishing access is required'))
  }
  const params = [scope.tenantId, scope.clientId, scope.siteId, hostname.data]
  return withPageStudioPublishAuthority(scope, principal, async (db) => {
    const checkDomain = async () => {
      const result = await db.query(`SELECT domain.normalized_hostname
        FROM page_studio_domains domain
        JOIN page_studio_sites site ON site.tenant_id=domain.tenant_id
          AND site.client_id=domain.client_id AND site.id=domain.site_id
        WHERE domain.tenant_id=$1 AND domain.client_id=$2 AND domain.site_id=$3
          AND domain.normalized_hostname=$4 AND site.delivery_mode='static'
          AND domain.lifecycle_state IN ('verified','active')
          AND domain.hostname_status='active' AND domain.tls_status='active'
          AND domain.dns_status='active' AND domain.verified_at IS NOT NULL
        FOR SHARE OF domain NOWAIT`, params)
      if (result.rows.length !== 1) throw new PageStudioPublishingError('RELEASE_DOMAIN_NOT_READY', 409,
        'Verify this website domain and HTTPS before publishing an approved static website.')
    }
    await checkDomain()
    const result = await work(db)
    await checkDomain()
    return result
  }, dependencies)
}
