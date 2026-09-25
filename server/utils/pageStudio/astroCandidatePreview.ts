import { z } from 'zod'
import { isCurrentAstroSource } from './astroBuilds'
import { PageStudioHostnameSchema } from './delivery'
import { readApprovedBuildAuthority } from './builds'
import { withPageStudioPublishAuthority, type PageStudioPublishPrincipal } from './publishAuthority'
import { getPageStudioBuildPointer, type PageStudioBuildPointer } from './publishing'
import { PageStudioPublishingError } from './publishingError'

const Request = z.object({
  scope: z.object({ tenantId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/), clientId: z.uuid(), siteId: z.uuid() }).strict(),
  versionId: z.uuid(), buildId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
  environment: z.enum(['staging', 'production']), previewHostname: PageStudioHostnameSchema
}).strict()
type Dependencies = NonNullable<Parameters<typeof withPageStudioPublishAuthority>[3]>
  & NonNullable<Parameters<typeof getPageStudioBuildPointer>[2]>
  & { verifyBuild(pointer: PageStudioBuildPointer): Promise<unknown> }
const invalid = () => new PageStudioPublishingError('BUILD_NOT_PUBLISHABLE', 422, 'The approved Astro candidate is unavailable for review')
const conflict = () => new PageStudioPublishingError('RELEASE_POINTER_CONFLICT', 409, 'The candidate preview address already refers to another release')

/** Register a separate, immutable review address for the target-environment build.
 * No source reads, compiler dispatch, quota admission or production activation.
 * previewHostname is deployment configuration, never an HTTP body parameter.
 * Artifact verification precedes a fresh SQL-only publishing authority check. */
export async function registerAstroCandidatePreview(
  raw: unknown,
  originalPrincipal: PageStudioPublishPrincipal,
  dependencies: Dependencies
) {
  const input = Request.parse(raw), principal = structuredClone(originalPrincipal)
  const build = await getPageStudioBuildPointer(input.scope, input.buildId, dependencies)
  const context = build?.astro?.context
  if (!build || !context || context.identity.environment !== input.environment
    || context.identity.source.kind !== 'approved-version'
    || context.identity.source.versionId !== input.versionId || !context.identity.source.checkpoint) throw invalid()
  const checkpoint = context.identity.source.checkpoint
  // Full SHA-256 identity in one DNS label, without truncating or relabelling it.
  const hostname = PageStudioHostnameSchema.parse(`build-${BigInt(`0x${context.identityDigest}`).toString(36).padStart(50, '0')}.${input.previewHostname}`)
  await dependencies.verifyBuild(structuredClone(build))
  return withPageStudioPublishAuthority(input.scope, principal, async (db) => {
    const approved = await readApprovedBuildAuthority(db, { tenantId: input.scope.tenantId, siteId: input.scope.siteId, versionId: input.versionId })
    const params = [input.scope.tenantId, input.scope.clientId, input.scope.siteId, build.buildId]
    const retained = (await db.query<{ astro_approval_id: string, checkpoint_id: string, checkpoint_digest: string }>(
      `SELECT build.astro_approval_id,version.checkpoint_id,checkpoint.digest AS checkpoint_digest
       FROM page_studio_builds build
       JOIN page_studio_versions version ON version.tenant_id=build.tenant_id AND version.client_id=build.client_id
         AND version.site_id=build.site_id AND version.id=build.version_id
       JOIN page_studio_checkpoints checkpoint ON checkpoint.tenant_id=version.tenant_id AND checkpoint.client_id=version.client_id
         AND checkpoint.site_id=version.site_id AND checkpoint.id=version.checkpoint_id
       WHERE build.tenant_id=$1 AND build.client_id=$2 AND build.site_id=$3 AND build.id=$4
         AND build.state='succeeded' AND build.renderer='astro'
       FOR SHARE OF build,checkpoint`, params)).rows[0]
    if (!retained || approved.client_id !== input.scope.clientId || approved.digest !== build.versionDigest
      || retained.astro_approval_id !== approved.approval_id || retained.checkpoint_id !== checkpoint.id
      || retained.checkpoint_digest !== checkpoint.digest) throw invalid()

    // Serializes the hostname globally as well as the scoped site lock acquired
    // by publish authority. A collision is rejected, never an upsert/repoint.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`page-studio-release:preview:${hostname}`])
    const existing = (await db.query<{ tenant_id: string, client_id: string, site_id: string, build_id: string, release_id: string }>(
      `SELECT pointer.tenant_id,pointer.client_id,pointer.site_id,release.build_id,release.id AS release_id
       FROM page_studio_release_pointers pointer JOIN page_studio_releases release
         ON release.tenant_id=pointer.tenant_id AND release.client_id=pointer.client_id AND release.site_id=pointer.site_id
         AND release.id=pointer.active_release_id AND release.environment=pointer.environment
         AND release.normalized_hostname=pointer.normalized_hostname
       WHERE pointer.environment='preview' AND pointer.normalized_hostname=$1 FOR UPDATE OF pointer`, [hostname])).rows[0]
    if (existing) {
      if (existing.tenant_id !== input.scope.tenantId || existing.client_id !== input.scope.clientId
        || existing.site_id !== input.scope.siteId || existing.build_id !== build.buildId) throw conflict()
      return { hostname, release: { ...build, environment: 'preview' as const, releaseId: existing.release_id } }
    }
    if (!await isCurrentAstroSource(db, { scope: input.scope, versionId: input.versionId, checkpointId: checkpoint.id, digest: build.versionDigest })) throw invalid()
    const release = (await db.query<{ id: string }>(`INSERT INTO page_studio_releases
      (tenant_id,client_id,site_id,build_id,environment,normalized_hostname,published_by,idempotency_key)
      VALUES($1,$2,$3,$4,'preview',$5,$6,$7) RETURNING id`,
    [...params, hostname, principal.actorId, `astro-preview:${context.identityDigest}:${hostname}`])).rows[0]
    if (!release) throw conflict()
    await db.query(`INSERT INTO page_studio_release_pointers
      (tenant_id,client_id,site_id,environment,normalized_hostname,active_release_id,updated_by)
      VALUES($1,$2,$3,'preview',$4,$5,$6)`, [...params.slice(0, 3), hostname, release.id, principal.actorId])
    await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,
      resource_type,resource_id,idempotency_key,metadata)
      VALUES($1,$2,$3,$4,'agency','release.preview_registered','release',$5,$6,$7::jsonb)`,
    [...params.slice(0, 3), principal.actorId, release.id, `astro-preview:${release.id}`,
      JSON.stringify({ buildId: build.buildId, hostname, environment: input.environment, manifestDigest: build.manifestDigest })])
    return { hostname, release: { ...build, environment: 'preview' as const, releaseId: release.id } }
  }, dependencies)
}
