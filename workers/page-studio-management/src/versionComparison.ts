import { inspectionError as createError, type InspectionQuery } from './inspectionTypes'
import { loadPageStudioCheckpoint, type PageStudioCheckpointBucket } from '../../../shared/pageStudio/checkpointReader'
import type { PageStudioVersionComparison } from '../../../shared/pageStudio/versionComparison'

interface LiveCheckpoint {
  releaseId: string
  hostname: string
  checkpointId: string
  digest: string
  checkpointDigest: string
  objectKey: string
}
interface ComparisonRow {
  site_id: string
  tenant_id: string
  client_id: string
  site_name: string
  version_id: string
  checkpoint_id: string
  digest: string
  checkpoint_digest: string
  object_key: string
  status: string
  summary: string
  author_id: string
  author_role: string
  created_at: string
  current_version_id: string | null
  current_checkpoint_id: string | null
  releases: LiveCheckpoint[]
}

const comparisonSql = `
 SELECT site.id AS site_id, site.tenant_id, site.client_id, site.name AS site_name,
   version.id AS version_id, version.checkpoint_id, version.digest,
   checkpoint.digest AS checkpoint_digest, checkpoint.object_key,
   version.status, version.summary, version.author_id, version.author_role, version.created_at,
   site.current_version_id, site.current_checkpoint_id,
   COALESCE((SELECT jsonb_agg(jsonb_build_object(
     'releaseId', pointer.active_release_id, 'hostname', pointer.normalized_hostname,
     'checkpointId', live_version.checkpoint_id, 'digest', build.version_digest,
     'checkpointDigest', live_checkpoint.digest, 'objectKey', live_checkpoint.object_key)
     ORDER BY pointer.normalized_hostname)
     FROM page_studio_release_pointers pointer
     LEFT JOIN page_studio_releases release ON release.tenant_id = pointer.tenant_id
       AND release.client_id = pointer.client_id AND release.site_id = pointer.site_id
       AND release.id = pointer.active_release_id AND release.environment = pointer.environment
     LEFT JOIN page_studio_builds build ON build.tenant_id = release.tenant_id
       AND build.client_id = release.client_id AND build.site_id = release.site_id AND build.id = release.build_id
       AND build.state = 'succeeded'
     LEFT JOIN page_studio_versions live_version ON live_version.tenant_id = build.tenant_id
       AND live_version.client_id = build.client_id AND live_version.site_id = build.site_id
       AND live_version.id = build.version_id AND live_version.digest = build.version_digest
     LEFT JOIN page_studio_checkpoints live_checkpoint ON live_checkpoint.tenant_id = live_version.tenant_id
       AND live_checkpoint.client_id = live_version.client_id AND live_checkpoint.site_id = live_version.site_id
       AND live_checkpoint.id = live_version.checkpoint_id
     WHERE pointer.tenant_id = site.tenant_id AND pointer.client_id = site.client_id
       AND pointer.site_id = site.id AND pointer.environment = 'production'), '[]'::jsonb) AS releases
 FROM page_studio_sites site
 JOIN page_studio_versions version ON version.tenant_id = site.tenant_id
   AND version.client_id = site.client_id AND version.site_id = site.id AND version.id = $3
 LEFT JOIN page_studio_checkpoints checkpoint ON checkpoint.tenant_id = version.tenant_id
   AND checkpoint.client_id = version.client_id AND checkpoint.site_id = version.site_id
   AND checkpoint.id = version.checkpoint_id
 WHERE site.tenant_id = $1 AND site.id = $2`

export async function readPageStudioVersionComparison(input: {
  tenantId: string
  siteId: string
  versionId: string
  releaseId?: string
  bucket?: PageStudioCheckpointBucket
}, queryOneFresh: InspectionQuery): Promise<PageStudioVersionComparison> {
  const params = [input.tenantId, input.siteId, input.versionId]
  const row = await queryOneFresh<ComparisonRow>(comparisonSql, params)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Website version not found' })
  const live = input.releaseId ? row.releases.find(item => item.releaseId === input.releaseId) : row.releases[0]
  if (input.releaseId && !live) throw createError({ statusCode: 404, statusMessage: 'Active website release not found' })
  if (!input.bucket) throw createError({ statusCode: 503, statusMessage: 'Saved website storage is unavailable' })
  const scope = { tenantId: input.tenantId, clientId: row.client_id, siteId: input.siteId }
  const [after, before] = await Promise.all([
    loadPageStudioCheckpoint({ scope, bucket: input.bucket, checkpointId: row.checkpoint_id, objectKey: row.object_key, digests: [row.digest, row.checkpoint_digest] }),
    live ? loadPageStudioCheckpoint({ scope, bucket: input.bucket, checkpointId: live.checkpointId, objectKey: live.objectKey, digests: [live.digest, live.checkpointDigest] }) : null
  ])
  const latest = await queryOneFresh<ComparisonRow>(comparisonSql, params)
  if (!latest || JSON.stringify(latest) !== JSON.stringify(row)) {
    throw createError({ statusCode: 409, statusMessage: 'Website changed while loading the comparison. Refresh and review again.' })
  }
  return {
    siteId: row.site_id, siteName: row.site_name,
    version: { id: row.version_id, checkpointId: after.checkpointId, digest: after.digest, status: row.status,
      summary: row.summary, authorId: row.author_id, authorRole: row.author_role, createdAt: row.created_at,
      current: row.current_version_id === row.version_id && row.current_checkpoint_id === row.checkpoint_id },
    live: live && before ? { releaseId: live.releaseId, hostname: live.hostname, checkpointId: before.checkpointId, digest: before.digest } : null,
    releases: row.releases.map(item => ({ releaseId: item.releaseId, hostname: item.hostname })),
    before: before?.manifest ?? null, after: after.manifest
  }
}
