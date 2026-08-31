import type { H3Event } from 'h3'

import { queryOne, transaction } from '~~/server/utils/db'

export interface PageStudioPublishingScope {
  tenantId: string
  clientId: string
  siteId: string
}

export interface PageStudioBuildPointer {
  artifactPrefix: string
  buildId: string
  manifestDigest: string
  manifestKey: string
  scope: PageStudioPublishingScope
  versionDigest: string
}

export interface PageStudioReleasePointer extends PageStudioBuildPointer {
  environment: 'preview' | 'staging' | 'production'
  releaseId: string
}

export interface PageStudioPublishingQueryClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type RunTransaction = <T>(
  callback: (db: PageStudioPublishingQueryClient) => Promise<T>
) => Promise<T>

export interface PageStudioActivateReleaseInput {
  actorId: string
  buildId: string
  environment: 'staging' | 'production'
  expectedActiveReleaseId: string | null
  hostname: string
  idempotencyKey: string
  scope: PageStudioPublishingScope
}

export interface PageStudioRollbackReleaseInput {
  actorId: string
  environment: 'staging' | 'production'
  expectedActiveReleaseId: string
  hostname: string
  idempotencyKey: string
  scope: PageStudioPublishingScope
  targetReleaseId: string
}

export interface PageStudioDeliveryWorker {
  publish(input: PageStudioActivateReleaseInput): Promise<PageStudioReleasePointer>
  rollback(input: PageStudioRollbackReleaseInput): Promise<PageStudioReleasePointer>
}

interface BuildPointerRow {
  artifact_prefix: string
  build_id: string
  manifest_digest: string
  manifest_key: string
  version_digest: string
}

interface ReleasePointerRow extends BuildPointerRow {
  environment: PageStudioReleasePointer['environment']
  release_id: string
}

interface ExistingActivationRow extends ReleasePointerRow {
  actor_id: string
  normalized_hostname: string
}

interface PublishableBuildRow extends BuildPointerRow {
  latest_review_decision: 'approved' | 'rejected' | 'returned_to_draft' | null
  version_id: string
  version_status: 'approved' | 'published' | 'draft' | 'in_review' | 'rejected'
}

interface ExistingRollbackRow extends ReleasePointerRow {
  actor_id: string
  normalized_hostname: string
  previous_release_id: string
}

interface RollbackTargetRow extends ReleasePointerRow {
  normalized_hostname: string
}

interface LockedPointerRow {
  active_release_id: string
  client_id: string
  site_id: string
  tenant_id: string
}

const defaultRunTransaction: RunTransaction = callback =>
  transaction(async db => callback(db as unknown as PageStudioPublishingQueryClient))

export class PageStudioPublishingError extends Error {
  constructor(
    readonly code:
      | 'BUILD_NOT_PUBLISHABLE'
      | 'CONTROL_SCOPE_NOT_FOUND'
      | 'RELEASE_IDEMPOTENCY_CONFLICT'
      | 'RELEASE_POINTER_CONFLICT'
      | 'RELEASE_RECORD_INVALID'
      | 'RELEASE_WORKER_UNAVAILABLE'
      | 'ROLLBACK_TARGET_INVALID',
    readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'PageStudioPublishingError'
  }
}

export function resolvePageStudioDeliveryWorker(
  event: H3Event,
  environment: 'staging' | 'production'
): PageStudioDeliveryWorker {
  const env = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env
  const binding = env?.PAGE_STUDIO_DELIVERY
  const configuredEnvironment = env?.PAGE_STUDIO_RELEASE_ENVIRONMENT
  if (
    configuredEnvironment !== environment
    || !binding
    || typeof binding !== 'object'
    || typeof (binding as PageStudioDeliveryWorker).publish !== 'function'
    || typeof (binding as PageStudioDeliveryWorker).rollback !== 'function'
  ) {
    throw publishingError(
      'RELEASE_WORKER_UNAVAILABLE',
      503,
      'Page Studio release worker is unavailable for this environment'
    )
  }
  return binding as PageStudioDeliveryWorker
}

function publishingError(
  code: PageStudioPublishingError['code'],
  statusCode: number,
  message: string
): PageStudioPublishingError {
  return new PageStudioPublishingError(code, statusCode, message)
}

function expectedArtifactPrefix(scope: PageStudioPublishingScope, versionDigest: string): string {
  return `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/builds/${versionDigest}`
}

