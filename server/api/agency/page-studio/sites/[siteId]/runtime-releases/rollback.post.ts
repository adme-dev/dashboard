import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { PageStudioIdempotencyKeySchema } from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { withPageStudioPublishAuthority } from '~~/server/utils/pageStudio/publishAuthority'
import { preparePageStudioPublishPrincipal } from '~~/server/utils/pageStudio/publishHttp'
import { rollbackPageStudioRuntimeRelease } from '~~/server/utils/pageStudio/runtimePublishing'
import { resolveRuntimeRenderer } from '~~/server/utils/pageStudio/runtimeReleases'
import { PageStudioReleaseRollbackBody, PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { resolveAgencyPageStudioSiteClient } from '~~/server/utils/pageStudio/versions'

/** Restore a retained runtime release without rebuilding. Only releases whose
 * renderer generation is still deployed are eligible. */
export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_PUBLISH')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const body = PageStudioReleaseRollbackBody.safeParse(await readBody(event))
    const idempotencyKey = PageStudioIdempotencyKeySchema.safeParse(getHeader(event, 'idempotency-key'))
    if (!siteId.success || !body.success || !idempotencyKey.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio runtime rollback' })
    }
    const env = (event.context.cloudflare?.env ?? undefined) as Record<string, unknown> | undefined
    const current = resolveRuntimeRenderer(env)
    const retained = typeof env?.PAGE_STUDIO_RUNTIME_RETAINED_GENERATIONS === 'string'
      ? env.PAGE_STUDIO_RUNTIME_RETAINED_GENERATIONS.split(',').map(value => value.trim()).filter(Boolean)
      : []
    const clientId = await resolveAgencyPageStudioSiteClient(tenantId, siteId.data)
    const scope = { tenantId, clientId, siteId: siteId.data }
    const principal = await preparePageStudioPublishPrincipal(event, { tenantId, user })
    const release = await rollbackPageStudioRuntimeRelease({
      actorId: user.id,
      ...body.data,
      idempotencyKey: idempotencyKey.data,
      retainedGenerations: [current.generation, ...retained],
      scope
    }, { runTransaction: work => withPageStudioPublishAuthority(scope, principal, work) })
    return { release }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
