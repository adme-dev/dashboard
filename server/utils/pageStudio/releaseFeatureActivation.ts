import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  collectionCanonical,
  collectionDigest
} from '~~/shared/pageStudio/collectionApi'
import { verifyBuilderReleaseRecovery } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import {
  type FeaturePublisher,
  readFeaturePublisherSnapshot,
  withFeaturePublisher,
  featureConflict,
  featureDenied
} from './releaseFeatureAuthority'
import {
  FeatureSealMarkerSchema,
  readFeatureRecoveryExact,
  type FeatureSealMarker
} from './releaseFeatureBuild'
import type { CmsGraphDependencies } from './cmsGraphCoordinator'
import { cmsEqual } from './cmsVisibility'
import {
  activatePageStudioRelease,
  type PageStudioActivateReleaseInput,
  type PageStudioBuildPointer
} from './publishing'
import { readApprovedBuildAuthority } from './builds'

const proofs = new WeakMap<
  object,
  { input: string, marker: FeatureSealMarker }
>()
/** Local module-branded proof only; direct machine activation cannot forge it. */
export function assertFeatureActivationProof(
  input: PageStudioActivateReleaseInput,
  marker: unknown,
  proof?: object
) {
  const retained = proof && proofs.get(proof)
  if (
    !retained
    || retained.input !== collectionCanonical(input)
    || !cmsEqual(retained.marker, FeatureSealMarkerSchema.parse(marker))
  )
    throw featureConflict()
}
export async function coordinateFeatureActivation(
  input: PageStudioActivateReleaseInput,
  principal: FeaturePublisher,
  service: {
    verifyFeatureBuild(
      pointer: PageStudioBuildPointer,
      reference: FeatureSealMarker
    ): Promise<unknown>
  },
  dependencies: CmsGraphDependencies = {}
) {
  if (
    input.environment !== principal.request.env.PAGE_STUDIO_RELEASE_ENVIRONMENT
    || input.actorId !== principal.request.actor.actorId
  )
    throw featureConflict()
  const snapshot = await readFeaturePublisherSnapshot(principal, dependencies)
  if (
    !cmsEqual(input.scope, {
      tenantId: snapshot.scope.tenantId,
      clientId: snapshot.scope.clientId,
      siteId: snapshot.scope.siteId
    })
  )
    throw featureConflict()
  const replay = await withFeaturePublisher(
    snapshot,
    principal,
    async (db) => {
      const row = (
        await db.query(
          `SELECT activation.*,build.artifact_prefix,build.release_manifest_key,build.release_manifest_digest,build.version_digest,pointer.active_release_id,pointer.pointer_version AS current_pointer_version
      FROM page_studio_release_feature_activations activation JOIN page_studio_releases release ON release.id::text=activation.release_id
      JOIN page_studio_builds build ON build.id=activation.build_id AND build.tenant_id=$1 AND build.client_id=$2 AND build.site_id=$3
      LEFT JOIN page_studio_release_pointers pointer ON pointer.tenant_id=$1 AND pointer.client_id=$2 AND pointer.site_id=$3 AND pointer.environment=activation.environment AND pointer.normalized_hostname=activation.hostname
      WHERE activation.scope_key=$4 AND release.idempotency_key=$5`,
          [
            input.scope.tenantId,
            input.scope.clientId,
            input.scope.siteId,
            snapshot.context.state.scope_key,
            input.idempotencyKey
          ]
        )
      ).rows[0]
      if (!row) return null
      const identity = row.identity as { request: unknown, publisher: unknown }
      if (
        !cmsEqual(identity.request, input)
        || !cmsEqual(identity.publisher, snapshot.actor)
      )
        throw featureConflict()
      return {
        artifactPrefix: String(row.artifact_prefix),
        buildId: String(row.build_id),
        manifestDigest: String(row.release_manifest_digest),
        manifestKey: String(row.release_manifest_key),
        versionDigest: String(row.version_digest),
        scope: input.scope,
        environment: input.environment,
        releaseId: String(row.release_id),
        featureActivation: {
          id: String(row.id),
          pointerVersion: Number(row.pointer_version),
          isCurrent:
            row.state === 'enabled'
            && row.active_release_id === row.release_id
            && Number(row.current_pointer_version) === Number(row.pointer_version)
        }
      }
    },
    dependencies
  )
  if (replay) return replay
  const evidence = await withFeaturePublisher(
    snapshot,
    principal,
    async (db) => {
      const seal = (
        await db.query(
          'SELECT * FROM page_studio_release_feature_seals WHERE scope_key=$1 AND build_id=$2',
          [snapshot.context.state.scope_key, input.buildId]
        )
      ).rows[0]
      const build = (
        await db.query(
          'SELECT * FROM page_studio_builds WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4',
          [
            input.scope.tenantId,
            input.scope.clientId,
            input.scope.siteId,
            input.buildId
          ]
        )
      ).rows[0]
      if (!seal || !build || build.state !== 'succeeded')
        throw featureConflict()
      const marker = FeatureSealMarkerSchema.parse(
        (build.release_metadata as Record<string, unknown>)?.featureSeal
      )
      const identity = z
        .object({
          approvalId: z.string(),
          reference: FeatureSealMarkerSchema,
          recovery: z.object({
            key: z.string(),
            bytes: z.number(),
            sha256: z.string()
          }),
          application: z.object({ id: z.string(), digest: z.string() }),
          checkpoint: z.string(),
          generation: z.string(),
          target: z.unknown(),
          freezeDigest: z.string(),
          runtimeDigest: z.string(),
          contentScope: z.unknown(),
          versionId: z.string()
        })
        .strict()
        .parse(seal.identity)
      if (
        !cmsEqual(marker, identity.reference)
        || marker.sha256 !== seal.seal_digest
        || marker.checkpointDigest !== seal.version_digest
        || build.release_manifest_digest !== seal.manifest_digest
        || build.version_digest !== seal.version_digest
        || build.version_id !== identity.versionId
        || identity.recovery.key !== seal.recovery_key
        || identity.recovery.bytes !== seal.recovery_bytes
        || identity.recovery.sha256 !== seal.seal_digest
        || !cmsEqual(identity.contentScope, snapshot.scope)
      )
        throw featureConflict()
      const authority = await readApprovedBuildAuthority(db, {
        tenantId: input.scope.tenantId,
        siteId: input.scope.siteId,
        versionId: identity.versionId
      })
      if (
        authority.approval_id !== identity.approvalId
        || authority.digest !== marker.checkpointDigest
        || snapshot.checkpoint.id !== identity.checkpoint
        || snapshot.checkpoint.digest !== marker.checkpointDigest
        || !cmsEqual(identity.application, {
          id: snapshot.context.application.id,
          digest: snapshot.context.application.digest
        })
        || identity.generation !== snapshot.context.state.active_generation
        || !cmsEqual(identity.target, snapshot.context.state.target)
        || identity.freezeDigest !== snapshot.context.state.freeze_digest
        || identity.runtimeDigest
        !== principal.request.env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST
        || identity.runtimeDigest
        !== 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e'
      )
        throw featureConflict()
      return {
        identity,
        marker,
        pointer: {
          artifactPrefix: String(build.artifact_prefix),
          buildId: input.buildId,
          manifestDigest: String(build.release_manifest_digest),
          manifestKey: String(build.release_manifest_key),
          scope: input.scope,
          versionDigest: String(build.version_digest)
        }
      }
    },
    dependencies
  )
  const bucket = principal.request.env.PAGE_STUDIO_CHECKPOINTS as
    | {
      get(
        key: string
      ): Promise<{ size?: number, body: ReadableStream<Uint8Array> } | null>
    }
    | undefined
  // Recover the immutable bundle by its retained deterministic key, bounded before parse.
  const object = await bucket?.get(evidence.identity.recovery.key)
  if (!object) throw featureConflict()
  const max = evidence.identity.recovery.bytes
  if (
    !Number.isSafeInteger(max)
    || max < 1
    || max > 8_000_000
    || (object.size !== undefined && object.size !== max)
  ) {
    await object.body.cancel().catch(() => {})
    throw featureConflict()
  }
  const reader = object.body.getReader()
  let raw = '',
    bytes = 0
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > max) throw featureConflict()
      raw += decoder.decode(part.value, { stream: true })
    }
    raw += decoder.decode()
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  if (bytes !== max) throw featureConflict()
  const verified = await verifyBuilderReleaseRecovery(JSON.parse(raw))
  if (
    verified.digest !== evidence.marker.sha256
    || collectionCanonical(verified.bundle) !== raw
  )
    throw featureConflict()
  const expectedKey = `builder-recovery/v1/${await collectionDigest(snapshot.scope)}/${evidence.marker.checkpointDigest}/${evidence.marker.sha256}.json`
  if (expectedKey !== evidence.identity.recovery.key) throw featureConflict()
  await readFeatureRecoveryExact(principal.request.env, expectedKey, raw)
  await service.verifyFeatureBuild(evidence.pointer, evidence.marker)
  const proof = Object.freeze({})
  proofs.set(proof, {
    input: collectionCanonical(input),
    marker: evidence.marker
  })
  try {
    return await withFeaturePublisher(
      snapshot,
      principal,
      async (db) => {
        const approved = await readApprovedBuildAuthority(db, {
          tenantId: input.scope.tenantId,
          siteId: input.scope.siteId,
          versionId: evidence.identity.versionId
        })
        if (
          approved.approval_id !== evidence.identity.approvalId
          || approved.digest !== evidence.marker.checkpointDigest
        )
          throw featureConflict()
        if (verified.forms.some(form => form.publicCreateEligible)) {
          const policy = (
            await db.query(
              `SELECT entitlement.plan_metadata FROM page_studio_sites site JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3`,
              [input.scope.tenantId, input.scope.clientId, input.scope.siteId]
            )
          ).rows[0]?.plan_metadata as
          | { builder?: { actionExecution?: unknown } }
          | undefined
          if (policy?.builder?.actionExecution !== true) throw featureDenied()
        }
        const release = await activatePageStudioRelease(input, {
          featureProof: proof,
          runTransaction: work => work(db)
        })
        const pointer = (
          await db.query(
            'SELECT active_release_id,pointer_version FROM page_studio_release_pointers WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND environment=$4 AND normalized_hostname=$5 FOR UPDATE',
            [
              input.scope.tenantId,
              input.scope.clientId,
              input.scope.siteId,
              input.environment,
              input.hostname
            ]
          )
        ).rows[0]
        const existing = (
          await db.query(
            'SELECT * FROM page_studio_release_feature_activations WHERE scope_key=$1 AND release_id=$2',
            [snapshot.context.state.scope_key, release.releaseId]
          )
        ).rows[0]
        const identity = {
          request: input,
          sealDigest: evidence.marker.sha256,
          publisher: snapshot.actor
        }
        if (existing) {
          if (!cmsEqual(existing.identity, identity)) throw featureConflict()
          return {
            ...release,
            featureActivation: {
              id: existing.id,
              pointerVersion: Number(existing.pointer_version),
              isCurrent:
                existing.state === 'enabled'
                && pointer?.active_release_id === release.releaseId
                && Number(pointer.pointer_version)
                === Number(existing.pointer_version)
            }
          }
        }
        if (!pointer || pointer.active_release_id !== release.releaseId)
          throw featureConflict()
        const id = randomUUID(),
          auditId = randomUUID()
        await db.query(
          `INSERT INTO page_studio_release_feature_activations(id,scope_key,build_id,environment,hostname,pointer_version,release_id,seal_digest,identity,audit_id) VALUES($1,$2,$3,$10,$4,$5,$6,$7,$8,$9)`,
          [
            id,
            snapshot.context.state.scope_key,
            input.buildId,
            input.hostname,
            pointer.pointer_version,
            release.releaseId,
            evidence.marker.sha256,
            identity,
            auditId,
            input.environment
          ]
        )
        await db.query(
          `INSERT INTO page_studio_audit_events(id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,'agency','release.feature_activated','release',$6,$7,$8)`,
          [
            auditId,
            input.scope.tenantId,
            input.scope.clientId,
            input.scope.siteId,
            input.actorId,
            release.releaseId,
            `feature-activation:${id}`,
            {
              sealDigest: evidence.marker.sha256,
              pointerVersion: Number(pointer.pointer_version)
            }
          ]
        )
        const finalApproval = await readApprovedBuildAuthority(db, {
          tenantId: input.scope.tenantId,
          siteId: input.scope.siteId,
          versionId: evidence.identity.versionId
        })
        if (
          finalApproval.approval_id !== evidence.identity.approvalId
          || finalApproval.digest !== evidence.marker.checkpointDigest
        )
          throw featureConflict()
        return {
          ...release,
          featureActivation: {
            id,
            pointerVersion: Number(pointer.pointer_version),
            isCurrent: true
          }
        }
      },
      dependencies
    )
  } finally {
    proofs.delete(proof)
  }
}
