import { setHeader, type H3Event } from 'h3'
import { readCandidatePreviewRequest, candidatePreviewConfiguration } from './candidatePreviewHttp'
import { guardCustomerRequest, customerSessionToken } from './customerSignupHttp'
import { prepareCustomerPublishPrincipal } from './customerPublishAuthority'
import { withAstroPublishAuthority } from './astroPublishAuthority'
import { coordinateApprovedAstroBuild } from './astroBuildCoordinator'
import { registerAstroCandidatePreview } from './astroCandidatePreview'
import { issueCustomerPreviewSession } from './customerPreviewSession'
import { signCustomerPreviewToken } from './customerPreviewToken'
import { pageStudioHttpError } from './http'

/** Prepare an approved native customer's private review. Helpers recheck the
 * original login after remote work; neither body nor cookies can supply scope,
 * storage, compiler generation or preview host. No live pointer is activated. */
export async function handleCustomerCandidate(event: H3Event) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    guardCustomerRequest(event, 'POST')
    const token = customerSessionToken(event)
    const { siteId, versionId, key } = await readCandidatePreviewRequest(event)
    const { scope, principal } = await prepareCustomerPublishPrincipal(token, siteId)
    await withAstroPublishAuthority(scope, principal, async () => undefined)
    const { hostname, environment, services, signing } = candidatePreviewConfiguration(event)
    const build = await coordinateApprovedAstroBuild({ scope, versionId, environment, idempotencyKey: key },
      principal, services, { recoverCandidate: true })
    const preview = await registerAstroCandidatePreview({ scope, versionId, environment,
      buildId: build.buildId, previewHostname: hostname }, principal, { verifyBuild: pointer => services.verifyBuild(pointer) })
    const session = await issueCustomerPreviewSession({ scope, hostname: preview.hostname, releaseId: preview.release.releaseId }, principal,
      { signToken: claims => signCustomerPreviewToken(claims, signing.privateKey, signing.issuer) })
    return { build, preview, session }
  } catch (error) { pageStudioHttpError(error) }
}
