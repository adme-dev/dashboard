import type { H3Event } from 'h3'
import { DomainManagementRequestSchema, DomainAggregateRecordSchema, DomainListSchema, DomainIdentitySchema, DomainVerificationSchema, DomainErrorStatuses, domainPublicMessage, type DomainManagementActor, type DomainManagementRequest } from '~~/shared/pageStudio/domainManagement'
import { PageStudioSiteOperationError } from './siteOperations'

const exact = (value: object, keys: string) => Object.keys(value).sort().join(',') === keys
const unavailable = () => new PageStudioSiteOperationError('DOMAIN_SERVICE_UNAVAILABLE', 503, domainPublicMessage('DOMAIN_SERVICE_UNAVAILABLE'))
export async function callDomainManagement(event: H3Event, request: Omit<DomainManagementRequest, 'expectedEnvironment'> | Record<string, unknown>) {
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  const service = env?.PAGE_STUDIO_MANAGEMENT as { domains?: (input: unknown) => Promise<unknown> } | undefined
  const parsed = DomainManagementRequestSchema.safeParse({ ...request, expectedEnvironment: env?.PAGE_STUDIO_RELEASE_ENVIRONMENT })
  if (!parsed.success || typeof service?.domains !== 'function') throw unavailable()
  const input = parsed.data
  let result: unknown
  try {
    result = await service.domains(input)
  } catch {
    throw unavailable()
  }
  if (!result || typeof result !== 'object') throw unavailable()
  const response = result as Record<string, unknown>
  if (response.ok === false) {
    const error = response.error as Record<string, unknown> | undefined
    if (!exact(response, 'error,ok') || !error || typeof error !== 'object' || !exact(error, 'code,message,statusCode') || typeof error.code !== 'string'
      || !Object.hasOwn(DomainErrorStatuses, error.code) || error.statusCode !== DomainErrorStatuses[error.code] || error.message !== domainPublicMessage(error.code)) throw unavailable()
    throw new PageStudioSiteOperationError(error.code, DomainErrorStatuses[error.code], domainPublicMessage(error.code))
  }
  if (!exact(response, 'actorKind,environment,ok,operation,scopeId,siteId,value') || response.ok !== true || response.operation !== input.operation || response.environment !== input.expectedEnvironment
    || response.actorKind !== input.actor.kind || response.scopeId !== (input.actor.kind === 'agency' ? input.actor.tenantId : input.actor.clientId)
    || response.siteId !== ('siteId' in input ? input.siteId : null)) throw unavailable()
  if (input.operation === 'aggregate') {
    const values = DomainAggregateRecordSchema.array().max(200).safeParse(response.value)
    if (!values.success) throw unavailable()
    return values.data
  }
  if (input.operation === 'list') {
    const value = DomainListSchema.safeParse(response.value)
    if (!value.success || value.data.siteId !== input.siteId) throw unavailable()
    return value.data
  }
  const value = (input.operation === 'verify' && input.actor.kind === 'agency' ? DomainVerificationSchema : DomainIdentitySchema).safeParse(response.value)
  if (!value.success || (input.operation === 'verify' && value.data.id !== input.domainId)) throw unavailable()
  return value.data
}
type ScopedInput = { event: H3Event, siteId: string, actorId: string } & ({ kind: 'agency', tenantId: string } | { kind: 'portal', clientId: string })
const actorOf = (input: ScopedInput): DomainManagementActor => input.kind === 'agency'
  ? { kind: 'agency', actorId: input.actorId, tenantId: input.tenantId }
  : { kind: 'portal', actorId: input.actorId, clientId: input.clientId }
export const attachPageStudioDomain = (input: ScopedInput & { hostname: string }) => callDomainManagement(input.event, { operation: 'attach', actor: actorOf(input), siteId: input.siteId, hostname: input.hostname })
export const refreshPageStudioDomain = (input: ScopedInput & { domainId: string }) => callDomainManagement(input.event, { operation: 'verify', actor: actorOf(input), siteId: input.siteId, domainId: input.domainId })
export const listPageStudioDomains = (input: ScopedInput) => callDomainManagement(input.event, { operation: 'list', actor: actorOf(input), siteId: input.siteId })
export const listAgencyPageStudioDomains = (tenantId: string, actorId: string, event: H3Event) => callDomainManagement(event, { operation: 'aggregate', actor: { kind: 'agency', tenantId, actorId } })
export const listPortalPageStudioDomains = (clientId: string, actorId: string, event: H3Event) => callDomainManagement(event, { operation: 'aggregate', actor: { kind: 'portal', clientId, actorId } })
