import { z } from 'zod'
import { createAstroCompilerBuildIdentity, verifyAstroCompilerBuildIdentity } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { PageStudioBuildError, readApprovedBuildAuthority, type PageStudioBuildQueryClient } from './builds'

const Request = z.object({
  scope: z.object({ tenantId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/), clientId: z.uuid(), siteId: z.uuid() }).strict(),
  versionId: z.uuid(), environment: z.enum(['staging', 'production']),
  renderInputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  featureRecoveryDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  idempotencyKey: z.string().min(1).max(200)
}).strict()
interface RetainedBuild {
  id: string
  renderer: string
  build_identity: unknown
  build_identity_digest: string | null
  compiler_toolchain: unknown
  astro_approval_id: string
  astro_release_receipt: unknown
  state: string
}
const conflict = () => new PageStudioBuildError('BUILD_CONFLICT', 409, 'The retained compiler build does not match this request')

/** Caller holds the scoped site lock. New Astro work must still refer to the
 * current saved source; completed retries and historical rollback are exempt. */
export async function isCurrentAstroSource(db: PageStudioBuildQueryClient, input: {
  scope: { tenantId: string, clientId: string, siteId: string }
  versionId: string
  checkpointId: string
  digest: string
}): Promise<boolean> {
  const { scope } = input
  const result = await db.query(`SELECT version.id FROM page_studio_sites site
    JOIN page_studio_versions version ON version.tenant_id=site.tenant_id AND version.client_id=site.client_id
      AND version.site_id=site.id AND version.id=site.current_version_id
    JOIN page_studio_checkpoints checkpoint ON checkpoint.tenant_id=version.tenant_id AND checkpoint.client_id=version.client_id
      AND checkpoint.site_id=version.site_id AND checkpoint.id=version.checkpoint_id AND checkpoint.id=site.current_checkpoint_id
    WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3 AND version.id=$4
      AND checkpoint.id=$5 AND version.digest=$6 AND checkpoint.digest=$6`,
  [scope.tenantId, scope.clientId, scope.siteId, input.versionId, input.checkpointId, input.digest])
  return result.rows.length === 1
}

/** SQL-only reservation; caller owns this transaction and current actor access.
 * Materialization/recovery pins must come from verified native preparation, not
 * HTTP JSON. selectToolchain reads trusted local deployment configuration only;
 * no provider calls belong here. This method does not dispatch or publish.
 * Existing requests retain their selected toolchain across deployment rollouts. */
