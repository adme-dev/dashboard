import { z } from 'zod'
import type { PageStudioPublishingQueryClient, PageStudioPublishingScope } from './publishing'
import { PageStudioPublishingError } from './publishingError'

const Canary = z.object({
  tenantId: z.string().min(1).max(200),
  clientId: z.string().uuid().toLowerCase(),
  siteId: z.string().uuid().toLowerCase(),
  hostname: z.string().trim().toLowerCase().max(253)
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
}).strict()
const Canaries = z.array(Canary).min(1).max(4).refine(entries =>
  new Set(entries.map(entry => entry.hostname)).size === entries.length
    && new Set(entries.map(({ tenantId, clientId, siteId }) => JSON.stringify([tenantId, clientId, siteId]))).size === entries.length,
'Canary hostnames and scopes must be unique')
const invalidCanaries = () => new PageStudioPublishingError('SITE_NOT_PUBLISHABLE', 503, 'Synthetic staging hostname configuration is invalid')
export interface RuntimeTargetPolicy {
  deploymentEnvironment: 'staging' | 'production'
  stagingCanary?: z.infer<typeof Canary>
  stagingCanaries?: z.infer<typeof Canaries>
}

export function runtimeTargetPolicy(env: Record<string, unknown> | undefined): RuntimeTargetPolicy {
  const deploymentEnvironment = env?.PAGE_STUDIO_RELEASE_ENVIRONMENT
  if (deploymentEnvironment !== 'staging' && deploymentEnvironment !== 'production') {
    throw new PageStudioPublishingError('SITE_NOT_PUBLISHABLE', 503, 'Publication environment is not configured')
  }
  const encoded = env?.PAGE_STUDIO_RUNTIME_STAGING_CANARY
  const multiple = env?.PAGE_STUDIO_RUNTIME_STAGING_CANARIES
  if (encoded !== undefined && multiple !== undefined) throw invalidCanaries()
  if (encoded === undefined && multiple === undefined) return { deploymentEnvironment }
  const value = multiple ?? encoded
  if (typeof value !== 'string' || value.length > 8192) throw invalidCanaries()
  try {
    return multiple !== undefined
      ? { deploymentEnvironment, stagingCanaries: Canaries.parse(JSON.parse(value)) }
      : { deploymentEnvironment, stagingCanary: Canary.parse(JSON.parse(value)) }
  } catch { throw invalidCanaries() }
}

/** Configuration selection only. A match is never authority without the current
 * native site's synthetic marker and the caller's ordinary access checks. */
export function selectRuntimeStagingCanary(policy: RuntimeTargetPolicy, scope: PageStudioPublishingScope) {
  if (policy.deploymentEnvironment !== 'staging') return undefined
  if (policy.stagingCanary !== undefined && policy.stagingCanaries !== undefined) throw invalidCanaries()
  const entries = policy.stagingCanaries ?? (policy.stagingCanary ? [policy.stagingCanary] : undefined)
  if (!entries) return undefined
  const parsed = Canaries.safeParse(entries)
  if (!parsed.success) throw invalidCanaries()
  return parsed.data.find(entry => entry.tenantId === scope.tenantId && entry.clientId === scope.clientId && entry.siteId === scope.siteId)
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
  const canary = selectRuntimeStagingCanary(policy, scope)
  if (!canary || canary.hostname !== hostname) deny()
  const synthetic = await db.query(`SELECT id FROM page_studio_sites
    WHERE tenant_id=$1 AND client_id=$2 AND id=$3 AND integrations->>'synthetic'='true'`, params.slice(0, 3))
  if (synthetic.rows.length !== 1) deny()
}
