import { createError, getRouterParam, readBody, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { queryRowsFresh } from '~~/server/utils/db'
import { sameCodeContent } from '~~/shared/pageStudio/codeContent'
import { templateActorAuthorizer } from './templateCatalogueHttp'
import { guardTemplateMutation } from './templateRegistrationHttp'
import { readTemplateSources } from './templateSources'
import { requireAgencyPageStudioAccess } from './access'
import { preparePageStudioPublishPrincipal } from './publishHttp'
import { withPageStudioPublishAuthority } from './publishAuthority'
import { resolveAgencyTemplateTenant } from './templateCatalogueAuthority'

const Input = z.object({ requestId: z.string().uuid(), expectedAvailable: z.boolean(), available: z.boolean() }).strict()
const denied = () => createError({ statusCode: 403, statusMessage: 'Template publication is unavailable.' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Template availability changed. Refresh before trying again.' })
interface Version { template_id: string, source_tenant_id: string, source_client_id: string, source_site_id: string, slug: string, available: boolean, withdrawn: boolean }
/** Explicit catalogue publication only; registration and immutable preview
 * publication never automatically grant platform-wide access. */
export async function templateAvailabilityHandler(event: H3Event, writing: boolean) {
  setHeader(event, 'Cache-Control', 'private, no-store')
  if (writing) guardTemplateMutation(event)
  const versionId = z.string().uuid().parse(getRouterParam(event, 'versionId'))
  const input = writing ? Input.parse(await readBody(event)) : null
  const authorize = templateActorAuthorizer(event, 'agency', 'PAGE_STUDIO_PUBLISH')
  const actor = await authorize()
  if (actor.kind !== 'agency') throw denied()
  const env = event.context.cloudflare?.env ?? {}
  const approved = readTemplateSources(env)
  const scopeRows = await queryRowsFresh<Version>(`SELECT version.source_tenant_id,version.source_client_id,version.source_site_id
    FROM page_studio_template_versions version JOIN page_studio_template_entries entry ON entry.id=version.template_id
    WHERE version.id=$1 AND entry.owner_tenant_id=$2 AND version.source_tenant_id=$2`, [versionId, actor.tenantId])
  if (scopeRows.length !== 1) throw denied()
  const row = scopeRows[0]!
  const scope = { tenantId: row.source_tenant_id, clientId: row.source_client_id, siteId: row.source_site_id }
  const principal = await preparePageStudioPublishPrincipal(event, await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_PUBLISH'))
  return withPageStudioPublishAuthority(scope, principal, async (db) => {
    if (await resolveAgencyTemplateTenant(env, async (sql, params) => (await db.query<{ tenant_id: string }>(sql.replace('LIMIT 1', 'LIMIT 1 FOR SHARE'), params)).rows) !== actor.tenantId
      || !sameCodeContent(await authorize(), actor)) throw denied()
    const versions = (await db.query<Version>(`SELECT version.template_id,version.source_tenant_id,version.source_client_id,version.source_site_id,entry.slug,(state.withdrawn_at IS NOT NULL) AS withdrawn,
      (entry.visibility='published-eligible' AND state.published_eligible=TRUE AND state.withdrawn_at IS NULL
        AND EXISTS(SELECT 1 FROM page_studio_template_previews preview WHERE preview.version_id=version.id)
        AND EXISTS(SELECT 1 FROM page_studio_template_grants grant_record WHERE grant_record.template_id=entry.id
          AND grant_record.audience='published-page-studio' AND grant_record.revoked_at IS NULL
          AND grant_record.effective_from<=clock_timestamp() AND (grant_record.expires_at IS NULL OR grant_record.expires_at>clock_timestamp()))) AS available
      FROM page_studio_template_versions version JOIN page_studio_template_entries entry ON entry.id=version.template_id
      JOIN page_studio_template_version_status state ON state.version_id=version.id
      WHERE version.id=$1 AND entry.owner_tenant_id=$2 AND entry.withdrawn_at IS NULL
      FOR UPDATE OF entry,state FOR SHARE OF version`, [versionId, actor.tenantId])).rows
    const current = versions[0]
    if (versions.length !== 1 || !current || current.source_tenant_id !== scope.tenantId || current.source_client_id !== scope.clientId
      || current.source_site_id !== scope.siteId || !approved.some(source => source.siteId === scope.siteId && source.slug === current.slug)) throw denied()
    await db.query('SELECT id FROM page_studio_template_grants WHERE template_id=$1 FOR UPDATE', [current.template_id])
    const previewPublished = (await db.query('SELECT version_id FROM page_studio_template_previews WHERE version_id=$1 FOR SHARE', [versionId])).rows.length === 1
    if (!input) return { versionId, available: current.available, withdrawn: current.withdrawn, previewPublished, replayed: false }
    const audit = (await db.query<{ actor_id: string, metadata: unknown }>(`SELECT actor_id,metadata FROM page_studio_audit_events
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND idempotency_key=$4`,
    [scope.tenantId, scope.clientId, scope.siteId, `template-availability:${input.requestId}`])).rows
    if (audit.length) {
      if (audit.length !== 1 || audit[0]!.actor_id !== actor.userId || !sameCodeContent(audit[0]!.metadata, { versionId, ...input })) throw conflict()
      return { versionId, available: current.available, withdrawn: current.withdrawn, previewPublished, replayed: true }
    }
    if (!previewPublished) throw conflict()
    if (current.available !== input.expectedAvailable) throw conflict()
    if (input.available) {
      if (!(await db.query('SELECT version_id FROM page_studio_template_previews WHERE version_id=$1 FOR SHARE', [versionId])).rows.length) throw conflict()
      await db.query('UPDATE page_studio_template_version_status SET published_eligible=TRUE,withdrawn_at=NULL WHERE version_id=$1', [versionId])
      await db.query('UPDATE page_studio_template_entries SET visibility=\'published-eligible\' WHERE id=$1', [current.template_id])
      await db.query(`INSERT INTO page_studio_template_grants(template_id,audience)
        SELECT $1,'published-page-studio' WHERE NOT EXISTS(SELECT 1 FROM page_studio_template_grants
          WHERE template_id=$1 AND audience='published-page-studio' AND revoked_at IS NULL
            AND effective_from<=clock_timestamp() AND (expires_at IS NULL OR expires_at>clock_timestamp()))`, [current.template_id])
    } else {
      // Withdraw this version from new selections, including previous private grants.
      // Destination-owned copies do not depend on version catalogue visibility.
      await db.query('UPDATE page_studio_template_version_status SET published_eligible=FALSE,withdrawn_at=clock_timestamp() WHERE version_id=$1', [versionId])
      const other = (await db.query(`SELECT version.id FROM page_studio_template_versions version JOIN page_studio_template_version_status state ON state.version_id=version.id
        WHERE version.template_id=$1 AND state.published_eligible=TRUE AND state.withdrawn_at IS NULL`, [current.template_id])).rows
      if (!other.length) {
        await db.query('UPDATE page_studio_template_entries SET visibility=\'private\' WHERE id=$1', [current.template_id])
        await db.query('UPDATE page_studio_template_grants SET revoked_at=clock_timestamp() WHERE template_id=$1 AND audience=\'published-page-studio\' AND revoked_at IS NULL', [current.template_id])
      }
    }
    await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
      VALUES($1,$2,$3,$4,'agency','template.availability_changed','template_version',$5,$6,$7::jsonb)`,
    [scope.tenantId, scope.clientId, scope.siteId, actor.userId, versionId, `template-availability:${input.requestId}`, JSON.stringify({ versionId, ...input })])
    if (!sameCodeContent(await authorize(), actor)) throw denied()
    return { versionId, available: input.available, withdrawn: !input.available, previewPublished, replayed: false }
  })
}
