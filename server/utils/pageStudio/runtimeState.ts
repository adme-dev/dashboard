import { queryOne, queryRows } from '~~/server/utils/db'
import { pageStudioRuntimeDraftHostname } from './delivery'
import type { PageStudioPublishingScope } from './publishing'
import type { PageStudioRuntimeState } from '~~/shared/pageStudio/runtimeState'

export type { PageStudioRuntimeState }

export async function readPageStudioRuntimeState(
  scope: PageStudioPublishingScope,
  env: Record<string, unknown> | undefined,
  dependencies: { queryOne?: typeof queryOne, queryRows?: typeof queryRows } = {}
): Promise<PageStudioRuntimeState> {
  const one = dependencies.queryOne ?? queryOne
  const rows = dependencies.queryRows ?? queryRows
  const site = await one<{ delivery_mode: 'static' | 'runtime', checkpoint_id: string | null, digest: string | null, saved_at: string | null }>(
    `SELECT site.delivery_mode, checkpoint.id AS checkpoint_id, checkpoint.digest, checkpoint.created_at AS saved_at
     FROM page_studio_sites site
     LEFT JOIN page_studio_checkpoints checkpoint
       ON checkpoint.tenant_id = site.tenant_id AND checkpoint.client_id = site.client_id
      AND checkpoint.site_id = site.id AND checkpoint.id = site.current_checkpoint_id
     WHERE site.tenant_id = $1 AND site.client_id = $2 AND site.id = $3`,
    [scope.tenantId, scope.clientId, scope.siteId]
  )
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Page Studio site not found' })

  const approved = await one<{ version_id: string, digest: string, checkpoint_id: string }>(
    `SELECT version.id AS version_id, version.digest, version.checkpoint_id
     FROM page_studio_versions version
     JOIN LATERAL (
       SELECT review.decision FROM page_studio_reviews review
       WHERE review.tenant_id = version.tenant_id AND review.client_id = version.client_id
         AND review.site_id = version.site_id AND review.version_id = version.id
         AND review.version_digest = version.digest
       ORDER BY review.decided_at DESC, review.id DESC LIMIT 1
     ) latest ON latest.decision = 'approved'
     WHERE version.tenant_id = $1 AND version.client_id = $2 AND version.site_id = $3
       AND version.status IN ('approved', 'published')
     ORDER BY version.created_at DESC LIMIT 1`,
    [scope.tenantId, scope.clientId, scope.siteId]
  )

  const releases = await rows<{
    release_id: string
    hostname: string
    published_at: string
    version_id: string
    version_digest: string
    renderer: string
    active: boolean
  }>(
    `SELECT release.id AS release_id, release.normalized_hostname AS hostname, release.published_at,
            release.runtime_version_id AS version_id, release.runtime_version_digest AS version_digest,
            release.runtime_release->'renderer'->>'generation' AS renderer,
            (pointer.active_release_id = release.id) AS active
     FROM page_studio_releases release
     LEFT JOIN page_studio_release_pointers pointer
       ON pointer.tenant_id = release.tenant_id AND pointer.client_id = release.client_id
      AND pointer.site_id = release.site_id AND pointer.environment = release.environment
      AND pointer.normalized_hostname = release.normalized_hostname
     WHERE release.tenant_id = $1 AND release.client_id = $2 AND release.site_id = $3
       AND release.environment = 'production' AND release.runtime_release IS NOT NULL
     ORDER BY release.published_at DESC LIMIT 20`,
    [scope.tenantId, scope.clientId, scope.siteId]
  )

  const suffix = typeof env?.PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME === 'string' ? env.PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME : ''
  const mapped = releases.map(release => ({
    active: Boolean(release.active),
    hostname: release.hostname,
    publishedAt: new Date(release.published_at).toISOString(),
    releaseId: release.release_id,
    renderer: release.renderer,
    versionDigest: release.version_digest,
    versionId: release.version_id
  }))
  const live = mapped.find(release => release.active)
  return {
    approved: approved
      ? { checkpointId: approved.checkpoint_id, digest: approved.digest, versionId: approved.version_id, live: live?.versionId === approved.version_id }
      : null,
    deliveryMode: site.delivery_mode,
    draft: site.checkpoint_id && site.digest && site.saved_at
      ? {
          checkpointId: site.checkpoint_id,
          digest: site.digest,
          previewHostname: suffix ? pageStudioRuntimeDraftHostname(scope.siteId, suffix) : null,
          savedAt: new Date(site.saved_at).toISOString()
        }
      : null,
    releases: mapped,
    rendererConfigured: typeof env?.PAGE_STUDIO_RUNTIME_RENDERER === 'string' && env.PAGE_STUDIO_RUNTIME_RENDERER.length > 0
  }
}
