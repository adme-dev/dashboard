import { createError, getRouterParam, readBody, type H3Event } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
import { sameCodeContent } from '~~/shared/pageStudio/codeContent'
import { TemplatePreviewPointerSchema, templatePreviewHostname } from '~~/shared/pageStudio/templatePreview'
import { PageStudioTemplatePreviewSchema } from '~~/shared/pageStudio/templateCatalogue'
import { templateActorAuthorizer } from './templateCatalogueHttp'
import { guardTemplateMutation } from './templateRegistrationHttp'
import { requireSelectedTemplate, type TemplateActionPrincipal } from './templateActionAuthority'
import { requireAgencyPageStudioAccess } from './access'
import { preparePageStudioPublishPrincipal } from './publishHttp'
import { resolvePageStudioLoginSession, bindPageStudioLoginSession } from './loginSessions'
import { withPageStudioPublishAuthority } from './publishAuthority'
import { resolveAgencyTemplateTenant } from './templateCatalogueAuthority'
import type { TemplateActor } from './templateCatalogue'

export async function prepareTemplateAction(event: H3Event, kind: TemplateActor['kind'], write: boolean) {
  guardTemplateMutation(event)
  const reauthorize = templateActorAuthorizer(event, kind, write ? 'PAGE_STUDIO_EDIT' : 'PAGE_STUDIO_VIEW')
  const actor = await reauthorize()
  const principal: TemplateActionPrincipal = { actor }
  if (actor.kind === 'agency') {
    principal.login = await transactionWithoutRetry(async db => {
      const login = await resolvePageStudioLoginSession(db, event, 'agency', actor.userId)
      await bindPageStudioLoginSession(db, login)
      return login
    })
  }
  return { principal, env: event.context.cloudflare?.env ?? {}, reauthorize: async () => {
    if (!sameCodeContent(actor, await reauthorize())) throw createError({ statusCode: 403 })
  } }
}
export async function templatePreviewHandler(event: H3Event, kind: TemplateActor['kind']) {
  const versionId = z.string().uuid().parse(getRouterParam(event, 'versionId'))
  const context = await prepareTemplateAction(event, kind, false)
  await context.reauthorize()
  return transactionWithoutRetry(async db => {
    await requireSelectedTemplate(db, context.principal, versionId, context.env)
    const row = (await db.query<{ hostname: string }>('SELECT hostname FROM page_studio_template_previews WHERE version_id=$1', [versionId])).rows[0]
    if (!row || row.hostname !== templatePreviewHostname(versionId)) throw createError({ statusCode: 409, statusMessage: 'The template preview is being prepared.' })
    await requireSelectedTemplate(db, context.principal, versionId, context.env)
    return PageStudioTemplatePreviewSchema.parse({ versionId, url: `https://${row.hostname}/` })
  })
}
export async function publishTemplatePreviewHandler(event: H3Event) {
  guardTemplateMutation(event)
  const versionId = z.string().uuid().parse(getRouterParam(event, 'versionId'))
  const { snapshotId } = z.object({ snapshotId: z.string().uuid() }).strict().parse(await readBody(event))
  const authorize = templateActorAuthorizer(event, 'agency', 'PAGE_STUDIO_PUBLISH')
  const actor = await authorize()
  if (actor.kind !== 'agency') throw createError({ statusCode: 403 })
  const env = event.context.cloudflare?.env ?? {}
  const principal = await preparePageStudioPublishPrincipal(event, await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_PUBLISH'))
  const read = async (db: PageStudioQueryClient) => {
    if (await resolveAgencyTemplateTenant(env, async (sql, params) => (await db.query<{ tenant_id: string }>(sql.replace('LIMIT 1', 'LIMIT 1 FOR SHARE'), params)).rows) !== actor.tenantId) throw createError({ statusCode: 403 })
    const row = (await db.query<Record<string, unknown>>(`SELECT version.*,deployment.artifact_prefix,deployment.artifact_manifest_digest,
      deployment.code_content AS deployment_code_content FROM page_studio_template_versions version
      JOIN page_studio_template_entries entry ON entry.id=version.template_id
      JOIN page_studio_template_version_status state ON state.version_id=version.id
      JOIN page_studio_staging_deployments deployment ON deployment.id=$2 AND deployment.tenant_id=version.source_tenant_id
        AND deployment.client_id=version.source_client_id AND deployment.site_id=version.source_site_id
        AND deployment.checkpoint_id=version.source_checkpoint_id AND deployment.checkpoint_digest=version.source_digest AND deployment.state='succeeded'
      WHERE version.id=$1 AND entry.owner_tenant_id=$3 AND entry.withdrawn_at IS NULL AND state.withdrawn_at IS NULL
      FOR SHARE OF version,entry,state,deployment`, [versionId, snapshotId, actor.tenantId])).rows[0]
    if (!row || !sameCodeContent(row.code_content, row.deployment_code_content)) throw createError({ statusCode: 409 })
    const pointer = TemplatePreviewPointerSchema.parse({ kind: 'template-preview', versionId,
      scope: { tenantId: row.source_tenant_id, clientId: row.source_client_id, siteId: row.source_site_id },
      id: snapshotId, checkpointId: row.source_checkpoint_id, digest: row.source_digest,
      ...(row.code_content ? { codeContent: row.code_content } : {}), artifactPrefix: row.artifact_prefix, manifestDigest: row.artifact_manifest_digest })
    if (pointer.artifactPrefix !== `client-staging/tenants/${pointer.scope.tenantId}/clients/${pointer.scope.clientId}/sites/${pointer.scope.siteId}/snapshots/${snapshotId}`) throw createError({ statusCode: 409 })
    return pointer
  }
  const pointer = await transactionWithoutRetry(read)
  await withPageStudioPublishAuthority(pointer.scope, principal, read)
  const management = env.PAGE_STUDIO_MANAGEMENT as { verifyTemplateSnapshot?: (input: unknown) => Promise<unknown> } | undefined
  if (!management?.verifyTemplateSnapshot) throw createError({ statusCode: 503 })
  const verified = z.object({ verified: z.literal(true), manifestDigest: z.string(), codeContent: z.unknown().optional() }).strict().parse(await management.verifyTemplateSnapshot(pointer))
  if (verified.manifestDigest !== pointer.manifestDigest || !sameCodeContent(verified.codeContent, pointer.codeContent)) throw createError({ statusCode: 409 })
  const hostname = templatePreviewHostname(versionId)
  // Publication must not advertise a reserved name before actual DNS/TLS/routing.
  const response = await fetch(`https://${hostname}/.well-known/xeroflow-staging`, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
  let health = ''
  if (response.status === 200 && response.body) {
    const reader = response.body.getReader()
    let size = 0
    const decoder = new TextDecoder('utf-8', { fatal: true })
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 1024) throw createError({ statusCode: 503 })
        health += decoder.decode(chunk.value, { stream: true })
      }
      health += decoder.decode()
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  } else { await response.body?.cancel() }
  if (health.length > 1024 || !health) throw createError({ statusCode: 503, statusMessage: 'The template preview hostname is not ready.' })
  const receipt = z.object({ version: z.literal(1), service: z.literal('xeroflow-page-studio-client-staging'), hostname: z.literal(hostname) }).strict().safeParse(JSON.parse(health))
  if (!receipt.success) throw createError({ statusCode: 503 })
  return withPageStudioPublishAuthority(pointer.scope, principal, async db => {
    if (!sameCodeContent(await read(db), pointer) || !sameCodeContent(await authorize(), actor)) throw createError({ statusCode: 403 })
    await db.query(`INSERT INTO page_studio_template_previews(version_id,snapshot_id,hostname,artifact_prefix,manifest_digest,published_by)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(version_id) DO NOTHING`, [versionId,snapshotId,hostname,pointer.artifactPrefix,pointer.manifestDigest,actor.userId])
    const retained = (await db.query<{ snapshot_id: string, manifest_digest: string }>('SELECT snapshot_id,manifest_digest FROM page_studio_template_previews WHERE version_id=$1', [versionId])).rows[0]
    if (retained?.snapshot_id !== snapshotId || retained.manifest_digest !== pointer.manifestDigest) throw createError({ statusCode: 409 })
    return PageStudioTemplatePreviewSchema.parse({ versionId, url: `https://${hostname}/` })
  })
}
