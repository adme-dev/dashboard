import { z } from 'zod'
import type { PageStudioStagingRequestSchema } from '../../../shared/pageStudio/staging'
import { pageStudioStagingAddress } from '../../../shared/pageStudio/staging'
import { CodeContentBindingSchema, sameCodeContent } from '../../../shared/pageStudio/codeContent'
import { agencyAuthority } from './domainManagement'
import { requireStagingAuthority } from './stagingAuthority'
import { StagingStoreError, stagingArtifactPrefix } from './stagingStore'
import { readStagingState } from './stagingRead'
import { StagingProviderDomainIdSchema } from './stagingProvider'
import type { StagingCoordinatorDependencies } from './stagingCoordinator'
import type { DomainDatabase } from './domainAttachment'

type Request = Extract<z.infer<typeof PageStudioStagingRequestSchema>, { operation: 'suspend' | 'resume' }>
const changed = () => new StagingStoreError('STAGING_CHANGED', 409)
export async function coordinateStagingVisibility(request: Request, deps: StagingCoordinatorDependencies) {
  const authorize = async (db: DomainDatabase) => {
    if (request.actor.kind !== 'agency' || !await agencyAuthority(db, request.actor.actorId, 'PAGE_STUDIO_PUBLISH')) throw new StagingStoreError('STAGING_ACCESS_DENIED', 403)
    return requireStagingAuthority(db, request.actor, request.siteId, true)
  }
  const action = request.operation === 'suspend' ? 'staging.suspended' : 'staging.resumed'
  const snapshotSchema = z.object({ id: z.string().uuid(), checkpointId: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/),
    artifactPrefix: z.string(), manifestDigest: z.string().regex(/^[a-f0-9]{64}$/), codeContent: CodeContentBindingSchema.nullable(),
    hostState: z.enum(['ready', 'suspended']), providerId: z.string().nullable(), revision: z.string() }).strict()
  const load = async (db: DomainDatabase, scope: { tenantId: string, clientId: string, siteId: string }) => {
    const params = [scope.tenantId, scope.clientId, scope.siteId]
    const pending = await db.query('SELECT id FROM page_studio_staging_deployments WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND state IN (\'queued\',\'building\')', params)
    if (pending.rows.length) throw new StagingStoreError('STAGING_BUSY', 409)
    const row = (await db.query(`SELECT deployment.id, deployment.checkpoint_id AS "checkpointId", deployment.checkpoint_digest AS digest,
      deployment.artifact_prefix AS "artifactPrefix", deployment.artifact_manifest_digest AS "manifestDigest", deployment.code_content AS "codeContent",
      staging.host_state AS "hostState", staging.provider_domain_id AS "providerId", staging.updated_at::text AS revision
      FROM page_studio_staging_sites staging JOIN page_studio_staging_deployments deployment
        ON deployment.tenant_id=staging.tenant_id AND deployment.client_id=staging.client_id AND deployment.site_id=staging.site_id
        AND deployment.id=staging.active_deployment_id AND deployment.state='succeeded'
      WHERE staging.tenant_id=$1 AND staging.client_id=$2 AND staging.site_id=$3 FOR UPDATE OF staging FOR SHARE OF deployment`, params)).rows[0]
    const parsed = snapshotSchema.safeParse(row)
    if (!parsed.success || parsed.data.id !== request.body.expectedActiveId || parsed.data.artifactPrefix !== stagingArtifactPrefix(scope, parsed.data.id)) throw changed()
    return parsed.data
  }
  const prior = async (db: DomainDatabase, scope: { tenantId: string, clientId: string, siteId: string }) => {
    const rows = (await db.query<{ actor_id: string, action: string, metadata: unknown }>(`SELECT actor_id,action,metadata FROM page_studio_audit_events
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND idempotency_key=$4`,
    [scope.tenantId, scope.clientId, scope.siteId, `staging-visibility:${request.body.requestId}`])).rows
    if (!rows.length) return false
    if (rows.length !== 1 || rows[0]!.actor_id !== request.actor.actorId || rows[0]!.action !== action || !sameCodeContent(rows[0]!.metadata, request.body)) throw changed()
    return true
  }
  const write = async (db: DomainDatabase, scope: { tenantId: string, clientId: string, siteId: string }, revision: string, providerId?: string) => {
    const params = [scope.tenantId, scope.clientId, scope.siteId]
    const rows = await db.query(`UPDATE page_studio_staging_sites SET host_state=$4,updated_at=clock_timestamp(),
      provider_domain_id=COALESCE($7,provider_domain_id),provider_verified_at=CASE WHEN $4='ready' THEN clock_timestamp() ELSE provider_verified_at END
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND active_deployment_id=$5 AND updated_at::text=$6 RETURNING site_id`,
    [...params, request.operation === 'suspend' ? 'suspended' : 'ready', request.body.expectedActiveId, revision, providerId ?? null])
    if (rows.rows.length !== 1) throw changed()
    await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
      VALUES($1,$2,$3,$4,'agency',$5,'staging_deployment',$6,$7,$8::jsonb)`,
    [...params, request.actor.actorId, action, request.body.expectedActiveId, `staging-visibility:${request.body.requestId}`, JSON.stringify(request.body)])
    await authorize(db)
    return readStagingState(db, scope, true)
  }
  const retained = await deps.transaction(async (db) => {
    const { scope } = await authorize(db)
    if (await prior(db, scope)) {
      const done = await readStagingState(db, scope, true)
      await authorize(db)
      return { done }
    }
    const snapshot = await load(db, scope)
    if (snapshot.hostState !== (request.operation === 'suspend' ? 'ready' : 'suspended')) throw changed()
    if (request.operation === 'suspend') return { done: await write(db, scope, snapshot.revision) }
    return { scope, snapshot }
  })
  if ('done' in retained) return retained.done
  const { scope, snapshot } = retained
  const host = await deps.attach(scope.siteId)
  const hostname = pageStudioStagingAddress(scope.siteId).hostname
  if (host.hostname !== hostname || !StagingProviderDomainIdSchema.safeParse(host.domainId).success
    || (snapshot.providerId && snapshot.providerId !== host.domainId) || !z.string().uuid().safeParse(host.certificateId).success
    || !await deps.probe(hostname)) throw changed()
  const receipt = z.object({ verified: z.literal(true), manifestDigest: z.string(), codeContent: CodeContentBindingSchema.optional() }).strict().parse(await deps.verify({
    scope, snapshotId: snapshot.id, checkpointId: snapshot.checkpointId, digest: snapshot.digest,
    ...(snapshot.codeContent ? { codeContent: snapshot.codeContent } : {}), artifactPrefix: snapshot.artifactPrefix, manifestDigest: snapshot.manifestDigest
  }))
  if (receipt.manifestDigest !== snapshot.manifestDigest || !sameCodeContent(receipt.codeContent, snapshot.codeContent)) throw changed()
  return deps.transaction(async (db) => {
    const current = await authorize(db)
    if (!sameCodeContent(current.scope, scope)) throw changed()
    if (await prior(db, scope)) {
      const result = await readStagingState(db, scope, true)
      await authorize(db)
      return result
    }
    if (!sameCodeContent(await load(db, scope), snapshot)) throw changed()
    return write(db, scope, snapshot.revision, host.domainId)
  })
}
