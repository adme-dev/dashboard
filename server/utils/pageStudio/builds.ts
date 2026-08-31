import type { H3Event } from 'h3'

import { queryOne, transaction } from '~~/server/utils/db'

export interface PageStudioBuildQueryClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type RunTransaction = <T>(callback: (db: PageStudioBuildQueryClient) => Promise<T>) => Promise<T>

export interface PageStudioBuildAsset {
  body: string | ArrayBuffer
  contentType: string
  path: string
  status: 'pending' | 'ready' | 'rejected'
}

export interface PageStudioBuildWorker {
  build(input: {
    approval: { approvalId: string, digest: string, status: 'approved', versionId: string }
    assets: PageStudioBuildAsset[]
    manifest: unknown
    scope: { tenantId: string, clientId: string, siteId: string }
    versionDigest: string
    versionId: string
  }): Promise<PageStudioWorkerBuildResult>
}

interface PageStudioWorkerBuildResult {
  artifactPrefix: string
  buildId: string
  manifestDigest: string
  manifestKey: string
  success: true
  validationKey: string
  versionDigest: string
}

interface BuildAuthorityRow {
  approval_id: string
  client_id: string
  digest: string
  review_decision: string | null
  site_status: string
  version_status: string
}

interface BuildRow {
  artifact_prefix: string
  id: string
  release_manifest_digest: string
  release_manifest_key: string
  state: 'pending' | 'succeeded' | 'failed'
  validation_report_key: string
  version_digest: string
}

export class PageStudioBuildError extends Error {
  constructor(
    readonly code:
      | 'BUILD_CONFLICT'
      | 'BUILD_NOT_APPROVED'
      | 'BUILD_RESULT_INVALID'
      | 'BUILD_VALIDATION_FAILED'
      | 'BUILD_WORKER_UNAVAILABLE',
    readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'PageStudioBuildError'
  }
}

export function resolvePageStudioBuildWorker(event: H3Event): PageStudioBuildWorker {
  const binding = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env?.PAGE_STUDIO_BUILD
  if (!binding || typeof binding !== 'object' || typeof (binding as PageStudioBuildWorker).build !== 'function') {
    throw new PageStudioBuildError(
      'BUILD_WORKER_UNAVAILABLE',
      503,
      'Page Studio build worker is unavailable'
    )
  }
  return binding as PageStudioBuildWorker
}

const defaultRunTransaction: RunTransaction = callback =>
  transaction(async db => callback(db as unknown as PageStudioBuildQueryClient))

const ZERO_DIGEST = '0'.repeat(64)

function authoritySql(lock: boolean): string {
  return `SELECT version.digest,
                 version.status AS version_status,
                 site.client_id::text,
                 site.status AS site_status,
                 latest_review.id AS approval_id,
                 latest_review.decision AS review_decision
          FROM page_studio_versions version
          JOIN page_studio_sites site
            ON site.tenant_id = version.tenant_id
           AND site.client_id = version.client_id
           AND site.id = version.site_id
          LEFT JOIN LATERAL (
            SELECT review.id, review.decision
            FROM page_studio_reviews review
            WHERE review.tenant_id = version.tenant_id
              AND review.client_id = version.client_id
              AND review.site_id = version.site_id
              AND review.version_id = version.id
              AND review.version_digest = version.digest
            ORDER BY review.decided_at DESC, review.id DESC
            LIMIT 1
          ) latest_review ON TRUE
          WHERE version.tenant_id = $1 AND version.site_id = $2 AND version.id = $3
          ${lock ? 'FOR UPDATE OF version, site' : ''}`
}

function assertApprovedAuthority(row: BuildAuthorityRow | null): BuildAuthorityRow {
  if (
    !row
    || !['draft', 'active'].includes(row.site_status)
    || !['approved', 'published'].includes(row.version_status)
    || row.review_decision !== 'approved'
  ) {
    throw new PageStudioBuildError(
      'BUILD_NOT_APPROVED',
      422,
      'Page Studio version is not approved for building'
    )
  }
  return row
}

