import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import {
  buildApprovedPageStudioVersion,
  resolvePageStudioBuildWorker
} from '~~/server/utils/pageStudio/builds'
import { PageStudioIdempotencyKeySchema } from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioBuildBody, PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'

const MAX_BUILD_REQUEST_BYTES = 12 * 1024 * 1024

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_PUBLISH')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const versionId = PageStudioSiteId.safeParse(getRouterParam(event, 'versionId'))
    const body = PageStudioBuildBody.safeParse(await readBody(event))
    const idempotencyKey = PageStudioIdempotencyKeySchema.safeParse(
      getHeader(event, 'idempotency-key')
    )
    const bodyBytes = body.success
      ? new TextEncoder().encode(JSON.stringify(body.data)).byteLength
      : Number.POSITIVE_INFINITY
    if (
      !siteId.success
      || !versionId.success
      || !body.success
      || !idempotencyKey.success
      || bodyBytes > MAX_BUILD_REQUEST_BYTES
    ) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio build' })
    }
    const worker = resolvePageStudioBuildWorker(event)
    const build = await buildApprovedPageStudioVersion({
      actorId: user.id,
      assets: body.data.assets,
      idempotencyKey: idempotencyKey.data,
      manifest: body.data.manifest,
      siteId: siteId.data,
      tenantId,
      versionId: versionId.data
    }, { worker })
    return { build }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
