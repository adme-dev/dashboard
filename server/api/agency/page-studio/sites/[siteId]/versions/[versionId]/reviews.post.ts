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
  comment: z.string().trim().max(4000).optional(),
  expectedComparison: z.object({
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    checkpointId: z.string().min(1).max(128),
    releaseId: Id.nullable(),
    hostname: z.string().min(1).max(253).nullable()
  }).strict().refine(value => (value.releaseId === null) === (value.hostname === null)).optional()
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
      comment: body.data.comment,
      expectedComparison: body.data.expectedComparison ? { ...body.data.expectedComparison, releaseId: body.data.expectedComparison.releaseId ?? null, hostname: body.data.expectedComparison.hostname ?? null } : undefined
    })
    return { review }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
