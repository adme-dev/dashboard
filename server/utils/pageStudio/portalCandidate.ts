import { assertMethod, createError, getHeader, getQuery, getRequestURL, getRouterParam, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { resolvePortalPageStudioSiteTenant } from './versions'
import { preparePortalPageStudioPublishPrincipal } from './publishHttp'
import { withPageStudioPublishAuthority } from './publishAuthority'
import { resolveAstroBuildServices } from './astroBuildHttp'
import { coordinateApprovedAstroBuild } from './astroBuildCoordinator'
import { registerAstroCandidatePreview } from './astroCandidatePreview'
import { issueAstroCandidateSession } from './astroCandidateSession'
import { resolvePageStudioSessionEnvironment, signPageStudioSessionToken } from './sessions'
import { PageStudioHostnameSchema } from './delivery'
import { PageStudioIdempotencyKeySchema } from './controlSchemas'
import { PageStudioSiteId } from './schemas'
import { readPageStudioJson } from './boundedJson'
import { pageStudioHttpError } from './http'

const Body = z.object({ environment: z.literal('production') }).strict()

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
    const tenantId = await resolvePortalPageStudioSiteTenant({ clientId, userId: actorId, siteId: siteId.data })
    const scope = { tenantId, clientId, siteId: siteId.data }
    const principal = await preparePortalPageStudioPublishPrincipal(event, { tenantId, user: { id: actorId } })
    // Every helper transaction retains the static-delivery restriction as well
    // as the original publisher. Remote work remains outside these site locks.
    const runTransaction: NonNullable<Parameters<typeof withPageStudioPublishAuthority>[3]>['runTransaction'] = work =>
      withPageStudioPublishAuthority(scope, principal, async (db) => {
        const assertStatic = async () => {
          const site = (await db.query<{ delivery_mode: string }>(
            'SELECT delivery_mode FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 AND id=$3',
            [tenantId, clientId, siteId.data]
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
    const hostname = PageStudioHostnameSchema.safeParse(event.context.cloudflare?.env?.PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME)
    if (!hostname.success || hostname.data.length > 196) {
      throw createError({ statusCode: 503, statusMessage: 'Approved website preview is not configured' })
    }
    const { environment, services } = resolveAstroBuildServices(event)
    if (environment !== 'production') {
      throw createError({ statusCode: 409, statusMessage: 'Production website preview is not configured in this environment' })
    }
    const signing = resolvePageStudioSessionEnvironment(event)
    const build = await coordinateApprovedAstroBuild({ scope, versionId: versionId.data, environment, idempotencyKey: key.data }, principal, services, { recoverCandidate: true, runTransaction })
    const preview = await registerAstroCandidatePreview({ scope, versionId: versionId.data, environment,
      buildId: build.buildId, previewHostname: hostname.data }, principal, { runTransaction, verifyBuild: pointer => services.verifyBuild(pointer) })
    const session = await issueAstroCandidateSession(scope, principal, {
      runTransaction, signToken: claims => signPageStudioSessionToken(claims, signing.privateKey, signing.issuer)
    })
    return { build, preview, session }
  } catch (error) {
    pageStudioHttpError(error)
  }
}
