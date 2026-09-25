import { inspectionError as createError, type InspectionQuery } from './inspectionTypes'
import type { PageStudioLaunchState } from '../../../shared/pageStudio/launchReadiness'
import { PageStudioSavedPagesSchema } from '../../../shared/pageStudio/savedPages'
import { loadPageStudioCheckpoint, type PageStudioCheckpointBucket } from '../../../shared/pageStudio/checkpointReader'

interface LaunchRow {
  id: string
  tenant_id: string
  client_id: string
  name: string
  status: string
  checkpoint_id: string | null
  checkpoint_digest: string | null
  object_key: string | null
  version_id: string | null
  version_checkpoint_id: string | null
  version_digest: string | null
  version_status: string | null
  review_decision: string | null
  review_digest: string | null
  plan_key: string | null
  plan_status: string | null
  plan_current: boolean | null
  active_releases: PageStudioLaunchState['activeReleases']
}

// One scoped, uncached snapshot. A historical review or release is not evidence
// that the currently saved checkpoint is approved or that access remains active.
const stateSql = `
  SELECT site.id, site.tenant_id, site.client_id, site.name, site.status,
    site.current_checkpoint_id AS checkpoint_id, checkpoint.digest AS checkpoint_digest, checkpoint.object_key,
    version.id AS version_id, version.checkpoint_id AS version_checkpoint_id,
    version.digest AS version_digest, version.status AS version_status,
    review.decision AS review_decision, review.version_digest AS review_digest,
    entitlement.plan_key, entitlement.status AS plan_status,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', pointer.active_release_id, 'hostname', pointer.normalized_hostname,
      'activatedAt', pointer.updated_at) ORDER BY pointer.normalized_hostname)
      FROM page_studio_release_pointers pointer
      WHERE pointer.tenant_id = site.tenant_id AND pointer.client_id = site.client_id
        AND pointer.site_id = site.id AND pointer.environment = 'production'), '[]'::jsonb) AS active_releases,
    (client.is_active = TRUE AND entitlement.status IN ('trial', 'active') AND entitlement.effective_from <= clock_timestamp()
      AND (entitlement.effective_until IS NULL OR entitlement.effective_until > clock_timestamp())) AS plan_current
  FROM page_studio_sites site
  JOIN agency_clients client ON client.id = site.client_id
  LEFT JOIN page_studio_checkpoints checkpoint ON checkpoint.tenant_id = site.tenant_id
    AND checkpoint.client_id = site.client_id AND checkpoint.site_id = site.id AND checkpoint.id = site.current_checkpoint_id
  LEFT JOIN page_studio_versions version ON version.tenant_id = site.tenant_id
    AND version.client_id = site.client_id AND version.site_id = site.id AND version.id = site.current_version_id
  LEFT JOIN page_studio_entitlements entitlement ON entitlement.tenant_id = site.tenant_id
    AND entitlement.client_id = site.client_id AND entitlement.id = site.entitlement_id
  LEFT JOIN LATERAL (
    SELECT decision, version_digest FROM page_studio_reviews candidate
    WHERE candidate.tenant_id = site.tenant_id AND candidate.client_id = site.client_id
      AND candidate.site_id = site.id AND candidate.version_id = version.id
    ORDER BY candidate.decided_at DESC, candidate.id DESC LIMIT 1
  ) review ON TRUE
  WHERE site.tenant_id = $1 AND site.id = $2`

export async function readPageStudioLaunchState(input: {
  tenantId: string
  siteId: string
  bucket?: PageStudioCheckpointBucket
}, queryOneFresh: InspectionQuery): Promise<PageStudioLaunchState> {
  const row = await queryOneFresh<LaunchRow>(stateSql, [input.tenantId, input.siteId])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Website not found' })
  const content: PageStudioLaunchState['content'] = {
    status: row.checkpoint_id ? 'unavailable' : 'required', publicPages: null, publicForms: null, requiresSealedFeatures: null
  }
  if (row.checkpoint_id && row.checkpoint_digest && row.object_key && input.bucket) {
    try {
      const checkpoint = await loadPageStudioCheckpoint({
        scope: { tenantId: input.tenantId, clientId: row.client_id, siteId: input.siteId },
        bucket: input.bucket, checkpointId: row.checkpoint_id, objectKey: row.object_key, digests: [row.checkpoint_digest]
      })
      const parsed = PageStudioSavedPagesSchema.parse(checkpoint.manifest)
      content.requiresSealedFeatures = typeof checkpoint.manifest === 'object' && checkpoint.manifest !== null
        && (Object.hasOwn(checkpoint.manifest, 'builderApplication') || Object.hasOwn(checkpoint.manifest, 'builderLibrary'))
      const publicPages = parsed.pages.filter(page => ['public', 'hidden'].includes(page.visibility))
      content.status = publicPages.length ? 'ready' : 'required'
      content.publicPages = publicPages.length
      content.publicForms = publicPages.reduce((total, page) => total + page.forms.length, 0)
    } catch {
      // Do not return object keys, authored content or private storage diagnostics.
      content.status = 'unavailable'
    }
  }
  const latest = await queryOneFresh<LaunchRow>(stateSql, [input.tenantId, input.siteId])
  if (!latest || JSON.stringify(latest) !== JSON.stringify(row)) {
    throw createError({ statusCode: 409, statusMessage: 'Website state changed. Refresh before continuing.' })
  }
  const accessible = ['draft', 'active'].includes(row.status) && row.plan_current === true
  const approved = accessible && content.status === 'ready' && Boolean(row.version_id)
    && ['approved', 'published'].includes(row.version_status ?? '')
    && row.version_checkpoint_id === row.checkpoint_id
    && row.version_digest === row.checkpoint_digest
    && row.review_decision === 'approved' && row.review_digest === row.checkpoint_digest
  return {
    siteId: row.id, siteName: row.name, siteStatus: row.status,
    checkpointId: row.checkpoint_id, digest: row.checkpoint_digest,
    approvedVersionId: approved ? row.version_id : null,
    activeReleases: row.active_releases,
    content, plan: { status: accessible ? 'ready' as const : 'required' as const, key: row.plan_key },
    observedAt: new Date().toISOString()
  }
}
