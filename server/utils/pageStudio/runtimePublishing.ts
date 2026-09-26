import {
  verifyNativeAstroRuntimeRelease,
  type NativeAstroRuntimeRelease
} from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { transaction } from '~~/server/utils/db'
import {
  lockReleasePointer,
  nullableActorUuid,
  requireScopedSiteForPublishing,
  type PageStudioPublishingQueryClient,
  type PageStudioPublishingScope
} from './publishing'
import { PageStudioPublishingError } from './publishingError'
import type { PreparedRuntimeRelease } from './runtimeReleases'

/**
 * Activation and rollback for Astro runtime releases. Mirrors the static path:
 * site lock, hostname advisory lock, compare-and-swap on the active release,
 * idempotency via the audit record, and approval re-checked inside the
 * transaction against the exact prepared version digest.
 */

export interface PageStudioRuntimeReleasePointer {
  delivery: 'runtime'
  environment: 'staging' | 'production'
  release: NativeAstroRuntimeRelease
  releaseDigest: string
  releaseId: string
}

export interface PageStudioRuntimeActivationInput {
  actorId: string
  environment: 'staging' | 'production'
  expectedActiveReleaseId: string | null
  hostname: string
  idempotencyKey: string
  prepared: PreparedRuntimeRelease
  scope: PageStudioPublishingScope
}

export interface PageStudioRuntimeRollbackInput {
  actorId: string
  environment: 'staging' | 'production'
  expectedActiveReleaseId: string
  hostname: string
  idempotencyKey: string
  /** Renderer generations still deployed; a rollback target must run on one of them. */
  retainedGenerations: readonly string[]
  scope: PageStudioPublishingScope
  targetReleaseId: string
}

type RunTransaction = <T>(callback: (db: PageStudioPublishingQueryClient) => Promise<T>) => Promise<T>
const defaultRunTransaction: RunTransaction = callback =>
  transaction(async db => callback(db as unknown as PageStudioPublishingQueryClient))

interface RuntimeReleaseRow {
  environment: 'staging' | 'production'
  normalized_hostname: string
  release_id: string
  runtime_release: unknown
  runtime_release_digest: string
}

function error(code: PageStudioPublishingError['code'], statusCode: number, message: string) {
  return new PageStudioPublishingError(code, statusCode, message)
}

/** Stored references are re-verified on every read; a tampered row fails closed. */
async function pointerFrom(row: RuntimeReleaseRow): Promise<PageStudioRuntimeReleasePointer> {
  const verified = await verifyNativeAstroRuntimeRelease(row.runtime_release).catch(() => null)
  if (!verified || verified.digest !== row.runtime_release_digest || verified.release.environment !== row.environment) {
    throw error('RELEASE_RECORD_INVALID', 500, 'Stored Page Studio runtime release failed verification')
  }
  return {
    delivery: 'runtime',
    environment: row.environment,
    release: verified.release,
    releaseDigest: verified.digest,
    releaseId: row.release_id
  }
}

async function requireRuntimeSite(db: PageStudioPublishingQueryClient, scope: PageStudioPublishingScope) {
  await requireScopedSiteForPublishing(db, scope)
  const mode = await db.query<{ delivery_mode: string }>(
    'SELECT delivery_mode FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 AND id=$3',
    [scope.tenantId, scope.clientId, scope.siteId]
  )
  if (mode.rows[0]?.delivery_mode !== 'runtime') {
    throw error('RUNTIME_DELIVERY_DISABLED', 409, 'Runtime delivery is not enabled for this Page Studio site')
  }
}

const RELEASE_COLUMNS = `release.id AS release_id, release.environment, release.normalized_hostname,
  release.runtime_release, release.runtime_release_digest`

