import { assertMethod, createError, getHeader, getQuery, getRequestURL, getRouterParam, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { readPageStudioJson } from './boundedJson'
import { PageStudioIdempotencyKeySchema } from './controlSchemas'
import { pageStudioHttpError } from './http'
import { withPortalPageStudioReleaseAuthority } from './portalReleaseAuthority'
import { preparePortalPageStudioPublishPrincipal } from './publishHttp'
import {
  activatePageStudioRelease, getPageStudioBuildPointer, getPageStudioReleasePointer,
  resolvePageStudioDeliveryWorker, rollbackPageStudioRelease
} from './publishing'
import { PageStudioPublishingError } from './publishingError'
import { PageStudioReleaseActivationBody, PageStudioReleaseRollbackBody, PageStudioSiteId } from './schemas'
import { resolvePortalPageStudioSiteTenant } from './versions'

const activation = PageStudioReleaseActivationBody.extend({ environment: z.literal('production') })
const rollback = PageStudioReleaseRollbackBody.extend({ environment: z.literal('production') })

/** Invited portal publishers may promote retained approved static artifacts only.
 * Never accepts client-selected ownership, storage locations or provider credentials. */
export async function handlePortalPageStudioPublishing(event: H3Event, action: 'activate' | 'rollback') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    assertMethod(event, 'POST')
    const user = await requireClientAuth(event)
    if (getHeader(event, 'origin') !== getRequestURL(event).origin) {
      throw createError({ statusCode: 403, statusMessage: 'Same-origin website publication is required' })
    }
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const idempotencyKey = PageStudioIdempotencyKeySchema.safeParse(getHeader(event, 'idempotency-key'))
    if (!siteId.success || !idempotencyKey.success || !z.object({}).strict().safeParse(getQuery(event)).success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid website publication request' })
    }
    const raw = await readPageStudioJson(event, 2048, [
      'Website publication requires JSON', 'Website publication request is too large',
      'Website publication request is required', 'Invalid website publication body', 'Invalid website publication JSON'
    ])
    const parsed = (action === 'activate' ? activation : rollback).safeParse(raw)
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website publication request' })

    const tenantId = await resolvePortalPageStudioSiteTenant({ clientId: user.clientId, userId: user.id, siteId: siteId.data })
    const scope = { tenantId, clientId: user.clientId, siteId: siteId.data }
    const principal = await preparePortalPageStudioPublishPrincipal(event, { tenantId, user })
    const runTransaction: NonNullable<Parameters<typeof activatePageStudioRelease>[1]>['runTransaction'] = work =>
      withPortalPageStudioReleaseAuthority(scope, principal, parsed.data.hostname, work)
    // Avoid reading build details or contacting delivery until current authority passes.
    await runTransaction(async () => undefined)
    const actor = { actorId: user.id, actorRole: 'client' as const, scope, idempotencyKey: idempotencyKey.data }
    const worker = resolvePageStudioDeliveryWorker(event, 'production')
    if (action === 'activate') {
      const body = activation.parse(parsed.data)
      const build = await getPageStudioBuildPointer(scope, body.buildId)
      if (!build?.astro || build.astro.context.identity.environment !== 'production'
        || build.astro.context.identity.source.kind !== 'approved-version') {
        throw new PageStudioPublishingError('BUILD_NOT_PUBLISHABLE', 422, 'An approved production website build is required')
      }
      await worker.verifyBuild(build)
      return { release: await activatePageStudioRelease({ ...body, ...actor,
        expectedActiveReleaseId: body.expectedActiveReleaseId ?? null }, { runTransaction }) }
    }
    const body = rollback.parse(parsed.data)
    const target = await getPageStudioReleasePointer(scope, body.targetReleaseId)
    if (!target?.astro || target.environment !== 'production'
      || target.astro.context.identity.environment !== 'production'
      || target.astro.context.identity.source.kind !== 'approved-version') {
      throw new PageStudioPublishingError('ROLLBACK_TARGET_INVALID', 422, 'A previous approved production website release is required')
    }
    await worker.verifyRelease(target)
    return { release: await rollbackPageStudioRelease({ ...body, ...actor }, { runTransaction }) }
  } catch (error) {
    pageStudioHttpError(error)
  }
}