function expectedMetadata(scope: { tenantId: string, clientId: string, siteId: string }, digest: string) {
  const artifactPrefix
    = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/builds/${digest}`
  return {
    artifactPrefix,
    buildId: `build_${digest.slice(0, 32)}`,
    manifestKey: `${artifactPrefix}/release-manifest.json`,
    validationKey: `${artifactPrefix}/validation-report.json`
  }
}

function assertWorkerResult(
  result: PageStudioWorkerBuildResult,
  expected: ReturnType<typeof expectedMetadata>,
  digest: string
): void {
  if (
    result.success !== true
    || result.buildId !== expected.buildId
    || result.versionDigest !== digest
    || result.artifactPrefix !== expected.artifactPrefix
    || result.manifestKey !== expected.manifestKey
    || result.validationKey !== expected.validationKey
    || !/^[a-f0-9]{64}$/.test(result.manifestDigest)
  ) {
    throw new PageStudioBuildError(
      'BUILD_RESULT_INVALID',
      502,
      'Page Studio build worker returned invalid metadata'
    )
  }
}

function buildPointer(
  scope: { tenantId: string, clientId: string, siteId: string },
  result: PageStudioWorkerBuildResult
) {
  return {
    artifactPrefix: result.artifactPrefix,
    buildId: result.buildId,
    manifestDigest: result.manifestDigest,
    manifestKey: result.manifestKey,
    scope,
    validationKey: result.validationKey,
    versionDigest: result.versionDigest
  }
}

async function persistSuccessfulBuild(
  input: PageStudioApprovedBuildInput,
  initial: BuildAuthorityRow,
  result: PageStudioWorkerBuildResult,
  runTransaction: RunTransaction
) {
  return runTransaction(async (db) => {
    const locked = await db.query<BuildAuthorityRow>(authoritySql(true), [
      input.tenantId, input.siteId, input.versionId
    ])
    const authority = assertApprovedAuthority(locked.rows[0] ?? null)
    if (authority.digest !== initial.digest || authority.approval_id !== initial.approval_id) {
      throw new PageStudioBuildError(
        'BUILD_NOT_APPROVED',
        422,
        'Page Studio approval changed during the build'
      )
    }
    const scope = { tenantId: input.tenantId, clientId: authority.client_id, siteId: input.siteId }
    const expected = expectedMetadata(scope, authority.digest)
    assertWorkerResult(result, expected, authority.digest)

    const existing = await db.query<BuildRow>(
      `SELECT id, version_digest, artifact_prefix, release_manifest_key,
              release_manifest_digest, validation_report_key, state
       FROM page_studio_builds
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3
         AND (id = $4 OR version_digest = $5)
       FOR UPDATE`,
      [scope.tenantId, scope.clientId, scope.siteId, expected.buildId, authority.digest]
    )
    const row = existing.rows[0]
    if (row && row.id !== expected.buildId) {
      throw new PageStudioBuildError(
        'BUILD_CONFLICT',
        409,
        'Page Studio version digest already belongs to another build'
      )
    }
    if (row?.state === 'succeeded') {
      if (
        row.version_digest !== authority.digest
        || row.artifact_prefix !== result.artifactPrefix
        || row.release_manifest_key !== result.manifestKey
        || row.release_manifest_digest !== result.manifestDigest
        || row.validation_report_key !== result.validationKey
      ) {
        throw new PageStudioBuildError(
          'BUILD_CONFLICT',
          409,
          'Page Studio build metadata conflicts with the immutable build'
        )
      }
      return buildPointer(scope, result)
    }

    if (row) {
      await db.query(
        `UPDATE page_studio_builds
         SET artifact_prefix = $5, release_manifest_key = $6,
             release_manifest_digest = $7, validation_report_key = $8,
             state = 'succeeded', failure_summary = NULL, completed_at = NOW()
         WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND id = $4`,
        [scope.tenantId, scope.clientId, scope.siteId, expected.buildId,
          result.artifactPrefix, result.manifestKey, result.manifestDigest, result.validationKey]
      )
    } else {
      await db.query<{ id: string }>(
        `INSERT INTO page_studio_builds (
           id, tenant_id, client_id, site_id, version_id, version_digest,
           artifact_prefix, release_manifest_key, release_manifest_digest,
           validation_report_key, state, idempotency_key, completed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'succeeded', $11, NOW())
         RETURNING id`,
        [expected.buildId, scope.tenantId, scope.clientId, scope.siteId, input.versionId,
          authority.digest, result.artifactPrefix, result.manifestKey, result.manifestDigest,
          result.validationKey, input.idempotencyKey]
      )
    }
    await db.query(
      `INSERT INTO page_studio_audit_events (
         tenant_id, client_id, site_id, actor_id, actor_role, action,
         resource_type, resource_id, idempotency_key, metadata
       ) VALUES ($1, $2, $3, $4, 'agency', 'build.succeeded',
         'build', $5, $6, $7::jsonb)
       ON CONFLICT DO NOTHING`,
      [scope.tenantId, scope.clientId, scope.siteId, input.actorId, expected.buildId,
        `build:succeeded:${expected.buildId}`,
        JSON.stringify({ approvalId: authority.approval_id, versionDigest: authority.digest })]
    )
    return buildPointer(scope, result)
  })
}

async function persistFailedBuild(
  input: PageStudioApprovedBuildInput,
  authority: BuildAuthorityRow,
  runTransaction: RunTransaction
): Promise<void> {
  await runTransaction(async (db) => {
    const locked = await db.query<BuildAuthorityRow>(authoritySql(true), [
      input.tenantId, input.siteId, input.versionId
    ])
    const current = locked.rows[0]
    if (
      !current
      || current.client_id !== authority.client_id
      || current.digest !== authority.digest
      || current.approval_id !== authority.approval_id
    ) return
    const scope = { tenantId: input.tenantId, clientId: current.client_id, siteId: input.siteId }
    const expected = expectedMetadata(scope, authority.digest)
    const existing = await db.query<{ id: string, state: string }>(
      `SELECT id, state FROM page_studio_builds
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3
         AND (id = $4 OR version_digest = $5)
       FOR UPDATE`,
      [scope.tenantId, scope.clientId, scope.siteId, expected.buildId, authority.digest]
    )
    if (existing.rows[0]?.state === 'succeeded') return
    if (existing.rows[0] && existing.rows[0].id !== expected.buildId) return
    const summary = 'Build worker rejected the approved version'
    if (existing.rows[0]) {
      await db.query(
        `UPDATE page_studio_builds
         SET state = 'failed', failure_summary = $5, completed_at = NOW()
         WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND id = $4`,
        [scope.tenantId, scope.clientId, scope.siteId, expected.buildId, summary]
      )
    } else {
      await db.query(
        `INSERT INTO page_studio_builds (
           id, tenant_id, client_id, site_id, version_id, version_digest,
           artifact_prefix, release_manifest_key, release_manifest_digest,
           validation_report_key, state, failure_summary, idempotency_key, completed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'failed', $11, $12, NOW())
         RETURNING id`,
        [expected.buildId, scope.tenantId, scope.clientId, scope.siteId, input.versionId,
          authority.digest, expected.artifactPrefix, expected.manifestKey, ZERO_DIGEST,
          expected.validationKey, summary, input.idempotencyKey]
      )
    }
    await db.query(
      `INSERT INTO page_studio_audit_events (
         tenant_id, client_id, site_id, actor_id, actor_role, action,
         resource_type, resource_id, idempotency_key, metadata
       ) VALUES ($1, $2, $3, $4, 'agency', 'build.failed',
         'build', $5, $6, $7::jsonb)
       ON CONFLICT DO NOTHING`,
      [scope.tenantId, scope.clientId, scope.siteId, input.actorId, expected.buildId,
        `build:failed:${input.idempotencyKey}`,
        JSON.stringify({ approvalId: authority.approval_id, versionDigest: authority.digest })]
    )
  })
}

export interface PageStudioApprovedBuildInput {
  actorId: string
  assets: PageStudioBuildAsset[]
  idempotencyKey: string
  manifest: unknown
  siteId: string
  tenantId: string
  versionId: string
}

export async function buildApprovedPageStudioVersion(
  input: PageStudioApprovedBuildInput,
  dependencies: {
    queryOne?: typeof queryOne
    runTransaction?: RunTransaction
    worker: PageStudioBuildWorker
  }
) {
  const readOne = dependencies.queryOne ?? queryOne
  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  const authority = assertApprovedAuthority(await readOne<BuildAuthorityRow>(
    authoritySql(false),
    [input.tenantId, input.siteId, input.versionId]
  ))
  const scope = { tenantId: input.tenantId, clientId: authority.client_id, siteId: input.siteId }
  try {
    const result = await dependencies.worker.build({
      approval: {
        approvalId: authority.approval_id,
        digest: authority.digest,
        status: 'approved',
        versionId: input.versionId
      },
      assets: input.assets,
      manifest: input.manifest,
      scope,
      versionDigest: authority.digest,
      versionId: input.versionId
    })
    return await persistSuccessfulBuild(input, authority, result, runTransaction)
  } catch (error) {
    if (error instanceof PageStudioBuildError) throw error
    await persistFailedBuild(input, authority, runTransaction)
    const validationFailure = error instanceof Error && error.name === 'ReleaseValidationError'
    throw validationFailure
      ? new PageStudioBuildError(
          'BUILD_VALIDATION_FAILED',
          422,
          'Page Studio build validation failed'
        )
      : new PageStudioBuildError(
          'BUILD_WORKER_UNAVAILABLE',
          503,
          'Page Studio build worker is unavailable'
        )
  }
}
