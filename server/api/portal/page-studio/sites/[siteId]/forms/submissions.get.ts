import { requireClientAuth } from '~~/server/utils/clientAuth'
import { listPageStudioBusinessSubmissions } from '~~/server/utils/pageStudio/businessContent'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    if (!siteId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio site ID' })
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {}
    const submissions = await listPageStudioBusinessSubmissions({
      actor: { role: 'client', actorId: user.id, clientId: user.clientId },
      env,
      siteId: siteId.data
    })
    return {
      submissions: submissions.map(submission => ({
        fields: submission.fieldData,
        formId: submission.formId,
        id: submission.id,
        isTest: false,
        pageId: submission.pageId,
        pageRoute: '',
        submittedAt: submission.submittedAt
      }))
    }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
