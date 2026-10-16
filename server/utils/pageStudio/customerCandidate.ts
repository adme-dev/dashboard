import { createError, getHeader, getQuery, getRouterParam, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { guardCustomerRequest, customerSessionToken } from './customerSignupHttp'
import { prepareCustomerPublishPrincipal } from './customerPublishAuthority'
import { withAstroPublishAuthority } from './astroPublishAuthority'
import { resolveAstroBuildServices } from './astroBuildHttp'
import { coordinateApprovedAstroBuild } from './astroBuildCoordinator'
import { registerAstroCandidatePreview } from './astroCandidatePreview'
import { issueCustomerPreviewSession } from './customerPreviewSession'
import { signCustomerPreviewToken } from './customerPreviewToken'
import { resolvePageStudioSessionEnvironment } from './sessions'
import { PageStudioHostnameSchema } from './delivery'
import { PageStudioIdempotencyKeySchema } from './controlSchemas'
import { PageStudioSiteId } from './schemas'
import { readPageStudioJson } from './boundedJson'
import { pageStudioHttpError } from './http'

const Body = z.object({ environment: z.literal('production') }).strict()

/** Prepare an approved native customer's private review. Helpers recheck the
 * original login after remote work; neither body nor cookies can supply scope,
 * storage, compiler generation or preview host. No live pointer is activated. */
export async function handleCustomerCandidate(event: H3Event) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    guardCustomerRequest(event, 'POST')
    const token = customerSessionToken(event)
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const versionId = PageStudioSiteId.safeParse(getRouterParam(event, 'versionId'))
    const key = PageStudioIdempotencyKeySchema.safeParse(getHeader(event, 'idempotency-key'))
    if (!siteId.success || !versionId.success || !key.success || !z.object({}).strict().safeParse(getQuery(event)).success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid website preview request' })
    }
    const body = Body.safeParse(await readPageStudioJson(event, 2048, [
      'Website preview requires JSON', 'Website preview request is too large',
      'Website preview request is required', 'Invalid website preview body', 'Invalid website preview JSON'
    ]))
    if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website preview request' })
    const { scope, principal } = await prepareCustomerPublishPrincipal(token, siteId.data)
    await withAstroPublishAuthority(scope, principal, async () => undefined)
    const hostname = PageStudioHostnameSchema.safeParse(event.context.cloudflare?.env?.PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME)
    if (!hostname.success || hostname.data.length > 196) {
      throw createError({ statusCode: 503, statusMessage: 'Approved website preview is not configured' })
    }
    const { environment, services } = resolveAstroBuildServices(event)
    if (environment !== 'production') {
      throw createError({ statusCode: 409, statusMessage: 'Production website preview is not configured in this environment' })
    }
    const signing = resolvePageStudioSessionEnvironment(event)
    const build = await coordinateApprovedAstroBuild({ scope, versionId: versionId.data, environment, idempotencyKey: key.data },
      principal, services, { recoverCandidate: true })
    const preview = await registerAstroCandidatePreview({ scope, versionId: versionId.data, environment,
      buildId: build.buildId, previewHostname: hostname.data }, principal, { verifyBuild: pointer => services.verifyBuild(pointer) })
    const session = await issueCustomerPreviewSession({ scope, hostname: preview.hostname, releaseId: preview.release.releaseId }, principal,
      { signToken: claims => signCustomerPreviewToken(claims, signing.privateKey, signing.issuer) })
    return { build, preview, session }
  } catch (error) { pageStudioHttpError(error) }
}
