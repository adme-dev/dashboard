import { z } from 'zod'
import { pageStudioStagingAddress } from '../../../shared/pageStudio/staging'
import type { DomainDatabase } from './domainAttachment'

const Scope = z.object({ tenantId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/), clientId: z.string().uuid(), siteId: z.string().uuid() }).strict()
type Scope = z.infer<typeof Scope>
const SnapshotRequest = z.object({
  scope: Scope, actorId: z.string().uuid(), actorRole: z.enum(['agency', 'client']),
  checkpointId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/), digest: z.string().regex(/^[a-f0-9]{64}$/),
  expectedActiveId: z.string().uuid().nullable(), idempotencyKey: z.string().min(1).max(200)
}).strict()
export class StagingStoreError extends Error {
  constructor(readonly code: 'STAGING_ACCESS_DENIED' | 'STAGING_CHANGED' | 'STAGING_BUSY' | 'STAGING_BUILD_LIMIT', readonly statusCode: number) {
    super(code === 'STAGING_BUILD_LIMIT' ? 'The monthly website build allowance has been reached' : code === 'STAGING_ACCESS_DENIED' ? 'Staging access is not active' : code === 'STAGING_BUSY' ? 'A staging update is already in progress' : 'The saved website or staging deployment changed. Refresh before trying again.')
    this.name = 'StagingStoreError'
  }
}
const changed = () => new StagingStoreError('STAGING_CHANGED', 409)
interface Reservation { hostname: string, hostState: string, activeId: string | null }
interface Snapshot {
  id: string
  checkpointId: string
  digest: string
  state: string
  actorId: string
  actorRole: string
  expectedActiveId: string | null
}

/** SQL-only primitives. The management service must authorize the current
 * native actor/session and hold that authority through this transaction.
 * No provider/network call belongs in a transaction, and no caller may pass an
 * editable hostname or substitute a synthetic tenant to obtain staging. */
export async function reserveStagingAddress(db: DomainDatabase, input: Scope): Promise<Reservation> {
  const scope = Scope.parse(input)
  const available = await db.query(`SELECT site.id FROM page_studio_sites site
    JOIN agency_clients client ON client.id=site.client_id AND client.is_active=TRUE
    JOIN page_studio_entitlements entitlement ON entitlement.tenant_id=site.tenant_id
      AND entitlement.client_id=site.client_id AND entitlement.id=site.entitlement_id
      AND entitlement.status IN ('trial','active') AND entitlement.effective_from <= clock_timestamp()
      AND (entitlement.effective_until IS NULL OR entitlement.effective_until > clock_timestamp())
    WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3 AND site.status IN ('draft','active')
    FOR NO KEY UPDATE OF site FOR SHARE OF client, entitlement`, [scope.tenantId, scope.clientId, scope.siteId])
  if (available.rows.length !== 1) throw new StagingStoreError('STAGING_ACCESS_DENIED', 403)
  const { hostname } = pageStudioStagingAddress(scope.siteId)
  await db.query(`INSERT INTO page_studio_staging_sites(tenant_id,client_id,site_id,hostname)
    VALUES($1,$2,$3,$4) ON CONFLICT (tenant_id,client_id,site_id) DO NOTHING`, [scope.tenantId, scope.clientId, scope.siteId, hostname])
  const result = await db.query<Reservation>(`SELECT hostname,host_state AS "hostState",active_deployment_id::text AS "activeId"
    FROM page_studio_staging_sites WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 FOR UPDATE`, [scope.tenantId, scope.clientId, scope.siteId])
  const reservation = result.rows[0]
  if (result.rows.length !== 1 || !reservation || reservation.hostname !== hostname) throw changed()
  if (reservation.hostState === 'suspended') throw new StagingStoreError('STAGING_ACCESS_DENIED', 403)
  return reservation
}