export async function reserveAstroReleaseBuild(
  db: PageStudioBuildQueryClient,
  raw: unknown,
  selectToolchain: () => unknown
) {
  const input = Request.parse(raw)
  const { scope } = input
  const authority = await readApprovedBuildAuthority(db, { tenantId: scope.tenantId, siteId: scope.siteId, versionId: input.versionId })
  if (authority.client_id !== scope.clientId) throw conflict()
  const checkpoint = (await db.query<{ id: string, digest: string }>(`SELECT checkpoint.id,checkpoint.digest
    FROM page_studio_versions version JOIN page_studio_checkpoints checkpoint
      ON checkpoint.tenant_id=version.tenant_id AND checkpoint.client_id=version.client_id
      AND checkpoint.site_id=version.site_id AND checkpoint.id=version.checkpoint_id
    WHERE version.tenant_id=$1 AND version.client_id=$2 AND version.site_id=$3 AND version.id=$4`,
  [scope.tenantId, scope.clientId, scope.siteId, input.versionId])).rows[0]
  if (!checkpoint || checkpoint.digest !== authority.digest || (input.featureRecoveryDigest === null && input.renderInputDigest !== authority.digest)) {
    throw new PageStudioBuildError('BUILD_NOT_APPROVED', 422, 'The compiler input does not match the approved version')
  }
  const identityInput = {
    scope, environment: input.environment,
    source: { kind: 'approved-version', versionId: input.versionId, versionDigest: authority.digest, checkpoint },
    renderInputDigest: input.renderInputDigest, featureRecoveryDigest: input.featureRecoveryDigest
  }
  const retained = (await db.query<RetainedBuild>(`SELECT id,renderer,build_identity,build_identity_digest,compiler_toolchain,state,astro_approval_id,astro_release_receipt
    FROM page_studio_builds WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND idempotency_key=$4 FOR UPDATE`,
  [scope.tenantId, scope.clientId, scope.siteId, input.idempotencyKey])).rows[0]
  if (retained && retained.renderer !== 'astro') throw conflict()
  if (retained && retained.astro_approval_id !== authority.approval_id) {
    throw new PageStudioBuildError('BUILD_NOT_APPROVED', 422, 'The original Astro build approval is no longer current')
  }
  // Snapshot configuration so mutation cannot change the descriptor persisted
  // after hashing. Existing requests never invoke current-toolchain selection.
  const toolchain = structuredClone(retained ? retained.compiler_toolchain : await selectToolchain())
  const expected = await createAstroCompilerBuildIdentity(identityInput, toolchain)
  if (retained) {
    const verified = await verifyAstroCompilerBuildIdentity({ buildId: retained.id, identityDigest: retained.build_identity_digest, identity: retained.build_identity }, toolchain)
    if (verified.identityDigest !== expected.identityDigest) throw conflict()
  } else {
    // Do not silently discard a new operation key for an already retained build.
    const duplicate = await db.query('SELECT id FROM page_studio_builds WHERE id=$1', [expected.buildId])
    if (duplicate.rows.length) throw conflict()
  }
  if (retained?.state !== 'succeeded' && !await isCurrentAstroSource(db, {
    scope, versionId: input.versionId, checkpointId: checkpoint.id, digest: authority.digest
  })) throw new PageStudioBuildError('BUILD_NOT_APPROVED', 422, 'The saved Page Studio source changed before the Astro build')
  // Entitlement is rechecked before receipt reuse. Quota and row creation are in
  // the same transaction; failure rolls both back. Staging snapshots never enter
  // this release-only table, so no deployment is counted a second time.
  try {
    await db.query('SELECT admit_page_studio_build($1,$2,$3,\'release\',$4)', [scope.tenantId, scope.clientId, scope.siteId, expected.buildId])
  } catch (error) {
    if (error instanceof Error && error.message === 'STUDIO_BUILD_LIMIT') throw new PageStudioBuildError('BUILD_LIMIT_REACHED', 429, 'The monthly website build allowance has been reached')
    if (error instanceof Error && error.message === 'STUDIO_BUILD_ACCESS') throw new PageStudioBuildError('BUILD_NOT_APPROVED', 403, 'Website build access is not active')
    throw error
  }
  if (!retained) {
    const prefix = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/astro/${input.environment}/${expected.buildId}`
    // A pending row carries no artifact proof. Completion must independently
    // verify the versioned artifact before installing its immutable location.
    await db.query(`INSERT INTO page_studio_builds(id,tenant_id,client_id,site_id,version_id,version_digest,
      artifact_prefix,release_manifest_key,release_manifest_digest,validation_report_key,state,idempotency_key,
      renderer,build_identity,build_identity_digest,compiler_toolchain,astro_approval_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,'astro',$12::jsonb,$13,$14::jsonb,$15)`,
    [expected.buildId, scope.tenantId, scope.clientId, scope.siteId, input.versionId, authority.digest,
      prefix, `${prefix}/astro-manifest.json`, '0'.repeat(64), `${prefix}/validation-report.json`, input.idempotencyKey,
      JSON.stringify(expected.identity), expected.identityDigest, JSON.stringify(toolchain), authority.approval_id])
  }
  return { ...expected, toolchain, approvalId: retained?.astro_approval_id ?? authority.approval_id,
    state: retained?.state ?? 'pending', receipt: retained?.astro_release_receipt ?? null }
}
