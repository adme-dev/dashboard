import { createError, getRouterParam, setHeader, type H3Event } from 'h3'
import { PageStudioStagingRequestSchema, PageStudioStagingStateSchema } from '~~/shared/pageStudio/staging'
import { resolvePageStudioHttpActor } from './httpActor'
import { readPageStudioJson } from './boundedJson'

const errors: Record<string, number> = { STAGING_INVALID: 400, STAGING_ACCESS_DENIED: 403, STAGING_CHANGED: 409, STAGING_BUSY: 409, STAGING_BUILD_LIMIT: 429, STAGING_SERVICE_UNAVAILABLE: 503 }
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Staging is temporarily unavailable' })
export async function handlePageStudioStaging(event: H3Event, audience: 'agency' | 'portal', writing: boolean) {
  setHeader(event, 'cache-control', 'private, no-store')
  const trusted = await resolvePageStudioHttpActor(event, audience, writing)
  const actor = trusted.role === 'agency' ? { kind: 'agency', actorId: trusted.actorId, tenantId: trusted.tenantId } : { kind: 'portal', actorId: trusted.actorId, clientId: trusted.clientId }
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  const service = env?.PAGE_STUDIO_MANAGEMENT as { clientStaging?: (input: unknown) => Promise<unknown> } | undefined
  const body = writing ? await readPageStudioJson(event, 2048, ['Staging request must be JSON', 'Staging request exceeds the size limit', 'Staging request is required', 'Invalid staging request', 'Invalid staging JSON']) : undefined
  const parsed = PageStudioStagingRequestSchema.safeParse({ actor, siteId: getRouterParam(event, 'siteId'), expectedEnvironment: env?.PAGE_STUDIO_RELEASE_ENVIRONMENT,
    ...(writing ? { operation: 'update', body } : { operation: 'read' }) })
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid staging request' })
  if (typeof service?.clientStaging !== 'function') throw unavailable()
  const input = parsed.data
  let result: unknown
  try {
    result = await service.clientStaging(input)
  } catch {
    throw unavailable()
  }
  if (!result || typeof result !== 'object') throw unavailable()
  const response = result as Record<string, unknown>
  if (response.ok === false) {
    const error = response.error as Record<string, unknown> | undefined
    if (!error || typeof error.code !== 'string' || !Object.hasOwn(errors, error.code) || error.statusCode !== errors[error.code]) throw unavailable()
    throw createError({ statusCode: errors[error.code], statusMessage: error.code === 'STAGING_BUILD_LIMIT' ? 'The monthly website build allowance has been reached' : error.code === 'STAGING_ACCESS_DENIED' ? 'Staging access is not active' : error.code === 'STAGING_CHANGED' ? 'Saved website changed. Refresh and try again.' : error.code === 'STAGING_BUSY' ? 'A staging update is already in progress' : 'Staging is temporarily unavailable', data: { code: error.code } })
  }
  if (response.ok !== true || response.operation !== input.operation || response.siteId !== input.siteId || response.environment !== input.expectedEnvironment
    || response.actorKind !== actor.kind || response.scopeId !== (trusted.role === 'agency' ? trusted.tenantId : trusted.clientId)) throw unavailable()
  const value = PageStudioStagingStateSchema.safeParse(response.value)
  if (!value.success || value.data.siteId !== input.siteId) throw unavailable()
  return value.data
}