export async function beginStagingSnapshot(db: DomainDatabase, raw: z.infer<typeof SnapshotRequest>): Promise<Snapshot> {
  const input = SnapshotRequest.parse(raw)
  const { scope } = input
  const params = [scope.tenantId, scope.clientId, scope.siteId]
  const reservation = await reserveStagingAddress(db, scope)
  const existing = await db.query<Snapshot>(`SELECT id::text,checkpoint_id AS "checkpointId",checkpoint_digest AS digest,state,
      actor_id::text AS "actorId",actor_role AS "actorRole",expected_active_id::text AS "expectedActiveId"
    FROM page_studio_staging_deployments WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND idempotency_key=$4`, [...params, input.idempotencyKey])
  if (existing.rows[0]) {
    const retained = existing.rows[0]
    if (retained.actorId !== input.actorId || retained.actorRole !== input.actorRole || retained.checkpointId !== input.checkpointId
      || retained.digest !== input.digest || retained.expectedActiveId !== input.expectedActiveId) throw changed()
    return retained
  }
  if (reservation.activeId !== input.expectedActiveId) throw changed()
  const current = await db.query(`SELECT checkpoint.id FROM page_studio_sites site
    JOIN page_studio_checkpoints checkpoint ON checkpoint.tenant_id=site.tenant_id AND checkpoint.client_id=site.client_id
      AND checkpoint.site_id=site.id AND checkpoint.id=site.current_checkpoint_id
    WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3 AND checkpoint.id=$4 AND checkpoint.digest=$5`, [...params, input.checkpointId, input.digest])
  if (current.rows.length !== 1) throw changed()
  const pending = await db.query(`SELECT id FROM page_studio_staging_deployments
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND state IN ('queued','building')`, params)
  if (pending.rows.length) throw new StagingStoreError('STAGING_BUSY', 409)
  const snapshotId = crypto.randomUUID()
  try {
    await db.query('SELECT admit_page_studio_build($1,$2,$3,\'staging\',$4)', [...params, snapshotId])
  } catch (error) {
    if (error instanceof Error && error.message === 'STUDIO_BUILD_LIMIT') throw new StagingStoreError('STAGING_BUILD_LIMIT', 429)
    if (error instanceof Error && error.message === 'STUDIO_BUILD_ACCESS') throw new StagingStoreError('STAGING_ACCESS_DENIED', 403)
    throw error
  }
  const inserted = await db.query<Snapshot>(`INSERT INTO page_studio_staging_deployments
    (tenant_id,client_id,site_id,actor_id,actor_role,idempotency_key,checkpoint_id,checkpoint_digest,expected_active_id,id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id::text,checkpoint_id AS "checkpointId",checkpoint_digest AS digest,state,
      actor_id::text AS "actorId",actor_role AS "actorRole",expected_active_id::text AS "expectedActiveId"`,
  [...params, input.actorId, input.actorRole, input.idempotencyKey, input.checkpointId, input.digest, input.expectedActiveId, snapshotId])
  const snapshot = inserted.rows[0]
  if (!snapshot) throw changed()
  await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,metadata)
    VALUES($1,$2,$3,$4,$5,'staging.requested','staging_deployment',$6,$7::jsonb)`,
  [...params, input.actorId, input.actorRole, snapshot.id, JSON.stringify({ checkpointId: input.checkpointId, digest: input.digest, hostname: reservation.hostname })])
  return snapshot
}

export function stagingArtifactPrefix(rawScope: Scope, rawId: string): string {
  const scope = Scope.parse(rawScope)
  const id = z.string().uuid().parse(rawId)
  return `client-staging/tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/snapshots/${id}`
}
const Completion = z.object({ scope: Scope, id: z.string().uuid(), artifactPrefix: z.string().min(1).max(1024), manifestDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()

/** Caller verifies the immutable Worker artifact before committing this receipt.
 * Provider and artifact evidence are not substitutes for fresh native access. */
export async function finishStagingSnapshot(db: DomainDatabase, raw: z.infer<typeof Completion>): Promise<void> {
  const input = Completion.parse(raw)
  const { scope } = input
  const params = [scope.tenantId, scope.clientId, scope.siteId]
  if (input.artifactPrefix !== stagingArtifactPrefix(scope, input.id)) throw changed()
  const reservation = await reserveStagingAddress(db, scope)
  const result = await db.query<Snapshot & { artifactPrefix: string | null, manifestDigest: string | null }>(`SELECT id::text,
      checkpoint_id AS "checkpointId",checkpoint_digest AS digest,state,actor_id::text AS "actorId",actor_role AS "actorRole",
      expected_active_id::text AS "expectedActiveId",artifact_prefix AS "artifactPrefix",artifact_manifest_digest AS "manifestDigest"
    FROM page_studio_staging_deployments WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4 FOR UPDATE`, [...params, input.id])
  const snapshot = result.rows[0]
  if (!snapshot || reservation.hostState !== 'ready') throw changed()
  if (snapshot.state === 'succeeded') {
    if (snapshot.artifactPrefix !== input.artifactPrefix || snapshot.manifestDigest !== input.manifestDigest) throw changed()
    // A completed retry is a receipt; never rewind a newer active snapshot.
    return
  }
  if (!['queued', 'building'].includes(snapshot.state) || reservation.activeId !== snapshot.expectedActiveId) throw changed()
  const current = await db.query(`SELECT checkpoint.id FROM page_studio_sites site
    JOIN page_studio_checkpoints checkpoint ON checkpoint.tenant_id=site.tenant_id AND checkpoint.client_id=site.client_id
      AND checkpoint.site_id=site.id AND checkpoint.id=site.current_checkpoint_id
    WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3 AND checkpoint.id=$4 AND checkpoint.digest=$5`, [...params, snapshot.checkpointId, snapshot.digest])
  if (current.rows.length !== 1) throw changed()
  await db.query(`UPDATE page_studio_staging_deployments SET state='succeeded',artifact_prefix=$5,artifact_manifest_digest=$6,deployed_at=clock_timestamp()
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4`, [...params, input.id, input.artifactPrefix, input.manifestDigest])
  await db.query(`UPDATE page_studio_staging_sites SET active_deployment_id=$4,updated_at=clock_timestamp()
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3`, [...params, input.id])
  await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,metadata)
    VALUES($1,$2,$3,$4,$5,'staging.activated','staging_deployment',$6,$7::jsonb)`, [...params, snapshot.actorId, snapshot.actorRole, input.id,
    JSON.stringify({ checkpointId: snapshot.checkpointId, digest: snapshot.digest, manifestDigest: input.manifestDigest, hostname: reservation.hostname })])
}

