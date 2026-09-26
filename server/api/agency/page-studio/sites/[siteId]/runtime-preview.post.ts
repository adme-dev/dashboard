import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { issueAstroCandidateSession } from '~~/server/utils/pageStudio/astroCandidateSession'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { preparePageStudioPublishPrincipal } from '~~/server/utils/pageStudio/publishHttp'
import { readPageStudioRuntimeState } from '~~/server/utils/pageStudio/runtimeState'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { resolvePageStudioSessionEnvironment, signPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'
import { resolveAgencyPageStudioSiteClient } from '~~/server/utils/pageStudio/versions'

/** Short-lived, preview-only credential for the site's private draft host. The
 * delivery worker re-checks the grant with the Dashboard on every request. */
export default eventHandler(async (event) => {
  try {
    const access = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_PUBLISH')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    if (!siteId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website ID' })
    const scope = { tenantId: access.tenantId, clientId: await resolveAgencyPageStudioSiteClient(access.tenantId, siteId.data), siteId: siteId.data }
    const state = await readPageStudioRuntimeState(scope, event.context.cloudflare?.env as Record<string, unknown> | undefined)
    if (state.deliveryMode !== 'runtime' || !state.draft?.previewHostname) {
      throw createError({ statusCode: 409, statusMessage: 'This website has no saved draft to preview' })
    }
    const signing = resolvePageStudioSessionEnvironment(event)
    const principal = await preparePageStudioPublishPrincipal(event, access)
    const session = await issueAstroCandidateSession(scope, principal, {
      signToken: claims => signPageStudioSessionToken(claims, signing.privateKey, signing.issuer)
    })
    setResponseHeader(event, 'cache-control', 'private, no-store')
    return { draft: state.draft, hostname: state.draft.previewHostname, session }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
