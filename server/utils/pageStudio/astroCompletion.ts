import { verifyAstroCompilerReleaseReceipt } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { isCurrentAstroSource, type reserveAstroReleaseBuild } from './astroBuilds'
import { PageStudioBuildError, readApprovedBuildAuthority } from './builds'
import { withPageStudioPublishAuthority, type PageStudioPublishPrincipal } from './publishAuthority'
import type { PageStudioBuildPointer } from './publishing'
import type { PageStudioReleaseMetadata } from './releaseMetadata'

type Reservation = Awaited<ReturnType<typeof reserveAstroReleaseBuild>>
type AuthorityDependencies = NonNullable<Parameters<typeof withPageStudioPublishAuthority>[3]>
interface RetainedRow {
  id: string
  build_identity: unknown
  build_identity_digest: string
  compiler_toolchain: unknown
  state: string
  receipt_matches: boolean
  astro_approval_id: string
}
const invalid = () => new PageStudioBuildError('BUILD_RESULT_INVALID', 502, 'Astro build verification did not match the reserved artifact')
const conflict = () => new PageStudioBuildError('BUILD_CONFLICT', 409, 'The retained Astro build already has a different result')

/** Complete only an existing reservation. policyDigest is selected from trusted
 * retained-generation configuration, never from HTTP or the compiler response.
 * Delivery verifies bytes outside SQL; the original login and approval are
 * checked again inside the completion transaction. Unknown RPC outcomes leave
 * the reservation recoverable and never enter legacy build admission. */
export async function completeAstroReleaseBuild(input: {
  reservation: Reservation
  receipt: unknown
  principal: PageStudioPublishPrincipal
  policyDigest: string
  releaseMetadata?: PageStudioReleaseMetadata
}, dependencies: AuthorityDependencies & {
  verifyBuild: (pointer: PageStudioBuildPointer) => Promise<unknown>
}): Promise<PageStudioBuildPointer> {
  const reservation = structuredClone(input.reservation), principal = structuredClone(input.principal)
  const releaseMetadata = input.releaseMetadata === undefined ? null : JSON.stringify(input.releaseMetadata)
  const retained = { context: { buildId: reservation.buildId, identity: reservation.identity, identityDigest: reservation.identityDigest },
    toolchain: reservation.toolchain, policyDigest: input.policyDigest }
  const receipt = await verifyAstroCompilerReleaseReceipt(input.receipt, retained).catch(() => {
    throw invalid()
  })
  const { scope, source } = receipt.astro.context.identity
  if (source.kind !== 'approved-version' || !source.checkpoint) throw invalid()
  const checkpointPin = source.checkpoint
  const pointer: PageStudioBuildPointer = { scope, buildId: receipt.buildId, versionDigest: receipt.versionDigest,
    artifactPrefix: receipt.artifactPrefix, manifestKey: receipt.manifestKey, manifestDigest: receipt.manifestDigest, astro: receipt.astro }
  const verified = await dependencies.verifyBuild(structuredClone(pointer)) as Partial<PageStudioBuildPointer> | null
  if (!verified || typeof verified !== 'object' || verified.scope?.tenantId !== scope.tenantId
    || verified.scope.clientId !== scope.clientId || verified.scope.siteId !== scope.siteId) throw invalid()
  const verifiedReceipt = await verifyAstroCompilerReleaseReceipt({
    success: true, renderer: 'astro', buildId: verified.buildId, versionDigest: verified.versionDigest,
    artifactPrefix: verified.artifactPrefix, manifestKey: verified.manifestKey, manifestDigest: verified.manifestDigest,
    astro: verified.astro, validationKey: receipt.validationKey
  }, retained).catch(() => { throw invalid() })
  // Both values have passed the same shared schema, so key order is normalized.
  if (JSON.stringify(verifiedReceipt) !== JSON.stringify(receipt)) throw invalid()

  return withPageStudioPublishAuthority(scope, principal, async (db) => {
    const authority = await readApprovedBuildAuthority(db, { tenantId: scope.tenantId, siteId: scope.siteId, versionId: source.versionId })
    if (authority.client_id !== scope.clientId || authority.digest !== source.versionDigest || authority.approval_id !== reservation.approvalId) {
      throw new PageStudioBuildError('BUILD_NOT_APPROVED', 422, 'Page Studio approval changed during the Astro build')
    }
    const checkpoint = (await db.query<{ digest: string }>(`SELECT checkpoint.digest FROM page_studio_versions version
      JOIN page_studio_checkpoints checkpoint ON checkpoint.id=version.checkpoint_id
        AND checkpoint.tenant_id=version.tenant_id AND checkpoint.client_id=version.client_id AND checkpoint.site_id=version.site_id
      WHERE version.tenant_id=$1 AND version.client_id=$2 AND version.site_id=$3 AND version.id=$4 AND checkpoint.id=$5
      FOR SHARE OF checkpoint`, [scope.tenantId, scope.clientId, scope.siteId, source.versionId, checkpointPin.id])).rows[0]
    if (checkpoint?.digest !== checkpointPin.digest) throw invalid()
    const row = (await db.query<RetainedRow>(`SELECT id,build_identity,build_identity_digest,compiler_toolchain,state,astro_approval_id,
        astro_release_receipt=$5::jsonb AS receipt_matches FROM page_studio_builds
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4 AND renderer='astro' FOR UPDATE`,
    [scope.tenantId, scope.clientId, scope.siteId, receipt.buildId, JSON.stringify(receipt)])).rows[0]
    if (!row || row.astro_approval_id !== reservation.approvalId) throw conflict()
    await verifyAstroCompilerReleaseReceipt(receipt, { context: { buildId: row.id, identity: row.build_identity, identityDigest: row.build_identity_digest },
      toolchain: row.compiler_toolchain, policyDigest: retained.policyDigest }).catch(() => { throw conflict() })
    if (row.state === 'succeeded') {
      if (!row.receipt_matches) throw conflict()
      return pointer
    }
    if (!['pending', 'failed'].includes(row.state)) throw conflict()
    if (!await isCurrentAstroSource(db, { scope, versionId: source.versionId, checkpointId: checkpointPin.id, digest: source.versionDigest })) {
      throw new PageStudioBuildError('BUILD_NOT_APPROVED', 422, 'The saved Page Studio source changed during the Astro build')
    }
    await db.query(`UPDATE page_studio_builds SET artifact_prefix=$5,release_manifest_key=$6,release_manifest_digest=$7,
      validation_report_key=$8,astro_release_receipt=$9::jsonb,state='succeeded',failure_summary=NULL,completed_at=clock_timestamp(),
      release_metadata=COALESCE($10::jsonb,release_metadata)
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4`,
    [scope.tenantId, scope.clientId, scope.siteId, receipt.buildId, receipt.artifactPrefix, receipt.manifestKey,
      receipt.manifestDigest, receipt.validationKey, JSON.stringify(receipt), releaseMetadata])
    await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,
      resource_type,resource_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,'agency','build.succeeded','build',$5,$6,$7::jsonb)`,
    [scope.tenantId, scope.clientId, scope.siteId, principal.actorId, receipt.buildId, `build:succeeded:${receipt.buildId}`,
      JSON.stringify({ approvalId: authority.approval_id, versionDigest: authority.digest, renderer: 'astro', identityDigest: reservation.identityDigest })])
    return pointer
  }, dependencies)
}
