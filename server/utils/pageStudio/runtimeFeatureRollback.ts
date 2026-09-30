import { assertRuntimeFeatureAdmission, assertRuntimeFeatureForms } from './runtimeFeatureAdmission'
import { randomUUID } from 'node:crypto'
import { verifyNativeAstroRuntimeFeatureRecovery, verifyNativeAstroRuntimeRelease } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { readApprovedBuildAuthority } from './builds'
import { cmsEqual } from './cmsVisibility'
import { featureConflict, readFeaturePublisherSnapshot, withFeaturePublisher, type FeaturePublisher } from './releaseFeatureAuthority'
import { readPublishedFeatureRecovery } from './publishedFeatureProjection'
import { RuntimeFeatureSealIdentitySchema } from './publishedRuntimeFeatureAuthority'
import { rollbackPageStudioRuntimeRelease, type PageStudioRuntimeRollbackInput } from './runtimePublishing'
import type { RuntimeTargetPolicy } from './runtimeTarget'
import type { CmsGraphDependencies } from './cmsGraphCoordinator'
import type { PageStudioControlQueryClient } from './controlStore'

/** Explicit restore grants a new epoch. It never restores sealed record heads,
 * revives a revoked grant, or turns an old publish retry into a restore. */
export async function rollbackRuntimeFeature(raw: PageStudioRuntimeRollbackInput, principal: FeaturePublisher,
  dependencies: CmsGraphDependencies & { policy: RuntimeTargetPolicy }) {
  const input = structuredClone(raw), snapshot = await readFeaturePublisherSnapshot(principal, dependencies)
  const { scope } = input
  if (input.actorId !== principal.request.actor.actorId
    || !cmsEqual(scope, { tenantId: snapshot.scope.tenantId, clientId: snapshot.scope.clientId, siteId: snapshot.scope.siteId })) throw featureConflict()
  const readTarget = async (db: PageStudioControlQueryClient) => {
    const row = (await db.query(`SELECT release.runtime_release,release.runtime_release_digest,release.environment,release.normalized_hostname,
      seal.scope_key,seal.identity,seal.release_digest FROM page_studio_releases release JOIN page_studio_runtime_feature_seals seal
      ON seal.release_id=release.id AND seal.tenant_id=release.tenant_id AND seal.client_id=release.client_id AND seal.site_id=release.site_id
      WHERE release.tenant_id=$1 AND release.client_id=$2 AND release.site_id=$3 AND release.id=$4 FOR SHARE OF release`,
    [scope.tenantId, scope.clientId, scope.siteId, input.targetReleaseId])).rows[0]
    if (!row) throw featureConflict()
    const verified = await verifyNativeAstroRuntimeRelease(row.runtime_release), seal = RuntimeFeatureSealIdentitySchema.parse(row.identity)
    if (row.scope_key !== snapshot.context.state.scope_key || !cmsEqual(seal.contentScope, snapshot.scope)
      || !cmsEqual(verified.release.scope, scope) || verified.release.environment !== input.environment
      || row.environment !== input.environment || row.normalized_hostname !== input.hostname
      || row.release_digest !== verified.digest || row.runtime_release_digest !== verified.digest || seal.reference.releaseDigest !== verified.digest
      || seal.generation !== snapshot.context.state.active_generation || seal.freezeDigest !== snapshot.context.state.freeze_digest
      || !cmsEqual(seal.target, snapshot.context.state.target) || seal.runtimeDigest !== principal.request.env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST) throw featureConflict()
    assertRuntimeFeatureAdmission(verified.release, principal.request.env)
    const approved = await readApprovedBuildAuthority(db, { tenantId: scope.tenantId, siteId: scope.siteId, versionId: verified.release.versionId })
    if (approved.approval_id !== seal.approvalId || approved.digest !== verified.release.versionDigest) throw featureConflict()
    return { ...verified, seal }
  }
  const target = await withFeaturePublisher(snapshot, principal, readTarget, dependencies)
  const recovery = await readPublishedFeatureRecovery({ contentScope: target.seal.contentScope,
    request: { versionDigest: target.release.versionDigest, sealDigest: target.seal.reference.recovery.sha256 },
    seal: { ...target.seal, recovery: target.seal.reference.recovery } }, principal.request.env)
  await verifyNativeAstroRuntimeFeatureRecovery(target.seal.reference, target.release, collectionCanonical(recovery.bundle))
  assertRuntimeFeatureForms(recovery.checkpoint)
  return await withFeaturePublisher(snapshot, principal, async (db) => {
    if (!cmsEqual(target, await readTarget(db))) throw featureConflict()
    const release = await rollbackPageStudioRuntimeRelease(input, { policy: dependencies.policy, runTransaction: work => work(db) })
    const pointer = (await db.query(`SELECT active_release_id,pointer_version FROM page_studio_release_pointers
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND environment=$4 AND normalized_hostname=$5 FOR UPDATE`,
    [scope.tenantId, scope.clientId, scope.siteId, input.environment, input.hostname])).rows[0]
    const epoch = Number(pointer?.pointer_version)
    if (pointer?.active_release_id !== release.releaseId || !Number.isSafeInteger(epoch) || epoch < 1) throw featureConflict()
    const identity = { request: { ...input, operation: 'rollback' }, publisher: snapshot.actor }
    const existing = (await db.query(`SELECT * FROM page_studio_runtime_feature_activations WHERE environment=$1 AND hostname=$2 AND pointer_version=$3 FOR SHARE`, [input.environment, input.hostname, epoch])).rows[0]
    if (existing) {
      if (existing.release_id !== release.releaseId || existing.state !== 'enabled' || existing.revoked_at !== null || !cmsEqual(existing.identity, identity)) throw featureConflict()
      return { ...release, featureActivation: { id: String(existing.id), pointerVersion: epoch } }
    }
    // A prior successful rollback at another epoch cannot grant access again.
    const prior = (await db.query(`SELECT id FROM page_studio_runtime_feature_activations WHERE release_id=$1 AND identity->'request'->>'operation'='rollback'
      AND identity->'request'->>'idempotencyKey'=$2`, [release.releaseId, input.idempotencyKey])).rows[0]
    if (prior) throw featureConflict()
    const id = randomUUID(), auditId = randomUUID()
    await db.query(`INSERT INTO page_studio_runtime_feature_activations(id,release_id,environment,hostname,pointer_version,identity,audit_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, release.releaseId, input.environment, input.hostname, epoch, identity, auditId])
    await db.query(`INSERT INTO page_studio_audit_events(id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
      VALUES($1,$2,$3,$4,$5,'agency','release.runtime_feature_restored','release',$6,$7,$8)`,
    [auditId, scope.tenantId, scope.clientId, scope.siteId, input.actorId, release.releaseId, `runtime-feature:${id}`, { pointerVersion: epoch, releaseDigest: release.releaseDigest }])
    return { ...release, featureActivation: { id, pointerVersion: epoch } }
  }, dependencies)
}
