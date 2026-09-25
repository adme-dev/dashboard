import { z } from 'zod'
import { verifyAstroCompilerBuildIdentity, type AstroCompilerBuildIdentity, type NativeAstroCompilerGeneration } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { reserveAstroReleaseBuild } from './astroBuilds'
import { completeAstroReleaseBuild } from './astroCompletion'
import { PageStudioBuildError, readApprovedBuildAuthority, type PageStudioBuildWorker } from './builds'
import { withPageStudioPublishAuthority, type PageStudioPublishPrincipal } from './publishAuthority'
import type { PageStudioBuildPointer, PageStudioPublishingScope } from './publishing'
import type { loadApprovedPageStudioReleaseCheckpoint } from './releaseCheckpoint'

const Request = z.object({
  scope: z.object({ tenantId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/), clientId: z.uuid(), siteId: z.uuid() }).strict(),
  versionId: z.uuid(), environment: z.enum(['staging', 'production']), idempotencyKey: z.string().min(1).max(200)
}).strict()
type BuildRequest = Parameters<PageStudioBuildWorker['build']>[0]
export interface AstroBuildServices {
  selectGeneration(environment: 'staging' | 'production', retainedDigest?: string): Promise<NativeAstroCompilerGeneration>
  loadCheckpoint(input: { scope: PageStudioPublishingScope, versionId: string }): ReturnType<typeof loadApprovedPageStudioReleaseCheckpoint>
  buildAstroApproved(input: { context: AstroCompilerBuildIdentity, request: BuildRequest }): Promise<unknown>
  verifyBuild(pointer: PageStudioBuildPointer): Promise<unknown>
}
type Dependencies = NonNullable<Parameters<typeof withPageStudioPublishAuthority>[3]> & { recoverCandidate?: boolean }

/** Reserve once, dispatch through the retained private generation, verify bytes,
 * then complete under fresh authority. Completed retries skip source storage
 * and compilation entirely. A lost RPC response leaves the same pending build
 * available for durable compiler recovery; it never persists a legacy failure. */
export async function coordinateApprovedAstroBuild(
  raw: unknown,
  originalPrincipal: PageStudioPublishPrincipal,
  services: AstroBuildServices,
  dependencies: Dependencies = {}
): Promise<PageStudioBuildPointer> {
  const input = Request.parse(raw), principal = structuredClone(originalPrincipal)
  const reservation = await withPageStudioPublishAuthority(input.scope, principal, async (db) => {
    const approved = await readApprovedBuildAuthority(db, { tenantId: input.scope.tenantId, siteId: input.scope.siteId, versionId: input.versionId })
    // Review is resumable across dialogs, browser reloads and users. Resolve the
    // retained operation under the same site lock; reservation still verifies
    // its original approval, checkpoint, environment and compiler generation.
    const previous = dependencies.recoverCandidate
      ? (await db.query<{ idempotency_key: string }>(
          `SELECT idempotency_key FROM page_studio_builds WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3
        AND version_id=$4 AND version_digest=$5 AND renderer='astro' AND build_identity->>'environment'=$6
        AND build_identity->'featureRecoveryDigest'='null'::jsonb
       ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,
          [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.versionId, approved.digest, input.environment])).rows[0]
      : null
    return reserveAstroReleaseBuild(db, { ...input, idempotencyKey: previous?.idempotency_key ?? input.idempotencyKey, renderInputDigest: approved.digest, featureRecoveryDigest: null }, async () => {
      // Trusted local configuration only: no Worker I/O while holding SQL locks.
      const selected = await services.selectGeneration(input.environment)
      if (selected.environment !== input.environment) throw new PageStudioBuildError('BUILD_WORKER_UNAVAILABLE', 503, 'Astro compiler environment mismatch')
      return selected.toolchain
    })
  }, dependencies)
  const context = { buildId: reservation.buildId, identity: reservation.identity, identityDigest: reservation.identityDigest }
  const generation = await services.selectGeneration(input.environment, context.identity.toolchainDigest)
  if (generation.environment !== input.environment || generation.toolchainDigest !== context.identity.toolchainDigest) {
    throw new PageStudioBuildError('BUILD_WORKER_UNAVAILABLE', 503, 'Retained Astro compiler generation unavailable')
  }
  await verifyAstroCompilerBuildIdentity(context, generation.toolchain)
  const complete = (receipt: unknown, releaseMetadata?: Awaited<ReturnType<AstroBuildServices['loadCheckpoint']>>['releaseMetadata']) =>
    completeAstroReleaseBuild({ reservation, receipt, principal, policyDigest: generation.policyDigest, releaseMetadata },
      { ...dependencies, verifyBuild: pointer => services.verifyBuild(pointer) })
  if (reservation.state === 'succeeded') return complete(reservation.receipt)

  const checkpoint = await services.loadCheckpoint({ scope: input.scope, versionId: input.versionId })
  const source = context.identity.source
  if (source.kind !== 'approved-version' || source.checkpoint?.id !== checkpoint.checkpointId
    || source.checkpoint.digest !== checkpoint.digest || source.versionDigest !== checkpoint.digest) {
    throw new PageStudioBuildError('BUILD_NOT_APPROVED', 422, 'The approved Astro checkpoint changed before dispatch')
  }
  const receipt = await services.buildAstroApproved({ context, request: {
    scope: input.scope, versionId: input.versionId, versionDigest: source.versionDigest,
    approval: { approvalId: reservation.approvalId, digest: source.versionDigest, versionId: input.versionId, status: 'approved' },
    manifest: checkpoint.manifest, assets: []
  } })
  return complete(receipt, checkpoint.releaseMetadata)
}
