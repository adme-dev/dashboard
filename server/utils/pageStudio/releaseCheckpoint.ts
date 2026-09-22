import { queryOne } from '~~/server/utils/db'
import {
  derivePageStudioReleaseMetadata,
  type PageStudioReleaseMetadata
} from '~~/server/utils/pageStudio/releaseMetadata'

import { loadPageStudioCheckpoint, PageStudioReleaseCheckpointError, type PageStudioCheckpointBucket, type PageStudioReleaseScope } from '~~/shared/pageStudio/checkpointReader'

export { loadPageStudioCheckpoint, PageStudioReleaseCheckpointError }
export type { PageStudioCheckpointBucket, PageStudioReleaseScope }

interface ApprovedCheckpointRow {
  version_id: string
  version_digest: string
  checkpoint_id: string
  checkpoint_digest: string
  object_key: string
}

export async function loadApprovedPageStudioReleaseCheckpoint(input: {
  scope: PageStudioReleaseScope
  versionId: string
  bucket: PageStudioCheckpointBucket
}): Promise<{
  checkpointId: string
  digest: string
  manifest: unknown
  releaseMetadata: PageStudioReleaseMetadata
}> {
  const row = await queryOne<ApprovedCheckpointRow>(`
    SELECT
      version.id AS version_id,
      version.digest AS version_digest,
      version.checkpoint_id,
      checkpoint.digest AS checkpoint_digest,
      checkpoint.object_key
    FROM page_studio_versions AS version
    INNER JOIN page_studio_checkpoints AS checkpoint
      ON checkpoint.tenant_id = version.tenant_id
     AND checkpoint.client_id = version.client_id
     AND checkpoint.site_id = version.site_id
     AND checkpoint.id = version.checkpoint_id
    WHERE version.tenant_id = $1
      AND version.client_id = $2
      AND version.site_id = $3
      AND version.id = $4
      AND EXISTS (
        SELECT 1
        FROM page_studio_reviews AS review
        WHERE review.tenant_id = version.tenant_id
          AND review.client_id = version.client_id
          AND review.site_id = version.site_id
          AND review.version_id = version.id
          AND review.version_digest = version.digest
          AND review.decision = 'approved'
      )
    LIMIT 1
  `, [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.versionId])

  if (!row) {
    throw new PageStudioReleaseCheckpointError('VERSION_NOT_APPROVED', 'The requested version does not have an approved immutable checkpoint', 409)
  }

  const checkpoint = await loadPageStudioCheckpoint({
    scope: input.scope,
    bucket: input.bucket,
    checkpointId: row.checkpoint_id,
    objectKey: row.object_key,
    digests: [row.checkpoint_digest, row.version_digest]
  })
  return { ...checkpoint, releaseMetadata: derivePageStudioReleaseMetadata(checkpoint.manifest) }
}

export async function attachPageStudioReleaseMetadataToBuild(input: {
  scope: PageStudioReleaseScope
  versionId: string
  buildId: string
  digest: string
  releaseMetadata: PageStudioReleaseMetadata
}) {
  const build = await queryOne<{ id: string }>(`
    UPDATE page_studio_builds
    SET release_metadata = $7::jsonb || CASE WHEN release_metadata ? 'featureSeal' THEN jsonb_build_object('featureSeal',release_metadata->'featureSeal') ELSE '{}'::jsonb END
    WHERE tenant_id = $1
      AND client_id = $2
      AND site_id = $3
      AND version_id = $4
      AND id = $5
      AND version_digest = $6
      AND state = 'succeeded'
    RETURNING id
  `, [
    input.scope.tenantId,
    input.scope.clientId,
    input.scope.siteId,
    input.versionId,
    input.buildId,
    input.digest,
    JSON.stringify(input.releaseMetadata)
  ])

  if (!build) {
    throw new PageStudioReleaseCheckpointError(
      'BUILD_METADATA_REJECTED',
      'Release metadata could not be attached to the succeeded approved build',
      409
    )
  }

  return build
}
