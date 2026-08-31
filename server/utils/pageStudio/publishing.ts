import { queryOne } from '~~/server/utils/db'

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

export class PageStudioPublishingError extends Error {
  constructor(
    readonly code: 'RELEASE_RECORD_INVALID',
    readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'PageStudioPublishingError'
  }
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
  if (!row) return null
  return {
    ...mapBuildPointer(scope, row),
    environment: row.environment,
    releaseId: row.release_id
  }
}
