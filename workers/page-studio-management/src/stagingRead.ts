import { z } from 'zod'
import { PageStudioStagingStateSchema, pageStudioStagingAddress } from '../../../shared/pageStudio/staging'
import type { DomainDatabase } from './domainAttachment'
import { StagingStoreError, stagingArtifactPrefix } from './stagingStore'

const Scope = z.object({ tenantId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/), clientId: z.string().uuid(), siteId: z.string().uuid() }).strict()
const Hostname = /^preview-([a-f0-9]{32})\.xeroflow\.io$/
const liveScope = `JOIN agency_clients client ON client.id=site.client_id AND client.is_active=TRUE
  JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id AND entitlement.tenant_id=site.tenant_id
    AND entitlement.client_id=site.client_id AND entitlement.status IN ('trial','active')
    AND entitlement.effective_from<=clock_timestamp() AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())`

/** The private management caller must establish staff/portal authority first.
 * Merely reading does not allocate provider resources or publish a checkpoint. */
export async function readStagingState(db: DomainDatabase, rawScope: z.infer<typeof Scope>, canManage: boolean) {
  const scope = Scope.parse(rawScope)
  const result = await db.query(`SELECT site.id,checkpoint.digest AS current_digest,staging.host_state,
    active.id AS active_id,active.checkpoint_id,active.checkpoint_digest,active.deployed_at,
    latest.state AS latest_state,latest.failure_code,latest.expired
    FROM page_studio_sites site ${liveScope}
    LEFT JOIN page_studio_checkpoints checkpoint ON checkpoint.tenant_id=site.tenant_id AND checkpoint.client_id=site.client_id
      AND checkpoint.site_id=site.id AND checkpoint.id=site.current_checkpoint_id
    LEFT JOIN page_studio_staging_sites staging ON staging.tenant_id=site.tenant_id AND staging.client_id=site.client_id AND staging.site_id=site.id
    LEFT JOIN page_studio_staging_deployments active ON active.tenant_id=site.tenant_id AND active.client_id=site.client_id
      AND active.site_id=site.id AND active.id=staging.active_deployment_id AND active.state='succeeded'
    LEFT JOIN LATERAL (SELECT state,failure_code,(state='building' AND claim_until<clock_timestamp()) AS expired FROM page_studio_staging_deployments deployment
      WHERE deployment.tenant_id=site.tenant_id AND deployment.client_id=site.client_id AND deployment.site_id=site.id
      ORDER BY created_at DESC,id DESC LIMIT 1) latest ON TRUE
    WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3 AND site.status IN ('draft','active')`, [scope.tenantId, scope.clientId, scope.siteId])
  const row = result.rows[0]
  if (result.rows.length !== 1 || !row) throw new StagingStoreError('STAGING_ACCESS_DENIED', 403)
  const active = row.host_state === 'ready' && row.active_id
    ? {
        id: row.active_id, checkpointId: row.checkpoint_id, digest: row.checkpoint_digest,
        deployedAt: row.deployed_at instanceof Date ? row.deployed_at.toISOString() : row.deployed_at
      }
    : null
  let status = active ? 'ready' : 'not_published'
  if (row.latest_state === 'failed') status = active ? 'update_failed' : 'failed'
  if (['queued', 'building'].includes(String(row.latest_state))) status = row.host_state === 'ready' ? 'building' : 'provisioning'
  if (row.expired === true) status = active ? 'update_failed' : 'failed'
  if (row.host_state === 'suspended') status = 'suspended'
  return PageStudioStagingStateSchema.parse({
    siteId: scope.siteId, ...pageStudioStagingAddress(scope.siteId), status, canManage,
    active, currentDigest: row.current_digest ?? null, failure: row.host_state === 'suspended' ? 'ACCESS_INACTIVE' : row.expired === true ? 'BUILD_FAILED' : row.failure_code ?? null
  })
}

/** Service-binding only. Delivery rechecks native entitlement on EVERY request;
 * no visitor-chosen object prefix and no cached positive authorization. */
export async function resolveStagingHost(db: DomainDatabase, hostname: string) {
  if (typeof hostname !== 'string' || !Hostname.test(hostname)) return null
  const result = await db.query(`SELECT site.tenant_id,site.client_id,site.id AS site_id,deployment.id,
    deployment.checkpoint_id,deployment.checkpoint_digest,deployment.artifact_prefix,deployment.artifact_manifest_digest
    FROM page_studio_staging_sites staging
    JOIN page_studio_sites site ON site.tenant_id=staging.tenant_id AND site.client_id=staging.client_id AND site.id=staging.site_id
    ${liveScope}
    JOIN page_studio_staging_deployments deployment ON deployment.tenant_id=staging.tenant_id AND deployment.client_id=staging.client_id
      AND deployment.site_id=staging.site_id AND deployment.id=staging.active_deployment_id AND deployment.state='succeeded'
    WHERE staging.hostname=$1 AND staging.host_state='ready' AND staging.provider_domain_id IS NOT NULL
      AND staging.provider_verified_at IS NOT NULL AND site.status IN ('draft','active')`, [hostname])
  const row = result.rows[0]
  if (result.rows.length !== 1 || !row) return null
  const scope = Scope.parse({ tenantId: row.tenant_id, clientId: row.client_id, siteId: row.site_id })
  if (hostname !== pageStudioStagingAddress(scope.siteId).hostname || row.artifact_prefix !== stagingArtifactPrefix(scope, String(row.id))) return null
  return {
    scope, id: z.string().uuid().parse(row.id), checkpointId: z.string().min(1).max(128).parse(row.checkpoint_id),
    digest: z.string().regex(/^[a-f0-9]{64}$/).parse(row.checkpoint_digest), artifactPrefix: String(row.artifact_prefix),
    manifestDigest: z.string().regex(/^[a-f0-9]{64}$/).parse(row.artifact_manifest_digest)
  }
}