const Failure = z.object({ scope: Scope, id: z.string().uuid(), failure: z.enum(['HOST_UNAVAILABLE', 'BUILD_FAILED', 'SNAPSHOT_CHANGED', 'ACCESS_INACTIVE']) }).strict()
export async function failStagingSnapshot(db: DomainDatabase, raw: z.infer<typeof Failure>): Promise<void> {
  const input = Failure.parse(raw)
  const { scope } = input
  // Releasing a retained failed job must remain possible after access expires.
  // The private coordinator must prove ownership of this exact claimed job.
  // Lock order matches reserve/finish; no successful snapshot or pointer changes.
  await db.query('SELECT id FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR NO KEY UPDATE', [scope.tenantId, scope.clientId, scope.siteId])
  const result = await db.query(`UPDATE page_studio_staging_deployments SET state='failed',failure_code=$5
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4 AND state IN ('queued','building') RETURNING actor_id,actor_role`,
  [scope.tenantId, scope.clientId, scope.siteId, input.id, input.failure])
  const actor = result.rows[0]
  if (actor) await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,metadata)
    VALUES($1,$2,$3,$4,$5,'staging.failed','staging_deployment',$6,$7::jsonb)`, [scope.tenantId, scope.clientId, scope.siteId, actor.actor_id, actor.actor_role, input.id, JSON.stringify({ code: input.failure })])
}