function mapBuildPointer(
  scope: PageStudioPublishingScope,
  row: BuildPointerRow
): PageStudioBuildPointer {
  const artifactPrefix = expectedArtifactPrefix(scope, row.version_digest)
  if (
    row.build_id !== `build_${row.version_digest.slice(0, 32)}`
    || row.artifact_prefix !== artifactPrefix
    || row.manifest_key !== `${artifactPrefix}/release-manifest.json`
  ) {
    throw new PageStudioPublishingError(
      'RELEASE_RECORD_INVALID',
      500,
      'Persisted Page Studio release metadata is invalid'
    )
  }
  return {
    artifactPrefix: row.artifact_prefix,
    buildId: row.build_id,
    manifestDigest: row.manifest_digest,
    manifestKey: row.manifest_key,
    scope,
    versionDigest: row.version_digest
  }
}

function mapReleasePointer(
  scope: PageStudioPublishingScope,
  row: ReleasePointerRow
): PageStudioReleasePointer {
  return {
    ...mapBuildPointer(scope, row),
    environment: row.environment,
    releaseId: row.release_id
  }
}

function activationMatches(row: ExistingActivationRow, input: PageStudioActivateReleaseInput) {
  return row.actor_id === input.actorId
    && row.build_id === input.buildId
    && row.environment === input.environment
    && row.normalized_hostname === input.hostname
}

async function requireScopedSiteForPublishing(
  db: PageStudioPublishingQueryClient,
  scope: PageStudioPublishingScope
): Promise<void> {
  const site = await db.query<{ id: string }>(
    `SELECT id
     FROM page_studio_sites
     WHERE tenant_id = $1 AND client_id = $2 AND id = $3
     FOR UPDATE`,
    [scope.tenantId, scope.clientId, scope.siteId]
  )
  if (!site.rows[0]) {
    throw publishingError(
      'CONTROL_SCOPE_NOT_FOUND',
      404,
      'Page Studio site scope not found'
    )
  }
}

async function lockReleasePointer(
  db: PageStudioPublishingQueryClient,
  input: {
    environment: 'staging' | 'production'
    hostname: string
    scope: PageStudioPublishingScope
  }
): Promise<LockedPointerRow | undefined> {
  await db.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`page-studio-release:${input.environment}:${input.hostname}`]
  )
  const current = await db.query<LockedPointerRow>(
    `SELECT tenant_id, client_id::text, site_id::text, active_release_id
     FROM page_studio_release_pointers
     WHERE environment = $1
       AND normalized_hostname = $2
     FOR UPDATE`,
    [input.environment, input.hostname]
  )
  const pointer = current.rows[0]
  if (pointer && (
    pointer.tenant_id !== input.scope.tenantId
    || pointer.client_id !== input.scope.clientId
    || pointer.site_id !== input.scope.siteId
  )) {
    throw publishingError(
      'RELEASE_POINTER_CONFLICT',
      409,
      'The release hostname belongs to another Page Studio scope'
    )
  }
  return pointer
}

function nullableActorUuid(actorId: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(actorId)
    ? actorId
    : null
}

async function findExistingActivation(
  db: PageStudioPublishingQueryClient,
  input: PageStudioActivateReleaseInput
): Promise<ExistingActivationRow | undefined> {
  const existing = await db.query<ExistingActivationRow>(
    `SELECT release.id AS release_id,
            release.environment,
            release.normalized_hostname,
            audit.actor_id,
            build.id AS build_id,
            build.version_digest,
            build.artifact_prefix,
            build.release_manifest_key AS manifest_key,
            build.release_manifest_digest AS manifest_digest
     FROM page_studio_releases release
     JOIN page_studio_builds build
       ON build.tenant_id = release.tenant_id
      AND build.client_id = release.client_id
      AND build.site_id = release.site_id
      AND build.id = release.build_id
     JOIN page_studio_audit_events audit
       ON audit.tenant_id = release.tenant_id
      AND audit.client_id = release.client_id
      AND audit.site_id = release.site_id
      AND audit.resource_type = 'release'
      AND audit.resource_id = release.id::text
      AND audit.action = 'release.activated'
      AND audit.idempotency_key = 'release:activate:' || release.idempotency_key
     WHERE release.tenant_id = $1
       AND release.client_id = $2
       AND release.site_id = $3
       AND release.idempotency_key = $4
     FOR SHARE`,
    [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.idempotencyKey]
  )
  return existing.rows[0]
}

