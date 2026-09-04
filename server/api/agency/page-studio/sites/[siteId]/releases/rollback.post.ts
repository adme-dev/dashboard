import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { PageStudioIdempotencyKeySchema } from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import {
  getPageStudioReleasePointer,
  PageStudioPublishingError,
  resolvePageStudioDeliveryWorker,
  rollbackPageStudioRelease
} from '~~/server/utils/pageStudio/publishing'
import {
  PageStudioReleaseRollbackBody,
  PageStudioSiteId
} from '~~/server/utils/pageStudio/schemas'
import { resolveAgencyPageStudioSiteClient } from '~~/server/utils/pageStudio/versions'

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_PUBLISH')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const body = PageStudioReleaseRollbackBody.safeParse(await readBody(event))
    const idempotencyKey = PageStudioIdempotencyKeySchema.safeParse(
      getHeader(event, 'idempotency-key')
    )
    if (!siteId.success || !body.success || !idempotencyKey.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio rollback' })
    }
    const clientId = await resolveAgencyPageStudioSiteClient(tenantId, siteId.data)
    const scope = { tenantId, clientId, siteId: siteId.data }
    const target = await getPageStudioReleasePointer(scope, body.data.targetReleaseId)
    if (!target) {
      throw new PageStudioPublishingError(
        'ROLLBACK_TARGET_INVALID',
        422,
        'The Page Studio rollback target is not valid for this release pointer'
      )
    }
    const worker = resolvePageStudioDeliveryWorker(event, body.data.environment)
    await worker.verifyRelease(target)
    const release = await rollbackPageStudioRelease({
      actorId: user.id,
      ...body.data,
      idempotencyKey: idempotencyKey.data,
      scope
    })
    return { release }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
