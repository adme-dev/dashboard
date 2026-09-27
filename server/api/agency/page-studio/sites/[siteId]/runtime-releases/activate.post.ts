import { activateRuntimeFeature } from '~~/server/utils/pageStudio/runtimeFeatureActivation'
import { nativeFeaturePublisher } from '~~/server/utils/pageStudio/releaseFeatureHttp'
import { loadApprovedPageStudioReleaseCheckpoint, PageStudioReleaseCheckpointError } from '~~/server/utils/pageStudio/releaseCheckpoint'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { PageStudioIdempotencyKeySchema } from '~~/server/utils/pageStudio/controlSchemas'
import { runtimeTargetPolicy } from '~~/server/utils/pageStudio/runtimeTarget'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { withPageStudioPublishAuthority } from '~~/server/utils/pageStudio/publishAuthority'
import { preparePageStudioPublishPrincipal } from '~~/server/utils/pageStudio/publishHttp'
import { activatePageStudioRuntimeRelease } from '~~/server/utils/pageStudio/runtimePublishing'
import {
  preparePageStudioRuntimeRelease,
  requiresPublishedRuntimeIntegration,
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
    const policy = runtimeTargetPolicy(env)
    if (policy.deploymentEnvironment === 'staging' && body.data.environment !== 'staging') {
      throw createError({ statusCode: 403, statusMessage: 'Staging cannot publish to production' })
    }
    const renderer = resolveRuntimeRenderer(env)
    const bucket = env?.PAGE_STUDIO_CHECKPOINTS as RuntimeContentBucket | undefined
    if (!bucket?.get || !bucket.put) {
      throw createError({ statusCode: 503, statusMessage: 'Page Studio checkpoint storage is unavailable' })
    }
    const clientId = await resolveAgencyPageStudioSiteClient(tenantId, siteId.data)
    const scope = { tenantId, clientId, siteId: siteId.data }
    const preparation = { bucket, environment: body.data.environment, renderer, scope, versionId: body.data.versionId }
    const checkpoint = await loadApprovedPageStudioReleaseCheckpoint({ bucket, scope, versionId: body.data.versionId })
    if (requiresPublishedRuntimeIntegration(checkpoint.manifest)) {
      const principal = await nativeFeaturePublisher(event, siteId.data)
      const release = await activateRuntimeFeature({ actorId: user.id, environment: body.data.environment,
        hostname: body.data.hostname, expectedActiveReleaseId: body.data.expectedActiveReleaseId,
        idempotencyKey: idempotencyKey.data, preparation }, principal, { policy })
      return { release }
    }
    const principal = await preparePageStudioPublishPrincipal(event, { tenantId, user })
    const prepared = await preparePageStudioRuntimeRelease({
      ...preparation
    }, { loadCheckpoint: async () => checkpoint })
    const release = await activatePageStudioRuntimeRelease({
      actorId: user.id,
      environment: body.data.environment,
      expectedActiveReleaseId: body.data.expectedActiveReleaseId,
      hostname: body.data.hostname,
      idempotencyKey: idempotencyKey.data,
      prepared,
      scope
    }, { policy, runTransaction: work => withPageStudioPublishAuthority(scope, principal, work) })
    return { release }
  } catch (error) {
    if (error instanceof PageStudioReleaseCheckpointError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message, data: { code: error.code } })
    }
    pageStudioHttpError(error)
  }
})