async function loadPublishableBuild(
  db: PageStudioPublishingQueryClient,
  input: PageStudioActivateReleaseInput
): Promise<PublishableBuildRow> {
  const result = await db.query<PublishableBuildRow>(
    `SELECT build.id AS build_id,
            build.version_digest,
            build.artifact_prefix,
            build.release_manifest_key AS manifest_key,
            build.release_manifest_digest AS manifest_digest,
            version.id AS version_id,
            version.status AS version_status,
            latest_review.decision AS latest_review_decision
     FROM page_studio_builds build
     JOIN page_studio_versions version
       ON version.tenant_id = build.tenant_id
      AND version.client_id = build.client_id
      AND version.site_id = build.site_id
      AND version.id = build.version_id
      AND version.digest = build.version_digest
     LEFT JOIN LATERAL (
       SELECT review.decision
       FROM page_studio_reviews review
       WHERE review.tenant_id = version.tenant_id
         AND review.client_id = version.client_id
         AND review.site_id = version.site_id
         AND review.version_id = version.id
         AND review.version_digest = version.digest
       ORDER BY review.decided_at DESC, review.id DESC
       LIMIT 1
     ) latest_review ON TRUE
     WHERE build.tenant_id = $1
       AND build.client_id = $2
       AND build.site_id = $3
       AND build.id = $4
       AND build.state = 'succeeded'
     FOR SHARE OF build, version`,
    [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.buildId]
  )
  const build = result.rows[0]
  if (
    !build
    || !['approved', 'published'].includes(build.version_status)
    || build.latest_review_decision !== 'approved'
  ) {
    throw publishingError(
      'BUILD_NOT_PUBLISHABLE',
      422,
      'Page Studio build is not approved and publishable'
    )
  }
  mapBuildPointer(input.scope, build)
  return build
}

export async function getPageStudioBuildPointer(
  scope: PageStudioPublishingScope,
  buildId: string,
  dependencies: { queryOne?: typeof queryOne } = {}
): Promise<PageStudioBuildPointer | null> {
  const readOne = dependencies.queryOne ?? queryOne
  const row = await readOne<BuildPointerRow>(
    `SELECT build.id AS build_id,
            build.version_digest,
            build.artifact_prefix,
            build.release_manifest_key AS manifest_key,
            build.release_manifest_digest AS manifest_digest
     FROM page_studio_builds build
     WHERE build.tenant_id = $1
       AND build.client_id = $2
       AND build.site_id = $3
       AND build.id = $4
       AND build.state = 'succeeded'`,
    [scope.tenantId, scope.clientId, scope.siteId, buildId]
  )
  return row ? mapBuildPointer(scope, row) : null
}

export async function getPageStudioReleasePointer(
  scope: PageStudioPublishingScope,
  releaseId: string,
  dependencies: { queryOne?: typeof queryOne } = {}
): Promise<PageStudioReleasePointer | null> {
  const readOne = dependencies.queryOne ?? queryOne
  const row = await readOne<ReleasePointerRow>(
    `SELECT release.id AS release_id,
            release.environment,
            build.id AS build_id,
            build.version_digest,
            build.artifact_prefix,
            build.release_manifest_key AS manifest_key,
            build.release_manifest_digest AS manifest_digest
     FROM page_studio_releases release
     JOIN page_studio_builds build
       ON build.tenant_id = release.tenant_id
      AND build.client_id = release.client_id
      AND build.site_id = release.site_id
      AND build.id = release.build_id
     WHERE release.tenant_id = $1
       AND release.client_id = $2
       AND release.site_id = $3
       AND release.id = $4
       AND build.state = 'succeeded'`,
    [scope.tenantId, scope.clientId, scope.siteId, releaseId]
  )
  return row ? mapReleasePointer(scope, row) : null
}

