import { randomUUID } from 'node:crypto'
import { readApprovedBuildAuthority } from './builds'
import { cmsEqual } from './cmsVisibility'
import { featureConflict, readFeaturePublisherSnapshot, withFeaturePublisher, type FeaturePublisher } from './releaseFeatureAuthority'
import { prepareApprovedRuntimeFeature } from './runtimeFeaturePreparation'
import { activatePageStudioRuntimeRelease } from './runtimePublishing'
import type { CmsGraphDependencies } from './cmsGraphCoordinator'
import type { RuntimeTargetPolicy } from './runtimeTarget'

type Preparation = Parameters<typeof prepareApprovedRuntimeFeature>[0]
export interface RuntimeFeatureActivationInput {
  actorId: string
  environment: 'staging' | 'production'
  hostname: string
  expectedActiveReleaseId: string | null
  idempotencyKey: string
  preparation: Preparation
}

/** One transaction owns the ordinary runtime pointer, immutable CMS seal and
 * epoch-specific activation. A preparation result alone cannot enable CMS. */
export async function activateRuntimeFeature(
  raw: RuntimeFeatureActivationInput,
  principal: FeaturePublisher,
  dependencies: CmsGraphDependencies & { policy: RuntimeTargetPolicy }
) {
  const { preparation: source, ...request } = raw
  const preparation = { ...structuredClone({ ...source, bucket: undefined }), bucket: source.bucket }
  const { scope, versionId } = preparation
  if (request.actorId !== principal.request.actor.actorId || request.environment !== preparation.environment) throw featureConflict()
  const snapshot = await readFeaturePublisherSnapshot(principal, dependencies)
  const result = await prepareApprovedRuntimeFeature(preparation, principal, dependencies)
  if (!cmsEqual(result.feature.contentScope, snapshot.scope)
    || result.feature.checkpoint !== snapshot.checkpoint.id
    || result.prepared.release.versionDigest !== snapshot.checkpoint.digest) throw featureConflict()
  const authorityInput = { tenantId: scope.tenantId, siteId: scope.siteId, versionId }
  return await withFeaturePublisher(snapshot, principal, async (db) => {
    const assertApproval = async () => {
      const authority = await readApprovedBuildAuthority(db, authorityInput)
      if (authority.approval_id !== result.feature.approvalId || authority.digest !== result.prepared.release.versionDigest) throw featureConflict()
    }
    await assertApproval()
    const release = await activatePageStudioRuntimeRelease({ ...request, prepared: result.prepared, scope }, {
      policy: dependencies.policy, runTransaction: work => work(db)
    })
    const pointer = (await db.query(`SELECT active_release_id,pointer_version FROM page_studio_release_pointers
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND environment=$4 AND normalized_hostname=$5 FOR UPDATE`,
    [scope.tenantId, scope.clientId, scope.siteId, request.environment, request.hostname])).rows[0]
    if (!pointer || pointer.active_release_id !== release.releaseId) throw featureConflict()
    const epoch = Number(pointer.pointer_version)
    if (!Number.isSafeInteger(epoch) || epoch < 1) throw featureConflict()
    const seal = (await db.query('SELECT * FROM page_studio_runtime_feature_seals WHERE release_id=$1', [release.releaseId])).rows[0]
    if (seal && (!cmsEqual(seal.identity, result.feature)
      || seal.release_digest !== result.prepared.digest
      || seal.scope_key !== snapshot.context.state.scope_key
      || seal.tenant_id !== scope.tenantId || seal.client_id !== scope.clientId || seal.site_id !== scope.siteId)) throw featureConflict()
    const identity = { request: { ...request, scope, versionId }, publisher: snapshot.actor }
    const existing = (await db.query(`SELECT * FROM page_studio_runtime_feature_activations
      WHERE environment=$1 AND hostname=$2 AND pointer_version=$3 FOR SHARE`, [request.environment, request.hostname, epoch])).rows[0]
    if (existing) {
      if (!seal || existing.state !== 'enabled' || existing.revoked_at !== null
        || existing.release_id !== release.releaseId || !cmsEqual(existing.identity, identity)) throw featureConflict()
      await assertApproval()
      return { ...release, featureActivation: { id: String(existing.id), pointerVersion: epoch } }
    }
    // A retry of an older pointer epoch must not create a fresh grant.
    const historical = (await db.query('SELECT id FROM page_studio_runtime_feature_activations WHERE release_id=$1 LIMIT 1', [release.releaseId])).rows[0]
    if (historical) throw featureConflict()
    const auditId = randomUUID(), activationId = randomUUID()
    if (!seal) await db.query(`INSERT INTO page_studio_runtime_feature_seals
      (release_id,scope_key,tenant_id,client_id,site_id,release_digest,identity,publisher,audit_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [release.releaseId, snapshot.context.state.scope_key, scope.tenantId, scope.clientId, scope.siteId,
      result.prepared.digest, result.feature, snapshot.actor, auditId])
    await db.query(`INSERT INTO page_studio_runtime_feature_activations
      (id,release_id,environment,hostname,pointer_version,identity,audit_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [activationId, release.releaseId, request.environment, request.hostname, epoch, identity, auditId])
    await db.query(`INSERT INTO page_studio_audit_events
      (id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
      VALUES($1,$2,$3,$4,$5,'agency','release.runtime_feature_activated','release',$6,$7,$8)`,
    [auditId, scope.tenantId, scope.clientId, scope.siteId, request.actorId, release.releaseId,
      `runtime-feature:${activationId}`, { pointerVersion: epoch, releaseDigest: release.releaseDigest }])
    await assertApproval()
    return { ...release, featureActivation: { id: activationId, pointerVersion: epoch } }
  }, dependencies)
}
