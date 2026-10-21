import { setHeader, type H3Event } from 'h3'
import { guardCustomerRequest, customerSessionToken } from './customerSignupHttp'
import { prepareCustomerPublishPrincipal } from './customerPublishAuthority'
import { withCustomerReleaseAuthority } from './customerReleaseAuthority'
import { pageStudioHttpError } from './http'
import {
  activatePageStudioRelease, getPageStudioBuildPointer, getPageStudioReleasePointer,
  resolvePageStudioDeliveryWorker, rollbackPageStudioRelease
} from './publishing'
import { PageStudioPublishingError } from './publishingError'
import { activation, rollback, readPublicationRequest } from './publicationRequest'

/** Native owners/managers can promote only retained approved static artifacts.
 * Scope and attribution come from their original native session, never the body. */
export async function handleCustomerPublishing(event: H3Event, action: 'activate' | 'rollback') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    guardCustomerRequest(event, 'POST')
    const token = customerSessionToken(event)
    const { siteId, key, body: input } = await readPublicationRequest(event, action)
    const { scope, principal } = await prepareCustomerPublishPrincipal(token, siteId)
    const runTransaction: NonNullable<Parameters<typeof activatePageStudioRelease>[1]>['runTransaction'] = work =>
      withCustomerReleaseAuthority(scope, principal, input.hostname, work)
    // Recheck the account and hostname before reading artifacts or delivery config.
    await runTransaction(async () => undefined)
    const actor = { actorId: principal.identityId, actorRole: 'customer' as const, scope, idempotencyKey: key }
    const worker = resolvePageStudioDeliveryWorker(event, 'production')
    if (action === 'activate') {
      const body = activation.parse(input)
      const build = await getPageStudioBuildPointer(scope, body.buildId)
      if (!build?.astro || build.astro.context.identity.environment !== 'production'
        || build.astro.context.identity.source.kind !== 'approved-version') {
        throw new PageStudioPublishingError('BUILD_NOT_PUBLISHABLE', 422, 'An approved production website build is required')
      }
      await worker.verifyBuild(build)
      return { release: await activatePageStudioRelease({ ...body, ...actor,
        expectedActiveReleaseId: body.expectedActiveReleaseId ?? null }, { runTransaction }) }
    }
    const body = rollback.parse(input)
    const target = await getPageStudioReleasePointer(scope, body.targetReleaseId)
    if (!target?.astro || target.environment !== 'production'
      || target.astro.context.identity.environment !== 'production'
      || target.astro.context.identity.source.kind !== 'approved-version') {
      throw new PageStudioPublishingError('ROLLBACK_TARGET_INVALID', 422, 'A previous approved production website release is required')
    }
    await worker.verifyRelease(target)
    return { release: await rollbackPageStudioRelease({ ...body, ...actor }, { runTransaction }) }
  } catch (error) { pageStudioHttpError(error) }
}
