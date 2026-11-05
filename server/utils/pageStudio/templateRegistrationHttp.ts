import { createError, getHeader, getRequestURL, readBody, setHeader, type H3Event } from 'h3'
import { queryRowsFresh } from '~~/server/utils/db'
import type { PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import { requireAgencyPageStudioAccess } from './access'
import { resolveAgencyTemplateTenant } from './templateCatalogueAuthority'
import { templateActorAuthorizer } from './templateCatalogueHttp'
import { registerTemplateVersion, type RegisterTemplateVersionInput } from './templateRegistration'
import { preparePageStudioPublishPrincipal } from './publishHttp'
import { withPageStudioPublishAuthority } from './publishAuthority'
import { readTemplateSources } from './templateSources'

export function guardTemplateMutation(event: H3Event) {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const origin = getHeader(event, 'origin')
  if (!origin || origin !== getRequestURL(event).origin || getHeader(event, 'sec-fetch-site') === 'cross-site') throw createError({ statusCode: 403 })
}
export async function templateRegistrationHandler(event: H3Event) {
  guardTemplateMutation(event)
  const authorize = templateActorAuthorizer(event, 'agency', 'PAGE_STUDIO_PUBLISH')
  const actor = await authorize()
  if (actor.kind !== 'agency') throw createError({ statusCode: 403 })
  const input = await readBody<RegisterTemplateVersionInput>(event)
  const env = event.context.cloudflare?.env ?? {}
  let approved: ReturnType<typeof readTemplateSources>
  try { approved = readTemplateSources(env) } catch { throw createError({ statusCode: 503, statusMessage: 'Template source approval is unavailable.' }) }
  if (!approved.some(source => source.siteId === input?.sourceSiteId && source.slug === input?.slug)) throw createError({ statusCode: 403 })
  const bucket = env.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket | undefined
  if (!bucket || typeof bucket.get !== 'function') throw createError({ statusCode: 503 })
  const access = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_PUBLISH')
  const principal = await preparePageStudioPublishPrincipal(event, access)
  const rows = await queryRowsFresh<{ client_id: string }>('SELECT client_id FROM page_studio_sites WHERE tenant_id=$1 AND id=$2', [actor.tenantId, input.sourceSiteId])
  if (rows.length !== 1) throw createError({ statusCode: 404 })
  const scope = { tenantId: actor.tenantId, clientId: rows[0]!.client_id, siteId: input.sourceSiteId }
  return registerTemplateVersion(actor, input, {
    bucket,
    runTransaction: work => withPageStudioPublishAuthority(scope, principal, async db => {
      const result = await work(db)
      // The approved source account receives private catalogue access. Never
      // restore a revoked/expired grant on an idempotent registration retry.
      if (result && typeof result === 'object' && 'templateId' in result && 'versionId' in result) {
        await db.query(`INSERT INTO page_studio_template_grants(template_id,audience,tenant_id,client_id)
          SELECT $1,'portal-client',$2,$3 WHERE NOT EXISTS(SELECT 1 FROM page_studio_template_grants
            WHERE template_id=$1 AND audience='portal-client' AND tenant_id=$2 AND client_id=$3)`,
        [result.templateId, scope.tenantId, scope.clientId])
      }
      return result
    }),
    authorize: async ({ db }) => {
      const bound = await resolveAgencyTemplateTenant(env, async (sql, params) => (await db.query<{ tenant_id: string }>(sql.replace('LIMIT 1', 'LIMIT 1 FOR SHARE'), params)).rows)
      if (bound !== actor.tenantId || JSON.stringify(await authorize()) !== JSON.stringify(actor)) throw createError({ statusCode: 403 })
      return scope
    }
  })
}
