import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { listPageStudioBusinessSubmissions } from '~~/server/utils/pageStudio/businessContent'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { listPageStudioSubmissions } from '~~/server/utils/pageStudio/siteOperations'

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_VIEW')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    if (!siteId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio site ID' })
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {}
    if (env.PAGE_STUDIO_FORM_SUBMISSIONS_SOURCE === 'business-content') {
      const submissions = await listPageStudioBusinessSubmissions({
        actor: { role: 'agency', actorId: user.id, tenantId },
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
    }
    return { submissions: await listPageStudioSubmissions(tenantId, siteId.data) }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
