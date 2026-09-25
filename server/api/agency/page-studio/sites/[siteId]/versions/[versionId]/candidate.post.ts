import { z } from 'zod'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { resolveAgencyPageStudioSiteClient } from '~~/server/utils/pageStudio/versions'
import { preparePageStudioPublishPrincipal } from '~~/server/utils/pageStudio/publishHttp'
import { resolveAstroBuildServices } from '~~/server/utils/pageStudio/astroBuildHttp'
import { coordinateApprovedAstroBuild } from '~~/server/utils/pageStudio/astroBuildCoordinator'
import { registerAstroCandidatePreview } from '~~/server/utils/pageStudio/astroCandidatePreview'
import { issueAstroCandidateSession } from '~~/server/utils/pageStudio/astroCandidateSession'
import { resolvePageStudioSessionEnvironment, signPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'
import { PageStudioHostnameSchema } from '~~/server/utils/pageStudio/delivery'
import { PageStudioIdempotencyKeySchema } from '~~/server/utils/pageStudio/controlSchemas'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'

const Body = z.object({ environment: z.enum(['staging', 'production']) }).strict()

export default eventHandler(async (event) => {
  try {
    const access = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_PUBLISH')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const versionId = PageStudioSiteId.safeParse(getRouterParam(event, 'versionId'))
    const body = Body.safeParse(await readBody(event))
    const key = PageStudioIdempotencyKeySchema.safeParse(getHeader(event, 'idempotency-key'))
    if (!siteId.success || !versionId.success || !body.success || !key.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Astro candidate request' })
    }
    const configuredHostname = PageStudioHostnameSchema.safeParse(
      event.context.cloudflare?.env?.PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME
    )
    // The full build identity occupies a 56-character label plus the dot.
    if (!configuredHostname.success || configuredHostname.data.length > 196) {
      throw createError({ statusCode: 503, statusMessage: 'Approved website preview is not configured' })
    }
    const { environment, services } = resolveAstroBuildServices(event)
    if (body.data.environment !== environment) {
      throw createError({ statusCode: 409, statusMessage: 'The requested environment does not match the configured compiler' })
    }
    const signing = resolvePageStudioSessionEnvironment(event)
    const scope = { tenantId: access.tenantId, clientId: await resolveAgencyPageStudioSiteClient(access.tenantId, siteId.data), siteId: siteId.data }
    const principal = await preparePageStudioPublishPrincipal(event, access)
    const build = await coordinateApprovedAstroBuild({ scope, versionId: versionId.data, environment, idempotencyKey: key.data }, principal, services, { recoverCandidate: true })
    const preview = await registerAstroCandidatePreview({ scope, versionId: versionId.data, environment,
      buildId: build.buildId, previewHostname: configuredHostname.data }, principal, { verifyBuild: pointer => services.verifyBuild(pointer) })
    const session = await issueAstroCandidateSession(scope, principal, {
      signToken: claims => signPageStudioSessionToken(claims, signing.privateKey, signing.issuer)
    })
    setResponseHeader(event, 'cache-control', 'private, no-store')
    return { build, preview, session }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
