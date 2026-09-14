import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callDomainManagement } from '../../server/utils/pageStudio/domainManagementClient'
import { handleDomainManagement } from '../../workers/page-studio-management/src/domainManagement'
import { domainPublicMessage } from '../../shared/pageStudio/domainManagement'

const siteId = '10000000-0000-4000-8000-000000000001'
const domainId = '20000000-0000-4000-8000-000000000001'
const actor = { kind: 'portal' as const, actorId: '30000000-0000-4000-8000-000000000001', clientId: '40000000-0000-4000-8000-000000000001' }
const request = { operation: 'attach', actor, siteId, hostname: 'customer.example' }
const success = () => ({ ok: true, operation: 'attach', siteId, environment: 'staging', actorKind: 'portal', scopeId: actor.clientId, value: { id: domainId } })
function setup(result: unknown = success()) {
  const domains = vi.fn().mockResolvedValue(result)
  return { domains, event: { context: { cloudflare: { env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', PAGE_STUDIO_MANAGEMENT: { domains } } } } } }
}
const unavailable = { code: 'DOMAIN_SERVICE_UNAVAILABLE', statusCode: 503, message: domainPublicMessage('DOMAIN_SERVICE_UNAVAILABLE') }
beforeEach(() => vi.restoreAllMocks())
describe('Pages private domain transport', () => {
  it('sends only checked scope and preserves a successful retained domain identity', async () => {
    const { event, domains } = setup()
    expect(await callDomainManagement(event as never, request)).toEqual({ id: domainId })
    expect(domains).toHaveBeenCalledExactlyOnceWith({ ...request, expectedEnvironment: 'staging' })
  })
  it.each([null, {}, { ...success(), extra: true }, { ...success(), siteId: domainId }, { ...success(), actorKind: 'agency' }, { ...success(), scopeId: domainId }, { ...success(), environment: 'production' }, { ...success(), operation: 'verify' }, { ...success(), value: { id: domainId, providerToken: 'secret' } }])('rejects malformed, foreign and extra response fields', async (result) => {
    const { event } = setup(result)
    await expect(callDomainManagement(event as never, request)).rejects.toMatchObject(unavailable)
  })
  it('rejects wrong nested site identity from a read response', async () => {
    const { event } = setup({ ...success(), operation: 'list', value: { siteId: domainId, canManage: true, domains: [] } })
    await expect(callDomainManagement(event as never, { operation: 'list', actor, siteId })).rejects.toMatchObject(unavailable)
  })
  it('rejects a verification receipt for another domain', async () => {
    const { event } = setup({ ...success(), operation: 'verify', value: { id: siteId } })
    await expect(callDomainManagement(event as never, { operation: 'verify', actor, siteId, domainId })).rejects.toMatchObject(unavailable)
  })
  it.each([
    { code: 'DOMAIN_ACCESS_DENIED', statusCode: 500, message: domainPublicMessage('DOMAIN_ACCESS_DENIED') },
    { code: 'DOMAIN_ACCESS_DENIED', statusCode: 403, message: 'provider-token-secret' },
    { code: 'UNRECOGNIZED', statusCode: 503, message: 'secret' },
    { code: 'DOMAIN_ACCESS_DENIED', statusCode: 403, message: domainPublicMessage('DOMAIN_ACCESS_DENIED'), stack: 'secret' }
  ])('rejects untrusted error bodies instead of reflecting provider text', async (error) => {
    await expect(callDomainManagement(setup({ ok: false, error }).event as never, request)).rejects.toMatchObject(unavailable)
  })
  it('preserves a recognized safe business conflict without replay', async () => {
    const error = { code: 'DOMAIN_CHANGED', statusCode: 409, message: domainPublicMessage('DOMAIN_CHANGED') }
    const { event, domains } = setup({ ok: false, error })
    await expect(callDomainManagement(event as never, request)).rejects.toMatchObject(error)
    expect(domains).toHaveBeenCalledOnce()
  })
  it('does not retry an uncertain provider mutation after RPC loss', async () => {
    const { event, domains } = setup()
    domains.mockRejectedValue(new Error('private-credentials'))
    await expect(callDomainManagement(event as never, request)).rejects.toMatchObject(unavailable)
    expect(domains).toHaveBeenCalledOnce()
  })
  it.each([{ ...request, token: 'caller-token' }, { ...request, actor: { ...actor, tenantId: 'caller-tenant' } }, { ...request, actor: { ...actor, canEdit: true } }])('rejects caller authority/config extras before invoking the service', async (input) => {
    const { event, domains } = setup()
    await expect(callDomainManagement(event as never, input)).rejects.toMatchObject(unavailable)
    expect(domains).not.toHaveBeenCalled()
  })
})
describe('private domain Worker guards', () => {
  const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', HYPERDRIVE_FRESH: { connectionString: 'never-used' } }
  it.each([null, {}, { ...request, expectedEnvironment: 'staging', extra: true }, { ...request, expectedEnvironment: 'staging', actor: { ...actor, tenantId: 'foreign' } }, { ...request, expectedEnvironment: 'staging', actor: { ...actor, kind: 'visitor' } }, { ...request, expectedEnvironment: 'staging', hostname: 'https://localhost' }])('denies invalid input before database or provider execution', async (input) => {
    const transaction = vi.fn()
    expect(await handleDomainManagement(input, env, transaction)).toEqual({ ok: false, error: { code: 'DOMAIN_INVALID', statusCode: 400, message: domainPublicMessage('DOMAIN_INVALID') } })
    expect(transaction).not.toHaveBeenCalled()
  })
  it.each([{}, { ...env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }])('denies wrong environment/missing fresh binding before DB', async (environment) => {
    const transaction = vi.fn()
    expect(await handleDomainManagement({ ...request, expectedEnvironment: 'staging' }, environment, transaction)).toEqual({ ok: false, error: unavailable })
    expect(transaction).not.toHaveBeenCalled()
  })
  it('returns a fixed error on transaction loss without any automatic retry or raw logging', async () => {
    const transaction = vi.fn().mockRejectedValue(new Error('postgresql://private-password'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await handleDomainManagement({ ...request, expectedEnvironment: 'staging' }, env, transaction)).toEqual({ ok: false, error: unavailable })
    expect(transaction).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: 'page_studio_domain_management_failure', operation: 'attach', environment: 'staging' }))
  })
})
