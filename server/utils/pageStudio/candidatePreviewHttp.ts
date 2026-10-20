import { createError, getHeader, getQuery, getRouterParam, type H3Event } from 'h3'
import { z } from 'zod'
import { PageStudioHostnameSchema } from './delivery'
import { PageStudioIdempotencyKeySchema } from './controlSchemas'
import { PageStudioSiteId } from './schemas'
import { readPageStudioJson } from './boundedJson'
import { resolveAstroBuildServices } from './astroBuildHttp'
import { resolvePageStudioSessionEnvironment } from './sessions'

const Body = z.object({ environment: z.literal('production') }).strict()
/** Shared syntax only; each route retains its own authentication and authority. */
export async function readCandidatePreviewRequest(event: H3Event) {
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
  return { siteId: siteId.data, versionId: versionId.data, key: key.data }
}

/** Called only after the route's unchanged initial publication authority check. */
export function candidatePreviewConfiguration(event: H3Event) {
  const hostname = PageStudioHostnameSchema.safeParse(event.context.cloudflare?.env?.PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME)
  if (!hostname.success || hostname.data.length > 196) {
    throw createError({ statusCode: 503, statusMessage: 'Approved website preview is not configured' })
  }
  const { environment, services } = resolveAstroBuildServices(event)
  if (environment !== 'production') {
    throw createError({ statusCode: 409, statusMessage: 'Production website preview is not configured in this environment' })
  }
  const signing = resolvePageStudioSessionEnvironment(event)
  return { hostname: hostname.data, environment, services, signing }
}
