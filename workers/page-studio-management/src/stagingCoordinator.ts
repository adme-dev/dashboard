import { StagingProviderDomainIdSchema } from './stagingProvider'
import { z } from 'zod'
import { PageStudioStagingRequestSchema, pageStudioStagingAddress } from '../../../shared/pageStudio/staging'
import type { DomainTransaction } from './domainAttachment'
import { requireStagingAuthority } from './stagingAuthority'
import { readStagingState } from './stagingRead'
import { beginInitialStagingSnapshot, beginStagingSnapshot, finishStagingSnapshot, failStagingSnapshot, stagingArtifactPrefix, StagingStoreError } from './stagingStore'

type Request = z.infer<typeof PageStudioStagingRequestSchema>
type Scope = { tenantId: string, clientId: string, siteId: string }
type BuildInput = { scope: Scope, snapshotId: string, checkpointId: string, digest: string }
export interface StagingCoordinatorDependencies {
  transaction: DomainTransaction
  attach(siteId: string): Promise<{ domainId: string, hostname: string, certificateId: string }>
  probe(hostname: string): Promise<boolean>
  build(input: BuildInput): Promise<unknown>
  verify(input: BuildInput & { artifactPrefix: string, manifestDigest: string }): Promise<unknown>
}
const BuildReceipt = z.object({ artifactPrefix: z.string().max(1024), manifestKey: z.string().max(1100), manifestDigest: z.string().regex(/^[a-f0-9]{64}$/), snapshotId: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()

/** Network calls happen outside SQL transactions. Each final write is fenced by
 * its expiring claim and fresh actor/entitlement/checkpoint authority. */
export async function coordinateStaging(raw: unknown, dependencies: StagingCoordinatorDependencies) {
  const request: Request = PageStudioStagingRequestSchema.parse(raw)
  const { actor, siteId } = request
  const { transaction } = dependencies
  const read = () => transaction(async (db) => {
    const authority = await requireStagingAuthority(db, actor, siteId, false)
    return readStagingState(db, authority.scope, authority.canManage)
  })
  if (request.operation === 'read') return read()
  const claimed = await transaction(async (db) => {
    const { scope } = await requireStagingAuthority(db, actor, siteId, true)
    const params = [scope.tenantId, scope.clientId, siteId]
    let snapshot: Awaited<ReturnType<typeof beginStagingSnapshot>> | null
    if (request.operation === 'ensure') {
      snapshot = await beginInitialStagingSnapshot(db, { scope, actorId: actor.actorId, actorRole: actor.kind === 'agency' ? 'agency' : 'client' })
    } else {
      const retained = (await db.query<{ checkpointId: string }>(`SELECT checkpoint_id AS "checkpointId" FROM page_studio_staging_deployments
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND idempotency_key=$4`, [...params, request.body.idempotencyKey])).rows[0]
      const current = (await db.query<{ checkpointId: string }>(`SELECT current_checkpoint_id AS "checkpointId" FROM page_studio_sites
      WHERE tenant_id=$1 AND client_id=$2 AND id=$3`, params)).rows[0]
      const checkpointId = retained?.checkpointId ?? current?.checkpointId
      if (!checkpointId) throw new StagingStoreError('STAGING_CHANGED', 409)
      // A dead request may be superseded after its lease. Its old token can no
      // longer activate anything, even if its network response arrives late.
      const expired = await db.query<{ id: string }>(`SELECT id FROM page_studio_staging_deployments WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3
      AND state='building' AND claim_until<clock_timestamp() AND idempotency_key<>$4`, [...params, request.body.idempotencyKey])
      for (const row of expired.rows) await failStagingSnapshot(db, { scope, id: row.id, failure: 'BUILD_FAILED' })
      snapshot = await beginStagingSnapshot(db, { scope, checkpointId, digest: request.body.digest, expectedActiveId: request.body.expectedActiveId,
        idempotencyKey: request.body.idempotencyKey, actorId: actor.actorId, actorRole: actor.kind === 'agency' ? 'agency' : 'client' })
    }
    if (!snapshot || ['succeeded', 'failed'].includes(snapshot.state)) return null
    const token = crypto.randomUUID()
    const claim = await db.query(`UPDATE page_studio_staging_deployments SET state='building',claim_token=$5,claim_until=clock_timestamp()+INTERVAL '2 minutes'
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4 AND state IN ('queued','building')
      AND (claim_until IS NULL OR claim_until<clock_timestamp()) RETURNING id`, [...params, snapshot.id, token])
    return claim.rows.length ? { scope, snapshot, token } : null
  })
  if (!claimed) return read()
  const { scope, snapshot, token } = claimed
  const identity = { scope, snapshotId: snapshot.id, checkpointId: snapshot.checkpointId, digest: snapshot.digest }
  const params = [scope.tenantId, scope.clientId, scope.siteId, snapshot.id, token]
  let failure: 'HOST_UNAVAILABLE' | 'BUILD_FAILED' | 'SNAPSHOT_CHANGED' | 'ACCESS_INACTIVE' = 'HOST_UNAVAILABLE'
  async function withClaim<T>(work: (db: Parameters<Parameters<DomainTransaction>[0]>[0]) => Promise<T>) {
    return transaction(async (db) => {
      await requireStagingAuthority(db, actor, siteId, true)
      const row = await db.query(`SELECT id FROM page_studio_staging_deployments WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4
        AND claim_token=$5 AND state='building' AND claim_until>clock_timestamp() FOR UPDATE`, params)
      if (row.rows.length !== 1) throw new StagingStoreError('STAGING_CHANGED', 409)
      return work(db)
    })
  }
  try {
    const address = pageStudioStagingAddress(siteId)
    const host = await dependencies.attach(siteId)
    if (host.hostname !== address.hostname || !StagingProviderDomainIdSchema.safeParse(host.domainId).success || !z.string().uuid().safeParse(host.certificateId).success
      || !await dependencies.probe(address.hostname)) throw new Error('Staging hostname not ready')
    await withClaim(async (db) => {
      const result = await db.query(`UPDATE page_studio_staging_sites SET host_state='ready',provider_domain_id=$4,provider_verified_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND host_state<>'suspended'
        AND (provider_domain_id IS NULL OR provider_domain_id=$4) RETURNING site_id`, [scope.tenantId, scope.clientId, siteId, host.domainId])
      if (result.rows.length !== 1) throw new StagingStoreError('STAGING_CHANGED', 409)
    })
    failure = 'BUILD_FAILED'
    const built = BuildReceipt.parse(await dependencies.build(identity))
    const prefix = stagingArtifactPrefix(scope, snapshot.id)
    if (built.snapshotId !== snapshot.id || built.digest !== snapshot.digest || built.artifactPrefix !== prefix || built.manifestKey !== `${prefix}/staging-manifest.json`) throw new Error('Staging build mismatch')
    const verified = z.object({ verified: z.literal(true), manifestDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(await dependencies.verify({ ...identity, artifactPrefix: prefix, manifestDigest: built.manifestDigest }))
    if (verified.manifestDigest !== built.manifestDigest) throw new Error('Staging read-back failed')
    failure = 'SNAPSHOT_CHANGED'
    await withClaim(db => finishStagingSnapshot(db, { scope, id: snapshot.id, artifactPrefix: prefix, manifestDigest: built.manifestDigest }))
  } catch (error) {
    if (error instanceof StagingStoreError && error.code === 'STAGING_ACCESS_DENIED') failure = 'ACCESS_INACTIVE'
    await transaction(async (db) => {
      await db.query('SELECT id FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR NO KEY UPDATE', params.slice(0, 3))
      const owned = await db.query(`SELECT id FROM page_studio_staging_deployments WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4 AND claim_token=$5 AND state='building' FOR UPDATE`, params)
      if (owned.rows.length) await failStagingSnapshot(db, { scope, id: snapshot.id, failure })
    })
  }
  return read()
}
