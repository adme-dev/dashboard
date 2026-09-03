import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { getPageStudioAssetObject } from '~~/server/utils/pageStudio/siteOperations'
import { readStoredObject, type R2BucketBinding } from '~~/server/utils/storage'

export default eventHandler(async (event) => {
  try {
    const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_VIEW')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const assetId = PageStudioSiteId.safeParse(getRouterParam(event, 'assetId'))
    if (!siteId.success || !assetId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio asset ID' })
    const asset = await getPageStudioAssetObject(tenantId, siteId.data, assetId.data)
    const bucket = (event.context as { cloudflare?: { env?: { MEDIA_BUCKET?: R2BucketBinding } } }).cloudflare?.env?.MEDIA_BUCKET
    const object = await readStoredObject(asset.objectKey, { requestBucket: bucket })
    if (!object) throw createError({ statusCode: 404, statusMessage: 'Page Studio asset content not found' })
    setHeader(event, 'Content-Type', asset.mediaType)
    setHeader(event, 'Content-Length', object.size)
    setHeader(event, 'Cache-Control', 'private, max-age=3600')
    if (object.etag) setHeader(event, 'ETag', object.etag)
    return sendStream(event, object.body as unknown as ReadableStream)
  } catch (error) {
    pageStudioHttpError(error)
  }
})
