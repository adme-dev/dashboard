import { createHash, randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'

import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import {
  isSupportedPageStudioImage,
  registerPageStudioAsset,
  requirePageStudioSiteScope
} from '~~/server/utils/pageStudio/siteOperations'
import { deleteFile, uploadFile, type R2BucketBinding } from '~~/server/utils/storage'

const MAX_ASSET_BYTES = 10 * 1024 * 1024

function safeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'asset'
}

export default eventHandler(async (event) => {
  let objectKey: string | null = null
  let bucket: R2BucketBinding | undefined
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    if (!siteId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio site ID' })
    const scope = await requirePageStudioSiteScope(tenantId, siteId.data)
    const parts = await readMultipartFormData(event)
    const file = parts?.find(part => part.name === 'file' && part.filename)
    const altText = parts?.find(part => part.name === 'altText')?.data.toString('utf8').trim()
    if (!file?.filename || !file.type || !file.data.length || file.data.length > MAX_ASSET_BYTES) {
      throw createError({ statusCode: 400, statusMessage: 'Choose a JPEG, PNG, GIF or WebP image up to 10 MB' })
    }
    if (altText && altText.length > 1000) throw createError({ statusCode: 400, statusMessage: 'Alt text is too long' })
    if (!isSupportedPageStudioImage(file.data, file.type)) {
      throw createError({ statusCode: 400, statusMessage: 'The uploaded file content does not match a supported image type' })
    }
    const fileName = safeFileName(file.filename)
    objectKey = `page-studio/${tenantId}/${scope.clientId}/${siteId.data}/${randomUUID()}-${fileName}`
    bucket = (event.context as { cloudflare?: { env?: { MEDIA_BUCKET?: R2BucketBinding } } }).cloudflare?.env?.MEDIA_BUCKET
    const uploaded = await uploadFile(Buffer.from(file.data), objectKey, file.type, {
      clientId: scope.clientId,
      originalFileName: fileName,
      siteId: siteId.data,
      tenantId
    }, bucket)
    const asset = await registerPageStudioAsset({
      actorId: user.id,
      altText,
      digest: createHash('sha256').update(file.data).digest('hex'),
      fileName,
      mediaType: file.type,
      objectKey,
      siteId: siteId.data,
      size: uploaded.size,
      tenantId
    })
    setResponseStatus(event, 201)
    return { asset }
  } catch (error) {
    if (objectKey) await deleteFile(objectKey, bucket).catch(() => {})
    pageStudioHttpError(error)
  }
})