export async function activatePageStudioRelease(
  input: PageStudioActivateReleaseInput,
  dependencies: { runTransaction?: RunTransaction } = {}
): Promise<PageStudioReleasePointer> {
  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  return runTransaction(async (db) => {
    await requireScopedSiteForPublishing(db, input.scope)

    const existing = await findExistingActivation(db, input)
    if (existing) {
      if (!activationMatches(existing, input)) {
        throw publishingError(
          'RELEASE_IDEMPOTENCY_CONFLICT',
          409,
          'Release idempotency key already represents a different activation'
        )
      }
      return mapReleasePointer(input.scope, existing)
    }

    const currentPointer = await lockReleasePointer(db, input)
    const activeReleaseId = currentPointer?.active_release_id ?? null
    if (activeReleaseId !== input.expectedActiveReleaseId) {
      throw publishingError(
        'RELEASE_POINTER_CONFLICT',
        409,
        'The active Page Studio release changed before activation'
      )
    }

    const build = await loadPublishableBuild(db, input)
    const actorUuid = nullableActorUuid(input.actorId)
    const created = await db.query<{ release_id: string }>(
      `INSERT INTO page_studio_releases (
         tenant_id, client_id, site_id, build_id, environment,
         normalized_hostname, published_by, superseded_release_id, idempotency_key
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::uuid, $8::uuid, $9)
       RETURNING id AS release_id`,
      [
        input.scope.tenantId,
        input.scope.clientId,
        input.scope.siteId,
        input.buildId,
        input.environment,
        input.hostname,
        actorUuid,
        activeReleaseId,
        input.idempotencyKey
      ]
    )
    const releaseId = created.rows[0]?.release_id
    if (!releaseId) throw new Error('Page Studio release insert returned no row')

    if (activeReleaseId) {
      await db.query(
        `UPDATE page_studio_release_pointers
         SET active_release_id = $6,
             pointer_version = pointer_version + 1,
             updated_by = $7::uuid,
             updated_at = NOW()
         WHERE tenant_id = $1
           AND client_id = $2
           AND site_id = $3
           AND environment = $4
           AND normalized_hostname = $5`,
        [
          input.scope.tenantId,
          input.scope.clientId,
          input.scope.siteId,
          input.environment,
          input.hostname,
          releaseId,
          actorUuid
        ]
      )
    } else {
      await db.query(
        `INSERT INTO page_studio_release_pointers (
           tenant_id, client_id, site_id, environment, normalized_hostname,
           active_release_id, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::uuid)`,
        [
          input.scope.tenantId,
          input.scope.clientId,
          input.scope.siteId,
          input.environment,
          input.hostname,
          releaseId,
          actorUuid
        ]
      )
    }

    await db.query(
      `UPDATE page_studio_versions
       SET status = 'published', updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND id = $4`,
      [input.scope.tenantId, input.scope.clientId, input.scope.siteId, build.version_id]
    )
    await db.query(
      `UPDATE page_studio_sites
       SET current_release_id = $4, updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND id = $3`,
      [input.scope.tenantId, input.scope.clientId, input.scope.siteId, releaseId]
    )
    await db.query(
      `INSERT INTO page_studio_audit_events (
         tenant_id, client_id, site_id, actor_id, actor_role, action,
         resource_type, resource_id, idempotency_key, metadata
       ) VALUES ($1, $2, $3, $4, 'service', 'release.activated',
         'release', $5, $6, $7::jsonb)`,
      [
        input.scope.tenantId,
        input.scope.clientId,
        input.scope.siteId,
        input.actorId,
        releaseId,
        `release:activate:${input.idempotencyKey}`,
        JSON.stringify({
          buildId: input.buildId,
          environment: input.environment,
          hostname: input.hostname,
          previousReleaseId: activeReleaseId
        })
      ]
    )

    return mapReleasePointer(input.scope, {
      ...build,
      environment: input.environment,
      release_id: releaseId
    })
  })
}

function rollbackMatches(row: ExistingRollbackRow, input: PageStudioRollbackReleaseInput) {
  return row.actor_id === input.actorId
    && row.environment === input.environment
    && row.normalized_hostname === input.hostname
    && row.previous_release_id === input.expectedActiveReleaseId
    && row.release_id === input.targetReleaseId
}

async function findExistingRollback(
  db: PageStudioPublishingQueryClient,
  input: PageStudioRollbackReleaseInput
): Promise<ExistingRollbackRow | undefined> {
  const existing = await db.query<ExistingRollbackRow>(
    `SELECT target.id AS release_id,
            target.environment,
            target.normalized_hostname,
            audit.actor_id,
            audit.metadata->>'previousReleaseId' AS previous_release_id,
            build.id AS build_id,
            build.version_digest,
            build.artifact_prefix,
            build.release_manifest_key AS manifest_key,
            build.release_manifest_digest AS manifest_digest
     FROM page_studio_audit_events audit
     JOIN page_studio_releases target
       ON target.tenant_id = audit.tenant_id
      AND target.client_id = audit.client_id
      AND target.site_id = audit.site_id
      AND target.id::text = audit.resource_id
     JOIN page_studio_builds build
       ON build.tenant_id = target.tenant_id
      AND build.client_id = target.client_id
      AND build.site_id = target.site_id
      AND build.id = target.build_id
     WHERE audit.tenant_id = $1
       AND audit.client_id = $2
       AND audit.site_id = $3
       AND audit.action = 'release.rolled_back'
       AND audit.idempotency_key = $4
     FOR SHARE`,
    [
      input.scope.tenantId,
      input.scope.clientId,
      input.scope.siteId,
      `release:rollback:${input.idempotencyKey}`
    ]
  )
  return existing.rows[0]
}