export async function activatePageStudioRuntimeRelease(
  input: PageStudioRuntimeActivationInput,
  dependencies: { runTransaction?: RunTransaction } = {}
): Promise<PageStudioRuntimeReleasePointer> {
  const { prepared, scope } = input
  if (prepared.release.environment !== input.environment
    || prepared.release.scope.tenantId !== scope.tenantId
    || prepared.release.scope.clientId !== scope.clientId
    || prepared.release.scope.siteId !== scope.siteId) {
    throw error('BUILD_NOT_PUBLISHABLE', 422, 'Runtime release does not belong to this site and environment')
  }
  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  return runTransaction(async (db) => {
    await requireRuntimeSite(db, scope)

    const existing = (await db.query<RuntimeReleaseRow & { actor_id: string }>(
      `SELECT ${RELEASE_COLUMNS}, audit.actor_id
       FROM page_studio_releases release
       JOIN page_studio_audit_events audit
         ON audit.tenant_id = release.tenant_id AND audit.client_id = release.client_id
        AND audit.site_id = release.site_id AND audit.resource_type = 'release'
        AND audit.resource_id = release.id::text AND audit.action = 'release.activated'
        AND audit.idempotency_key = 'release:activate:' || release.idempotency_key
       WHERE release.tenant_id = $1 AND release.client_id = $2 AND release.site_id = $3
         AND release.idempotency_key = $4
       FOR SHARE OF release`,
      [scope.tenantId, scope.clientId, scope.siteId, input.idempotencyKey]
    )).rows[0]
    if (existing) {
      if (existing.actor_id !== input.actorId || existing.environment !== input.environment
        || existing.normalized_hostname !== input.hostname || existing.runtime_release_digest !== prepared.digest) {
        throw error('RELEASE_IDEMPOTENCY_CONFLICT', 409, 'Release idempotency key already represents a different activation')
      }
      return pointerFrom(existing)
    }

    const current = await lockReleasePointer(db, input)
    const activeReleaseId = current?.active_release_id ?? null
    if (activeReleaseId !== input.expectedActiveReleaseId) {
      throw error('RELEASE_POINTER_CONFLICT', 409, 'The active Page Studio release changed before activation')
    }

    // Approval binds the exact saved version: a newer edit never inherits it.
    const version = (await db.query<{ id: string, status: string, latest_review_decision: string | null }>(
      `SELECT version.id, version.status, latest_review.decision AS latest_review_decision
       FROM page_studio_versions version
       LEFT JOIN LATERAL (
         SELECT review.decision FROM page_studio_reviews review
         WHERE review.tenant_id = version.tenant_id AND review.client_id = version.client_id
           AND review.site_id = version.site_id AND review.version_id = version.id
           AND review.version_digest = version.digest
         ORDER BY review.decided_at DESC, review.id DESC LIMIT 1
       ) latest_review ON TRUE
       WHERE version.tenant_id = $1 AND version.client_id = $2 AND version.site_id = $3
         AND version.id = $4 AND version.digest = $5
       FOR SHARE OF version`,
      [scope.tenantId, scope.clientId, scope.siteId, prepared.release.versionId, prepared.release.versionDigest]
    )).rows[0]
    if (!version || !['approved', 'published'].includes(version.status) || version.latest_review_decision !== 'approved') {
      throw error('BUILD_NOT_PUBLISHABLE', 422, 'The saved Page Studio version is not approved for publication')
    }

    const actorUuid = nullableActorUuid(input.actorId)
    const releaseId = (await db.query<{ release_id: string }>(
      `INSERT INTO page_studio_releases (
         tenant_id, client_id, site_id, environment, normalized_hostname, published_by,
         superseded_release_id, idempotency_key, runtime_release, runtime_release_digest,
         runtime_version_id, runtime_version_digest, release_metadata
       ) VALUES ($1, $2, $3, $4, $5, $6::uuid, $7::uuid, $8, $9::jsonb, $10, $11::uuid, $12, $13::jsonb)
       RETURNING id AS release_id`,
      [scope.tenantId, scope.clientId, scope.siteId, input.environment, input.hostname, actorUuid,
        activeReleaseId, input.idempotencyKey, JSON.stringify(prepared.release), prepared.digest,
        prepared.release.versionId, prepared.release.versionDigest, JSON.stringify(prepared.releaseMetadata)]
    )).rows[0]?.release_id
    if (!releaseId) throw new Error('Page Studio runtime release insert returned no row')

    if (activeReleaseId) {
      await db.query(
        `UPDATE page_studio_release_pointers
         SET active_release_id = $6, pointer_version = pointer_version + 1, updated_by = $7::uuid, updated_at = NOW()
         WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND environment = $4 AND normalized_hostname = $5`,
        [scope.tenantId, scope.clientId, scope.siteId, input.environment, input.hostname, releaseId, actorUuid]
      )
    } else {
      await db.query(
        `INSERT INTO page_studio_release_pointers (
           tenant_id, client_id, site_id, environment, normalized_hostname, active_release_id, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::uuid)`,
        [scope.tenantId, scope.clientId, scope.siteId, input.environment, input.hostname, releaseId, actorUuid]
      )
    }
    await db.query(
      `UPDATE page_studio_versions SET status = 'published', updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND id = $4`,
      [scope.tenantId, scope.clientId, scope.siteId, prepared.release.versionId]
    )
    await db.query(
      `UPDATE page_studio_sites SET current_release_id = $4, status = 'active', updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND id = $3`,
      [scope.tenantId, scope.clientId, scope.siteId, releaseId]
    )
    await db.query(
      `INSERT INTO page_studio_audit_events (
         tenant_id, client_id, site_id, actor_id, actor_role, action, resource_type, resource_id, idempotency_key, metadata
       ) VALUES ($1, $2, $3, $4, 'service', 'release.activated', 'release', $5, $6, $7::jsonb)`,
      [scope.tenantId, scope.clientId, scope.siteId, input.actorId, releaseId,
        `release:activate:${input.idempotencyKey}`,
        JSON.stringify({
          delivery: 'runtime',
          environment: input.environment,
          hostname: input.hostname,
          previousReleaseId: activeReleaseId,
          releaseDigest: prepared.digest,
          renderer: prepared.release.renderer.generation,
          versionId: prepared.release.versionId
        })]
    )
    return {
      delivery: 'runtime',
      environment: input.environment,
      release: prepared.release,
      releaseDigest: prepared.digest,
      releaseId
    }
  })
}

