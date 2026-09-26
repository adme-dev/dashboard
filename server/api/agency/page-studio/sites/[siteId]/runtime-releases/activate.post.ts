import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { PageStudioIdempotencyKeySchema } from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { withPageStudioPublishAuthority } from '~~/server/utils/pageStudio/publishAuthority'
import { preparePageStudioPublishPrincipal } from '~~/server/utils/pageStudio/publishHttp'
import { PageStudioReleaseCheckpointError } from '~~/server/utils/pageStudio/releaseCheckpoint'
import { activatePageStudioRuntimeRelease } from '~~/server/utils/pageStudio/runtimePublishing'
import {
  preparePageStudioRuntimeRelease,
  resolveRuntimeRenderer,
  type RuntimeContentBucket
} from '~~/server/utils/pageStudio/runtimeReleases'
import { PageStudioRuntimeReleaseActivationBody, PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { resolveAgencyPageStudioSiteClient } from '~~/server/utils/pageStudio/versions'

/**
 * Publish an approved saved version of a runtime-delivery site: no build, no
 * compiler dispatch. Content is retained before the transaction; the pointer
 * change, approval re-check and audit happen atomically under publish authority.
 */
export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_PUBLISH')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const body = PageStudioRuntimeReleaseActivationBody.safeParse(await readBody(event))
    const idempotencyKey = PageStudioIdempotencyKeySchema.safeParse(getHeader(event, 'idempotency-key'))
    if (!siteId.success || !body.success || !idempotencyKey.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio runtime publication' })
    }
    const env = (event.context.cloudflare?.env ?? undefined) as Record<string, unknown> | undefined
    const renderer = resolveRuntimeRenderer(env)
    const bucket = env?.PAGE_STUDIO_CHECKPOINTS as RuntimeContentBucket | undefined
    if (!bucket?.get || !bucket.put) {
      throw createError({ statusCode: 503, statusMessage: 'Page Studio checkpoint storage is unavailable' })
    }
    const clientId = await resolveAgencyPageStudioSiteClient(tenantId, siteId.data)
    const scope = { tenantId, clientId, siteId: siteId.data }
    const principal = await preparePageStudioPublishPrincipal(event, { tenantId, user })
    const prepared = await preparePageStudioRuntimeRelease({
      bucket, environment: body.data.environment, renderer, scope, versionId: body.data.versionId
    })
    const release = await activatePageStudioRuntimeRelease({
      actorId: user.id,
      environment: body.data.environment,
      expectedActiveReleaseId: body.data.expectedActiveReleaseId,
      hostname: body.data.hostname,
      idempotencyKey: idempotencyKey.data,
      prepared,
      scope
    }, { runTransaction: work => withPageStudioPublishAuthority(scope, principal, work) })
    return { release }
  } catch (error) {
    if (error instanceof PageStudioReleaseCheckpointError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message, data: { code: error.code } })
    }
    pageStudioHttpError(error)
  }
})