async function loadRollbackTarget(
  db: PageStudioPublishingQueryClient,
  input: PageStudioRollbackReleaseInput
): Promise<RollbackTargetRow> {
  const result = await db.query<RollbackTargetRow>(
    `SELECT target.id AS release_id,
            target.environment,
            target.normalized_hostname,
            build.id AS build_id,
            build.version_digest,
            build.artifact_prefix,
            build.release_manifest_key AS manifest_key,
            build.release_manifest_digest AS manifest_digest
     FROM page_studio_releases target
     JOIN page_studio_builds build
       ON build.tenant_id = target.tenant_id
      AND build.client_id = target.client_id
      AND build.site_id = target.site_id
      AND build.id = target.build_id
      AND build.state = 'succeeded'
     WHERE target.tenant_id = $1
       AND target.client_id = $2
       AND target.site_id = $3
       AND target.id = $4
     FOR SHARE OF target, build`,
    [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.targetReleaseId]
  )
  const target = result.rows[0]
  if (
    !target
    || target.environment !== input.environment
    || target.normalized_hostname !== input.hostname
  ) {
    throw publishingError(
      'ROLLBACK_TARGET_INVALID',
      422,
      'The Page Studio rollback target is not valid for this release pointer'
    )
  }
  mapReleasePointer(input.scope, target)
  return target
}

export async function rollbackPageStudioRelease(
  input: PageStudioRollbackReleaseInput,
  dependencies: { runTransaction?: RunTransaction } = {}
): Promise<PageStudioReleasePointer> {
  if (input.targetReleaseId === input.expectedActiveReleaseId) {
    throw publishingError(
      'ROLLBACK_TARGET_INVALID',
      422,
      'The rollback target must differ from the active release'
    )
  }

  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  return runTransaction(async (db) => {
    await requireScopedSiteForPublishing(db, input.scope)

    const existing = await findExistingRollback(db, input)
    if (existing) {
      if (!rollbackMatches(existing, input)) {
        throw publishingError(
          'RELEASE_IDEMPOTENCY_CONFLICT',
          409,
          'Release idempotency key already represents a different rollback'
        )
      }
      return mapReleasePointer(input.scope, existing)
    }

    const currentPointer = await lockReleasePointer(db, input)
    if (currentPointer?.active_release_id !== input.expectedActiveReleaseId) {
      throw publishingError(
        'RELEASE_POINTER_CONFLICT',
        409,
        'The active Page Studio release changed before rollback'
      )
    }

    const target = await loadRollbackTarget(db, input)
    const actorUuid = nullableActorUuid(input.actorId)
    await db.query(
      `UPDATE page_studio_release_pointers
       SET active_release_id = $6,
           pointer_version = pointer_version + 1,
           updated_by = $7::uuid,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND client_id = $2
         AND site_id = $3
         AND environment = $4
         AND normalized_hostname = $5`,
      [
        input.scope.tenantId,
        input.scope.clientId,
        input.scope.siteId,
        input.environment,
        input.hostname,
        input.targetReleaseId,
        actorUuid
      ]
    )
    await db.query(
      `UPDATE page_studio_sites
       SET current_release_id = $4, updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND id = $3`,
      [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.targetReleaseId]
    )
    await db.query(
      `INSERT INTO page_studio_audit_events (
         tenant_id, client_id, site_id, actor_id, actor_role, action,
         resource_type, resource_id, idempotency_key, metadata
       ) VALUES ($1, $2, $3, $4, 'service', 'release.rolled_back',
         'release', $5, $6, $7::jsonb)`,
      [
        input.scope.tenantId,
        input.scope.clientId,
        input.scope.siteId,
        input.actorId,
        input.targetReleaseId,
        `release:rollback:${input.idempotencyKey}`,
        JSON.stringify({
          environment: input.environment,
          hostname: input.hostname,
          previousReleaseId: input.expectedActiveReleaseId
        })
      ]
    )

    return mapReleasePointer(input.scope, target)
  })
}
