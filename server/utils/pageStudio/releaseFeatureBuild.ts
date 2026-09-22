import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { BuilderArtifactPinSchema } from '~~/shared/pageStudio/cmsManaged'
import {
  collectionCanonical,
  collectionDigest
} from '~~/shared/pageStudio/collectionApi'
import { verifyBuilderReleaseRecovery } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { createCmsGraphStorage } from './cmsGraphStorage'
import { cmsEqual } from './cmsVisibility'
import type {
  CmsGraphSnapshot,
  CmsGraphDependencies
} from './cmsGraphCoordinator'
import {
  type FeaturePublisher,
  readFeaturePublisherSnapshot,
  withFeaturePublisher,
  featureConflict
} from './releaseFeatureAuthority'
import {
  readApprovedBuildAuthority,
  admitPageStudioReleaseBuild,
  persistSuccessfulBuild,
  type PageStudioApprovedBuildInput,
  type PageStudioWorkerBuildResult
} from './builds'

const runtimeDigest
  = 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e'
const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const FeatureSealMarkerSchema = z
  .object({
    formatVersion: z.literal(1),
    checkpointDigest: digest,
    sha256: digest
  })
  .strict()
export type FeatureSealMarker = z.infer<typeof FeatureSealMarkerSchema>
const recoverySchema = z
  .object({
    key: z
      .string()
      .regex(
        /^builder-recovery\/v1\/[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9]{64}\.json$/
      ),
    bytes: z.number().int().positive().max(8_000_000),
    sha256: digest
  })
  .strict()
type BuildPointer = Awaited<ReturnType<typeof persistSuccessfulBuild>>
export interface FeatureBuildServices {
  buildSealed(input: {
    request: {
      approval: {
        approvalId: string
        digest: string
        status: 'approved'
        versionId: string
      }
      assets: PageStudioApprovedBuildInput['assets']
      manifest: unknown
      scope: BuildPointer['scope']
      versionDigest: string
      versionId: string
    }
    recoveryBundle: unknown
  }): Promise<{
    build: PageStudioWorkerBuildResult
    recovery: z.infer<typeof recoverySchema>
    reference: FeatureSealMarker
  }>
  verifyFeatureBuild(
    pointer: BuildPointer,
    reference: FeatureSealMarker
  ): Promise<unknown>
}

export async function readFeatureRecoveryExact(
  env: Record<string, unknown>,
  key: string,
  expected: string
) {
  const bucket = env.PAGE_STUDIO_CHECKPOINTS as
    | {
      get(
        key: string
      ): Promise<{ size?: number, body: ReadableStream<Uint8Array> } | null>
    }
    | undefined
  if (!bucket?.get) throw featureConflict()
  const object = await bucket.get(key),
    expectedSize = new TextEncoder().encode(expected).byteLength
  if (!object) throw featureConflict()
  if (object.size !== undefined && object.size !== expectedSize) {
    await object.body.cancel().catch(() => {})
    throw featureConflict()
  }
  const reader = object.body.getReader(),
    chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > expectedSize) throw featureConflict()
      chunks.push(part.value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  if (new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== expected)
    throw featureConflict()
}

async function recoveryBundle(
  snapshot: CmsGraphSnapshot,
  principal: FeaturePublisher
) {
  const env = principal.request.env
  z.enum(['staging', 'production']).parse(env.PAGE_STUDIO_RELEASE_ENVIRONMENT)
  if (env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST !== runtimeDigest)
    throw featureConflict()
  const storage = createCmsGraphStorage(env, snapshot)
  const checkpoint = await storage.readCheckpoint(snapshot.checkpoint)
  const selected = snapshot.context.application.manifest
  const pins = [...selected.components, ...selected.actions]
  const collectionPins = z
    .object({
      builderApplication: z.object({
        collections: z.array(BuilderArtifactPinSchema)
      })
    })
    .parse(checkpoint.manifest).builderApplication.collections
  const artifacts = []
  for (const pin of pins)
    artifacts.push({ pin, bytes: await storage.readArtifact(pin) })
  const objects = await storage.readObjects(
    snapshot.schemas.map(item => item.pin)
  )
  const schemas = objects.map((object, index) => {
    const accepted = snapshot.schemas[index]!
    if (
      !cmsEqual(object.pin, accepted.pin)
      || object.actorId !== accepted.actorId
      || Date.parse(object.createdAt) !== Date.parse(accepted.createdAt)
      || object.schema !== null
    )
      throw featureConflict()
    return { pin: object.pin, bytes: collectionCanonical(object.body) }
  })
  for (const pin of collectionPins) {
    const schema = schemas.find(
      item =>
        item.pin.collectionId === pin.id && item.pin.version === pin.version
    )
    if (!schema) throw featureConflict()
    artifacts.push({
      pin,
      bytes: collectionCanonical({
        kind: 'collection',
        definition: JSON.parse(schema.bytes)
      })
    })
  }
  const bundle = {
    formatVersion: 1 as const,
    contentScope: snapshot.scope,
    application: {
      id: snapshot.context.application.id,
      digest: snapshot.context.application.digest
    },
    checkpoint: {
      id: checkpoint.id,
      sha256: checkpoint.digest,
      bytes: collectionCanonical(checkpoint.manifest)
    },
    generation: snapshot.context.state.active_generation,
    target: snapshot.context.state.target,
    freezeDigest: snapshot.context.state.freeze_digest,
    runtimeDigest,
    artifacts,
    schemas
  }
  await verifyBuilderReleaseRecovery(bundle)
  return { bundle, manifest: checkpoint.manifest }
}