export async function rollbackPageStudioRuntimeRelease(
  input: PageStudioRuntimeRollbackInput,
  dependencies: { runTransaction?: RunTransaction } = {}
): Promise<PageStudioRuntimeReleasePointer> {
  if (input.targetReleaseId === input.expectedActiveReleaseId) {
    throw error('ROLLBACK_TARGET_INVALID', 422, 'The rollback target must differ from the active release')
  }
  const { scope } = input
  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  return runTransaction(async (db) => {
    await requireRuntimeSite(db, scope)

    const existing = (await db.query<RuntimeReleaseRow & { actor_id: string, previous_release_id: string }>(
      `SELECT ${RELEASE_COLUMNS}, audit.actor_id, audit.metadata->>'previousReleaseId' AS previous_release_id
       FROM page_studio_audit_events audit
       JOIN page_studio_releases release
         ON release.tenant_id = audit.tenant_id AND release.client_id = audit.client_id
        AND release.site_id = audit.site_id AND release.id::text = audit.resource_id
       WHERE audit.tenant_id = $1 AND audit.client_id = $2 AND audit.site_id = $3
         AND audit.action = 'release.rolled_back' AND audit.idempotency_key = $4
       FOR SHARE OF release`,
      [scope.tenantId, scope.clientId, scope.siteId, `release:rollback:${input.idempotencyKey}`]
    )).rows[0]
    if (existing) {
      if (existing.actor_id !== input.actorId || existing.environment !== input.environment
        || existing.normalized_hostname !== input.hostname || existing.release_id !== input.targetReleaseId
        || existing.previous_release_id !== input.expectedActiveReleaseId || !existing.runtime_release) {
        throw error('RELEASE_IDEMPOTENCY_CONFLICT', 409, 'Release idempotency key already represents a different rollback')
      }
      return pointerFrom(existing)
    }

    const current = await lockReleasePointer(db, input)
    if (current?.active_release_id !== input.expectedActiveReleaseId) {
      throw error('RELEASE_POINTER_CONFLICT', 409, 'The active Page Studio release changed before rollback')
    }
    const target = (await db.query<RuntimeReleaseRow>(
      `SELECT ${RELEASE_COLUMNS}
       FROM page_studio_releases release
       WHERE release.tenant_id = $1 AND release.client_id = $2 AND release.site_id = $3 AND release.id = $4
         AND release.runtime_release IS NOT NULL
       FOR SHARE OF release`,
      [scope.tenantId, scope.clientId, scope.siteId, input.targetReleaseId]
    )).rows[0]
    if (!target || target.environment !== input.environment || target.normalized_hostname !== input.hostname) {
      throw error('ROLLBACK_TARGET_INVALID', 422, 'The Page Studio rollback target is not valid for this release pointer')
    }
    const pointer = await pointerFrom(target)
    if (!input.retainedGenerations.includes(pointer.release.renderer.generation)) {
      throw error('ROLLBACK_TARGET_INVALID', 409, 'The renderer for that release is no longer deployed; republish its approved version instead')
    }

    const actorUuid = nullableActorUuid(input.actorId)
    await db.query(
      `UPDATE page_studio_release_pointers
       SET active_release_id = $6, pointer_version = pointer_version + 1, updated_by = $7::uuid, updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND environment = $4 AND normalized_hostname = $5`,
      [scope.tenantId, scope.clientId, scope.siteId, input.environment, input.hostname, input.targetReleaseId, actorUuid]
    )
    await db.query(
      `UPDATE page_studio_sites SET current_release_id = $4, updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND id = $3`,
      [scope.tenantId, scope.clientId, scope.siteId, input.targetReleaseId]
    )
    await db.query(
      `INSERT INTO page_studio_audit_events (
         tenant_id, client_id, site_id, actor_id, actor_role, action, resource_type, resource_id, idempotency_key, metadata
       ) VALUES ($1, $2, $3, $4, 'service', 'release.rolled_back', 'release', $5, $6, $7::jsonb)`,
      [scope.tenantId, scope.clientId, scope.siteId, input.actorId, input.targetReleaseId,
        `release:rollback:${input.idempotencyKey}`,
        JSON.stringify({
          delivery: 'runtime',
          environment: input.environment,
          hostname: input.hostname,
          previousReleaseId: input.expectedActiveReleaseId,
          releaseDigest: pointer.releaseDigest
        })]
    )
    return pointer
  })
}
