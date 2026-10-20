import { assertMethod, createError, getHeader, getRequestURL, setHeader, type H3Event } from 'h3'
import { readCandidatePreviewRequest, candidatePreviewConfiguration } from './candidatePreviewHttp'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { resolvePortalPageStudioSiteTenant } from './versions'
import { preparePortalPageStudioPublishPrincipal } from './publishHttp'
import { withPageStudioPublishAuthority } from './publishAuthority'
import { coordinateApprovedAstroBuild } from './astroBuildCoordinator'
import { registerAstroCandidatePreview } from './astroCandidatePreview'
import { issueAstroCandidateSession } from './astroCandidateSession'
import { signPageStudioSessionToken } from './sessions'
import { pageStudioHttpError } from './http'

/** Prepare a private review of an already approved static version. Ownership,
 * compiler configuration and preview address are server-derived. Each helper
 * rechecks the captured login after remote work; this never activates a site. */
export async function handlePortalPageStudioCandidate(event: H3Event) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    assertMethod(event, 'POST')
    const user = await requireClientAuth(event)
    const actorId = user.id, clientId = user.clientId
    if (getHeader(event, 'origin') !== getRequestURL(event).origin) {
      throw createError({ statusCode: 403, statusMessage: 'Same-origin website preview is required' })
    }
    const { siteId, versionId, key } = await readCandidatePreviewRequest(event)
    const tenantId = await resolvePortalPageStudioSiteTenant({ clientId, userId: actorId, siteId })
    const scope = { tenantId, clientId, siteId }
    const principal = await preparePortalPageStudioPublishPrincipal(event, { tenantId, user: { id: actorId } })
    // Every helper transaction retains the static-delivery restriction as well
    // as the original publisher. Remote work remains outside these site locks.
    const runTransaction: NonNullable<Parameters<typeof withPageStudioPublishAuthority>[3]>['runTransaction'] = work =>
      withPageStudioPublishAuthority(scope, principal, async (db) => {
        const assertStatic = async () => {
          const site = (await db.query<{ delivery_mode: string }>(
            'SELECT delivery_mode FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 AND id=$3',
            [tenantId, clientId, siteId]
          )).rows[0]
          if (site?.delivery_mode !== 'static') {
            throw createError({ statusCode: 409, statusMessage: 'This website requires its runtime publication workflow' })
          }
        }
        await assertStatic()
        const result = await work(db)
        await assertStatic()
        return result
      })
    await runTransaction(async () => undefined)
    const { hostname, environment, services, signing } = candidatePreviewConfiguration(event)
    const build = await coordinateApprovedAstroBuild({ scope, versionId, environment, idempotencyKey: key }, principal, services, { recoverCandidate: true, runTransaction })
    const preview = await registerAstroCandidatePreview({ scope, versionId, environment,
      buildId: build.buildId, previewHostname: hostname }, principal, { runTransaction, verifyBuild: pointer => services.verifyBuild(pointer) })
    const session = await issueAstroCandidateSession(scope, principal, {
      runTransaction, signToken: claims => signPageStudioSessionToken(claims, signing.privateKey, signing.issuer)
    })
    return { build, preview, session }
  } catch (error) {
    pageStudioHttpError(error)
  }
}
