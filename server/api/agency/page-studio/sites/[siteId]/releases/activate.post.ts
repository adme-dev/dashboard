import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { PageStudioIdempotencyKeySchema } from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import {
  activatePageStudioRelease,
  getPageStudioBuildPointer,
  PageStudioPublishingError,
  resolvePageStudioDeliveryWorker
} from '~~/server/utils/pageStudio/publishing'
import {
  PageStudioReleaseActivationBody,
  PageStudioSiteId
} from '~~/server/utils/pageStudio/schemas'
import { resolveAgencyPageStudioSiteClient } from '~~/server/utils/pageStudio/versions'

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_PUBLISH')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const body = PageStudioReleaseActivationBody.safeParse(await readBody(event))
    const idempotencyKey = PageStudioIdempotencyKeySchema.safeParse(
      getHeader(event, 'idempotency-key')
    )
    if (!siteId.success || !body.success || !idempotencyKey.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio activation' })
    }
    const clientId = await resolveAgencyPageStudioSiteClient(tenantId, siteId.data)
    const scope = { tenantId, clientId, siteId: siteId.data }
    const build = await getPageStudioBuildPointer(scope, body.data.buildId)
    if (!build) {
      throw new PageStudioPublishingError(
        'BUILD_NOT_PUBLISHABLE',
        422,
        'Page Studio build is not approved and publishable'
      )
    }
    const worker = resolvePageStudioDeliveryWorker(event, body.data.environment)
    await worker.verifyBuild(build)
    const release = await activatePageStudioRelease({
      actorId: user.id,
      ...body.data,
      expectedActiveReleaseId: body.data.expectedActiveReleaseId ?? null,
      idempotencyKey: idempotencyKey.data,
      scope
    })
    return { release }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
