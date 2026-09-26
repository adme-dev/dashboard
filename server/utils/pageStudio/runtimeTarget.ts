import { z } from 'zod'
import type { PageStudioPublishingQueryClient, PageStudioPublishingScope } from './publishing'
import { PageStudioPublishingError } from './publishingError'

const Canary = z.object({ tenantId: z.string().min(1), clientId: z.string().uuid(), siteId: z.string().uuid(), hostname: z.string().min(1) }).strict()
export interface RuntimeTargetPolicy {
  deploymentEnvironment: 'staging' | 'production'
  stagingCanary?: z.infer<typeof Canary>
}

export function runtimeTargetPolicy(env: Record<string, unknown> | undefined): RuntimeTargetPolicy {
  const deploymentEnvironment = env?.PAGE_STUDIO_RELEASE_ENVIRONMENT
  if (deploymentEnvironment !== 'staging' && deploymentEnvironment !== 'production') {
    throw new PageStudioPublishingError('SITE_NOT_PUBLISHABLE', 503, 'Publication environment is not configured')
  }
  const encoded = env?.PAGE_STUDIO_RUNTIME_STAGING_CANARY
  const stagingCanary = typeof encoded === 'string' ? Canary.parse(JSON.parse(encoded)) : undefined
  return { deploymentEnvironment, stagingCanary }
}

/** Caller holds the site lock. Retain hostname readiness and ownership until commit. */
export async function requireRuntimeTarget(
  db: PageStudioPublishingQueryClient,
  input: { environment: 'production' | 'staging', hostname: string, scope: PageStudioPublishingScope },
  policy: RuntimeTargetPolicy
) {
  const deny = (): never => {
    throw new PageStudioPublishingError('SITE_NOT_PUBLISHABLE', 409, 'The publication hostname is not ready for this website and environment')
  }
  if (policy.deploymentEnvironment === 'staging' && input.environment !== 'staging') deny()
  const { scope, hostname, environment } = input
  const params = [scope.tenantId, scope.clientId, scope.siteId, hostname]
  if (environment === 'production') {
    const target = await db.query(`SELECT id FROM page_studio_domains
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND normalized_hostname=$4
        AND lifecycle_state='active' AND hostname_status='active' AND tls_status='active' AND dns_status='active'
        AND cloudflare_hostname_id IS NOT NULL AND verified_at IS NOT NULL FOR SHARE`, params)
    if (target.rows.length !== 1) deny()
    return
  }
  const target = await db.query(`SELECT site_id FROM page_studio_staging_sites
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND hostname=$4
      AND host_state='ready' AND provider_domain_id IS NOT NULL AND provider_verified_at IS NOT NULL FOR SHARE`, params)
  if (target.rows.length === 1) return
  const canary = policy.stagingCanary
  if (policy.deploymentEnvironment !== 'staging' || !canary || canary.tenantId !== scope.tenantId
    || canary.clientId !== scope.clientId || canary.siteId !== scope.siteId || canary.hostname !== hostname) deny()
  const synthetic = await db.query(`SELECT id FROM page_studio_sites
    WHERE tenant_id=$1 AND client_id=$2 AND id=$3 AND integrations->>'synthetic'='true'`, params.slice(0, 3))
  if (synthetic.rows.length !== 1) deny()
}
