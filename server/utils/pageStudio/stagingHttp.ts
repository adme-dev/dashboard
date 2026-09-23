import { createError, getRouterParam, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { PageStudioStagingRequestSchema, PageStudioStagingStateSchema } from '~~/shared/pageStudio/staging'
import { resolvePageStudioHttpActor } from './httpActor'
import { readPageStudioJson } from './boundedJson'

const errors: Record<string, number> = { STAGING_INVALID: 400, STAGING_ACCESS_DENIED: 403, STAGING_CHANGED: 409, STAGING_BUSY: 409, STAGING_BUILD_LIMIT: 429, STAGING_SERVICE_UNAVAILABLE: 503 }
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Staging is temporarily unavailable' })
const EnsureBody = z.object({}).strict()
export async function handlePageStudioStaging(event: H3Event, audience: 'agency' | 'portal', operation: 'read' | 'update' | 'ensure') {
  setHeader(event, 'cache-control', 'private, no-store')
  const writing = operation !== 'read'
  const trusted = await resolvePageStudioHttpActor(event, audience, writing)
  const actor = trusted.role === 'agency' ? { kind: 'agency', actorId: trusted.actorId, tenantId: trusted.tenantId } : { kind: 'portal', actorId: trusted.actorId, clientId: trusted.clientId }
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  const body = writing ? await readPageStudioJson(event, 2048, ['Staging request must be JSON', 'Staging request exceeds the size limit', 'Staging request is required', 'Invalid staging request', 'Invalid staging JSON']) : undefined
  if (operation === 'ensure' && !EnsureBody.safeParse(body).success) throw createError({ statusCode: 400, statusMessage: 'Initial staging request must be empty' })
  const parsed = PageStudioStagingRequestSchema.safeParse({ actor, siteId: getRouterParam(event, 'siteId'), expectedEnvironment: env?.PAGE_STUDIO_RELEASE_ENVIRONMENT,
    operation, ...(operation === 'update' ? { body } : {}) })
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid staging request' })
  return requestPageStudioStaging(event, parsed.data)
}

/** Trusted native callers share the same strict request and response boundary. */
export async function requestPageStudioStaging(event: H3Event, raw: unknown) {
  const parsed = PageStudioStagingRequestSchema.safeParse(raw)
  if (!parsed.success) throw unavailable()
  const input = parsed.data
  const actor = input.actor
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  if (input.expectedEnvironment !== env?.PAGE_STUDIO_RELEASE_ENVIRONMENT) throw unavailable()
  const service = env?.PAGE_STUDIO_MANAGEMENT as { clientStaging?: (input: unknown) => Promise<unknown> } | undefined
  if (typeof service?.clientStaging !== 'function') throw unavailable()
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
    || response.actorKind !== actor.kind || response.scopeId !== (actor.kind === 'agency' ? actor.tenantId : actor.clientId)) throw unavailable()
  const value = PageStudioStagingStateSchema.safeParse(response.value)
  if (!value.success || value.data.siteId !== input.siteId) throw unavailable()
  return value.data
}
