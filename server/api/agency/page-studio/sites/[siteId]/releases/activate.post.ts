import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { PageStudioIdempotencyKeySchema } from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { resolvePageStudioDeliveryWorker } from '~~/server/utils/pageStudio/publishing'
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
    const worker = resolvePageStudioDeliveryWorker(event, body.data.environment)
    const release = await worker.publish({
      actorId: user.id,
      ...body.data,
      expectedActiveReleaseId: body.data.expectedActiveReleaseId ?? null,
      idempotencyKey: idempotencyKey.data,
      scope: { tenantId, clientId, siteId: siteId.data }
    })
    return { release }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
