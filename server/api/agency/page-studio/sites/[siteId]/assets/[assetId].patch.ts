import { z } from 'zod'

import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { updatePageStudioAsset } from '~~/server/utils/pageStudio/siteOperations'

const AssetId = z.string().uuid()
const Body = z.object({
  altText: z.string().trim().max(1000).nullable().optional(),
  publicationStatus: z.enum(['ready', 'archived']).optional()
}).strict().refine(value => value.altText !== undefined || value.publicationStatus !== undefined)

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const assetId = AssetId.safeParse(getRouterParam(event, 'assetId'))
    const body = Body.safeParse(await readBody(event))
    if (!siteId.success || !assetId.success || !body.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio asset update' })
    }
    return { asset: await updatePageStudioAsset({
      actorId: user.id,
      assetId: assetId.data,
      siteId: siteId.data,
      tenantId,
      ...body.data
    }) }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
