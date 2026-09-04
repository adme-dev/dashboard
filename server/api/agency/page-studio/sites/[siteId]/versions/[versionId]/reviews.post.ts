import { z } from 'zod'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import {
  resolveAgencyPageStudioSiteClient,
  reviewPageStudioVersion
} from '~~/server/utils/pageStudio/versions'

const Id = z.string().uuid()
const Body = z.object({
  decision: z.enum(['approved', 'rejected', 'returned_to_draft']),
  comment: z.string().trim().max(4000).optional()
}).strict()

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_APPROVE')
    const siteId = Id.safeParse(getRouterParam(event, 'siteId'))
    const versionId = Id.safeParse(getRouterParam(event, 'versionId'))
    const body = Body.safeParse(await readBody(event))
    if (!siteId.success || !versionId.success || !body.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio review' })
    }
    const clientId = await resolveAgencyPageStudioSiteClient(tenantId, siteId.data)
    const review = await reviewPageStudioVersion({
      tenantId,
      clientId,
      siteId: siteId.data,
      versionId: versionId.data,
      reviewerId: user.id,
      decision: body.data.decision,
      comment: body.data.comment
    })
    return { review }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
