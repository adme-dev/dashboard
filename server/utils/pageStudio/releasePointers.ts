import { verifyAstroCompilerReleaseReceipt, type AstroCompilerReleaseReceipt } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import type { PageStudioBuildPointer, PageStudioPublishingScope, PageStudioReleasePointer } from './publishing'
import { PageStudioPublishingError } from './publishingError'

export interface PageStudioBuildPointerRow {
  artifact_prefix: string
  build_id: string
  manifest_digest: string
  manifest_key: string
  version_digest: string
  renderer?: string | null
  build_version_id?: string
  validation_report_key?: string
  build_identity?: unknown
  build_identity_digest?: string | null
  compiler_toolchain?: unknown
  astro_release_receipt?: unknown
}

const invalid = () => new PageStudioPublishingError('RELEASE_RECORD_INVALID', 500, 'Persisted Page Studio release metadata is invalid')

/** Read a retained receipt, never select a compiler or reconstruct an artifact.
 * Its policy was verified before immutable completion. Delivery independently
 * verifies stored bytes against that generation before activation/rollback. */
export async function mapPageStudioBuildPointer(
  scope: PageStudioPublishingScope,
  row: PageStudioBuildPointerRow
): Promise<PageStudioBuildPointer> {
  const pointer: PageStudioBuildPointer = {
    artifactPrefix: row.artifact_prefix,
    buildId: row.build_id,
    manifestDigest: row.manifest_digest,
    manifestKey: row.manifest_key,
    scope,
    versionDigest: row.version_digest
  }
  if (row.renderer === 'astro') {
    try {
      const receipt = await verifyAstroCompilerReleaseReceipt(row.astro_release_receipt, {
        context: { buildId: row.build_id, identity: row.build_identity, identityDigest: row.build_identity_digest },
        toolchain: row.compiler_toolchain,
        policyDigest: (row.astro_release_receipt as Partial<AstroCompilerReleaseReceipt> | null)?.astro?.policyDigest
      })
      const { identity } = receipt.astro.context
      if (identity.scope.tenantId !== scope.tenantId || identity.scope.clientId !== scope.clientId || identity.scope.siteId !== scope.siteId
        || identity.source.kind !== 'approved-version' || identity.source.versionId !== row.build_version_id
        || receipt.artifactPrefix !== row.artifact_prefix || receipt.manifestDigest !== row.manifest_digest
        || receipt.manifestKey !== row.manifest_key || receipt.versionDigest !== row.version_digest
        || receipt.validationKey !== row.validation_report_key) throw invalid()
      return { ...pointer, astro: receipt.astro }
    } catch { throw invalid() }
  }
  const prefix = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/builds/${row.version_digest}`
  if ((row.renderer != null && row.renderer !== 'legacy') || row.astro_release_receipt != null
    || row.build_identity != null || row.build_identity_digest != null || row.compiler_toolchain != null
    || !/^[a-f0-9]{64}$/.test(row.version_digest) || !/^[a-f0-9]{64}$/.test(row.manifest_digest)
    || row.build_id !== `build_${row.version_digest.slice(0, 32)}`
    || row.artifact_prefix !== prefix || row.manifest_key !== `${prefix}/release-manifest.json`) throw invalid()
  return pointer
}

export async function mapPageStudioReleasePointer(
  scope: PageStudioPublishingScope,
  row: PageStudioBuildPointerRow & { environment: PageStudioReleasePointer['environment'], release_id: string }
): Promise<PageStudioReleasePointer> {
  const pointer = await mapPageStudioBuildPointer(scope, row)
  if (!['preview', 'staging', 'production'].includes(row.environment)
    || (pointer.astro && row.environment !== 'preview' && pointer.astro.context.identity.environment !== row.environment)) throw invalid()
  return { ...pointer, environment: row.environment, releaseId: row.release_id }
}