/** Browser input cannot provide proofs or select private object keys. Remote I/O
 * finishes before the atomic native approval/build/seal transaction. */
export async function coordinateSealedFeatureBuild(
  input: PageStudioApprovedBuildInput,
  principal: FeaturePublisher,
  services: FeatureBuildServices,
  dependencies: CmsGraphDependencies = {}
) {
  const snapshot = await readFeaturePublisherSnapshot(principal, dependencies)
  if (
    input.actorId !== principal.request.actor.actorId
    || input.siteId !== snapshot.scope.siteId
    || input.tenantId !== snapshot.scope.tenantId
  )
    throw featureConflict()
  const authority = await withFeaturePublisher(
    snapshot,
    principal,
    async db => await readApprovedBuildAuthority(db, input),
    dependencies
  )
  if (authority.digest !== snapshot.checkpoint.digest) throw featureConflict()
  const { bundle, manifest } = await recoveryBundle(snapshot, principal)
  if (!cmsEqual(input.manifest, manifest)) throw featureConflict()
  const sha256 = await collectionDigest(bundle)
  const reference: FeatureSealMarker = {
    formatVersion: 1,
    checkpointDigest: authority.digest,
    sha256
  }
  const expectedRecovery = {
    key: `builder-recovery/v1/${await collectionDigest(snapshot.scope)}/${authority.digest}/${sha256}.json`,
    sha256,
    bytes: new TextEncoder().encode(collectionCanonical(bundle)).byteLength
  }
  await withFeaturePublisher(snapshot, principal, async (db) => {
    await readApprovedBuildAuthority(db, input)
    await admitPageStudioReleaseBuild(db, snapshot.scope, authority.digest)
  }, dependencies)
  // Unknown outcomes remain recoverable through deterministic immutable storage;
  // never write a failed native build after a lost service response.
  const result = await services.buildSealed({
    request: {
      approval: {
        approvalId: authority.approval_id,
        digest: authority.digest,
        status: 'approved',
        versionId: input.versionId
      },
      assets: input.assets,
      manifest,
      scope: {
        tenantId: snapshot.scope.tenantId,
        clientId: snapshot.scope.clientId,
        siteId: snapshot.scope.siteId
      },
      versionDigest: authority.digest,
      versionId: input.versionId
    },
    recoveryBundle: bundle
  })
  if (
    !cmsEqual(FeatureSealMarkerSchema.parse(result.reference), reference)
    || !cmsEqual(recoverySchema.parse(result.recovery), expectedRecovery)
  )
    throw featureConflict()
  await readFeatureRecoveryExact(
    principal.request.env,
    expectedRecovery.key,
    collectionCanonical(bundle)
  )
  const pointer = {
    ...result.build,
    scope: {
      tenantId: snapshot.scope.tenantId,
      clientId: snapshot.scope.clientId,
      siteId: snapshot.scope.siteId
    }
  }
  await services.verifyFeatureBuild(pointer, reference)
  return await withFeaturePublisher(
    snapshot,
    principal,
    async (db) => {
      const saved = await persistSuccessfulBuild(
        input,
        authority,
        result.build,
        async work => await work(db)
      )
      const identity = {
        approvalId: authority.approval_id,
        reference,
        recovery: expectedRecovery,
        application: bundle.application,
        checkpoint: bundle.checkpoint.id,
        generation: bundle.generation,
        target: bundle.target,
        freezeDigest: bundle.freezeDigest,
        runtimeDigest,
        contentScope: snapshot.scope,
        versionId: input.versionId
      }
      const publisher = {
        actor: snapshot.actor,
        principalIdentity: snapshot.principalIdentity
      }
      const existing = (
        await db.query(
          'SELECT * FROM page_studio_release_feature_seals WHERE scope_key=$1 AND build_id=$2',
          [snapshot.context.state.scope_key, saved.buildId]
        )
      ).rows[0]
      if (existing) {
        if (
          !cmsEqual(existing.identity, identity)
          || existing.manifest_digest !== saved.manifestDigest
        )
          throw featureConflict()
      } else {
        const auditId = randomUUID()
        await db.query(
          `INSERT INTO page_studio_release_feature_seals(scope_key,build_id,tenant_id,client_id,site_id,version_id,version_digest,manifest_digest,seal_digest,recovery_key,recovery_bytes,identity,publisher,audit_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            snapshot.context.state.scope_key,
            saved.buildId,
            snapshot.scope.tenantId,
            snapshot.scope.clientId,
            snapshot.scope.siteId,
            input.versionId,
            authority.digest,
            saved.manifestDigest,
            sha256,
            expectedRecovery.key,
            expectedRecovery.bytes,
            identity,
            publisher,
            auditId
          ]
        )
        await db.query(
          `INSERT INTO page_studio_audit_events(id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,'agency','release.feature_sealed','build',$6,$7,$8)`,
          [
            auditId,
            snapshot.scope.tenantId,
            snapshot.scope.clientId,
            snapshot.scope.siteId,
            input.actorId,
            saved.buildId,
            `feature-seal:${saved.buildId}`,
            { sealDigest: sha256 }
          ]
        )
      }
      await db.query(
        `UPDATE page_studio_builds SET release_metadata=COALESCE(release_metadata,'{}'::jsonb)||jsonb_build_object('featureSeal',$5::jsonb) WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4`,
        [
          snapshot.scope.tenantId,
          snapshot.scope.clientId,
          snapshot.scope.siteId,
          saved.buildId,
          reference
        ]
      )
      return saved
    },
    dependencies
  )
}
