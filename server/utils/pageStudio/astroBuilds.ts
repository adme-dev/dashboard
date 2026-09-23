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
  state: string
}
const conflict = () => new PageStudioBuildError('BUILD_CONFLICT', 409, 'The retained compiler build does not match this request')

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
  const retained = (await db.query<RetainedBuild>(`SELECT id,renderer,build_identity,build_identity_digest,compiler_toolchain,state
    FROM page_studio_builds WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND idempotency_key=$4 FOR UPDATE`,
  [scope.tenantId, scope.clientId, scope.siteId, input.idempotencyKey])).rows[0]
  if (retained && retained.renderer !== 'astro') throw conflict()
  // Snapshot configuration so mutation cannot change the descriptor persisted
  // after hashing. Existing requests never invoke current-toolchain selection.
  const toolchain = structuredClone(retained ? retained.compiler_toolchain : selectToolchain())
  const expected = await createAstroCompilerBuildIdentity(identityInput, toolchain)
  if (retained) {
    const verified = await verifyAstroCompilerBuildIdentity({ buildId: retained.id, identityDigest: retained.build_identity_digest, identity: retained.build_identity }, toolchain)
    if (verified.identityDigest !== expected.identityDigest) throw conflict()
  } else {
    // Do not silently discard a new operation key for an already retained build.
    const duplicate = await db.query('SELECT id FROM page_studio_builds WHERE id=$1', [expected.buildId])
    if (duplicate.rows.length) throw conflict()
  }
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
      renderer,build_identity,build_identity_digest,compiler_toolchain)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,'astro',$12::jsonb,$13,$14::jsonb)`,
    [expected.buildId, scope.tenantId, scope.clientId, scope.siteId, input.versionId, authority.digest,
      prefix, `${prefix}/astro-manifest.json`, '0'.repeat(64), `${prefix}/validation-report.json`, input.idempotencyKey,
      JSON.stringify(expected.identity), expected.identityDigest, JSON.stringify(toolchain)])
  }
  return { ...expected, toolchain, approvalId: authority.approval_id, state: retained?.state ?? 'pending' }
}
