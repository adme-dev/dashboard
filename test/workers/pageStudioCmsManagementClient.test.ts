import { describe, expect, it, vi } from 'vitest'
import { callCmsManagement } from '~~/server/utils/pageStudio/cmsManagementClient'
import { CmsManagementRequestSchema } from '~~/shared/pageStudio/cmsManagementContract'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { CUSTOMER_EDITOR_CAPABILITIES } from '~~/server/utils/pageStudio/customerEditorToken'

const id = '10000000-0000-4000-8000-000000000001'
const value = { phase: 'idle', adoptionId: null, progress: null, recoveryId: null,
  recoveryRequired: false, recoveryReason: null, receiptDigest: null, application: null, progressDigest: 'a'.repeat(64) }
function setup() {
  const service = { cmsAuthoring: vi.fn(async (request: unknown) => ({ ok: true, requestDigest: await collectionDigest(request), value })) }
  const principal = { source: 'native-login' as const, request: {
    actor: { role: 'agency' as const, actorId: id, tenantId: 'test-tenant', canEdit: true }, siteId: id,
    login: { role: 'agency' as const, userId: id, tokenHash: 'b'.repeat(64), issuedAt: new Date('2026-10-16T00:00:00Z'), expiresAt: new Date('2026-10-17T00:00:00Z') },
    env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_MANAGEMENT: service }
  } }
  return { service, principal }
}
describe('private CMS authoring transport', () => {
  it('sends the exact original principal and configured environment without bindings', async () => {
    const { service, principal } = setup()
    expect(await callCmsManagement('adoption', { action: 'status' }, principal)).toEqual(value)
    const request = CmsManagementRequestSchema.parse(service.cmsAuthoring.mock.calls[0]![0])
    if (request.principal.source !== 'native-login') throw new Error('Expected native principal')
    expect(request.expectedEnvironment).toBe('production')
    expect(request.contentEnvironment).toBe('staging')
    expect(request.principal.request.login.tokenHash).toBe(principal.request.login.tokenHash)
    expect(request.principal.request).not.toHaveProperty('env')
    expect(service.cmsAuthoring).toHaveBeenCalledOnce()
  })
  it.each([undefined, false, true])('preserves native login wire fields and optional collectionAccess=%s', async (collectionAccess) => {
    const { service, principal } = setup()
    Object.assign(principal.request, { collectionAccess, ignored: 'not-on-wire' })
    expect(await callCmsManagement('adoption', { action: 'status' }, principal)).toEqual(value)
    expect(service.cmsAuthoring.mock.calls[0]![0]).toEqual({ operation: 'adoption', body: { action: 'status' },
      expectedEnvironment: 'production', contentEnvironment: 'staging', principal: { source: 'native-login', request: {
        actor: principal.request.actor, siteId: id, ...(collectionAccess === undefined ? {} : { collectionAccess }),
        login: { role: 'agency', userId: id, tokenHash: 'b'.repeat(64), issuedAt: '2026-10-16T00:00:00.000Z', expiresAt: '2026-10-17T00:00:00.000Z' }
      } } })
  })
  it('redacts serialization failures before any private call', async () => {
    const { service, principal } = setup()
    principal.request.login.issuedAt = new Date(Number.NaN)
    await expect(callCmsManagement('adoption', { action: 'status' }, principal)).rejects.toMatchObject({ code: 'CMS_MANAGEMENT_UNAVAILABLE', statusCode: 503 })
    expect(service.cmsAuthoring).not.toHaveBeenCalled()
  })
  it('rejects a result for a mutated request without retrying', async () => {
    const { service, principal } = setup()
    service.cmsAuthoring.mockImplementation(async (input: unknown) => {
      const request = CmsManagementRequestSchema.parse(input)
      if (request.principal.source !== 'native-login') throw new Error('Expected native principal')
      request.principal.request.siteId = '20000000-0000-4000-8000-000000000001'
      return { ok: true, requestDigest: await collectionDigest(request), value }
    })
    await expect(callCmsManagement('adoption', { action: 'start' }, principal)).rejects.toMatchObject({ statusCode: 503 })
    expect(service.cmsAuthoring).toHaveBeenCalledOnce()
  })
  it('captures the service method and receiver before asynchronous hashing', async () => {
    const { service, principal } = setup()
    const original = vi.fn(async function (this: unknown, request: unknown) {
      expect(this).toBe(service)
      return { ok: true, requestDigest: await collectionDigest(request), value }
    })
    service.cmsAuthoring = original
    const pending = callCmsManagement('adoption', { action: 'status' }, principal)
    expect(original).not.toHaveBeenCalled() // The digest await still precedes the captured RPC.
    service.cmsAuthoring = vi.fn().mockRejectedValue(new Error('Replaced method'))
    expect(await pending).toEqual(value)
    expect(original).toHaveBeenCalledOnce()
    expect(service.cmsAuthoring).not.toHaveBeenCalled()
  })
  it('does not fall back or replay an uncertain mutation', async () => {
    const { service, principal } = setup()
    service.cmsAuthoring.mockRejectedValue(new Error('private database detail'))
    await expect(callCmsManagement('adoption', { action: 'start' }, principal)).rejects.toMatchObject({ statusCode: 503 })
    expect(service.cmsAuthoring).toHaveBeenCalledOnce()
    principal.request.env.PAGE_STUDIO_MANAGEMENT = undefined as never
    await expect(callCmsManagement('adoption', { action: 'status' }, principal)).rejects.toMatchObject({ statusCode: 503 })
    expect(service.cmsAuthoring).toHaveBeenCalledOnce()
  })
  it('rejects extra response fields', async () => {
    const { service, principal } = setup()
    service.cmsAuthoring.mockImplementation(async request => ({ ok: true, requestDigest: await collectionDigest(request), value: { ...value, secret: true } }))
    await expect(callCmsManagement('adoption', { action: 'status' }, principal)).rejects.toMatchObject({ statusCode: 503 })
  })
})

const statusUrl = 'https://page-studio-management.internal/customer-cms-adoption-status'
function customer() {
  const fetch = vi.fn(async (request: Request) => {
    expect(request.url).toBe(statusUrl)
    expect(request.method).toBe('POST')
    const input = await request.json(), requestDigest = await collectionDigest(input)
    return Response.json({ ok: true, requestDigest, value }, { headers: { 'x-request-digest': requestDigest } })
  })
  const cmsAuthoring = vi.fn(async (input: unknown) => ({ ok: true, requestDigest: await collectionDigest(input), value }))
  const binding = { fetch, cmsAuthoring }
  const principal = { source: 'customer-session' as const, capability: 'workspace:create' as const,
    claims: { role: 'customer' as const, environment: 'staging' as const, nonce: id, userId: id, workspaceId: id,
      clientId: id, siteId: id, tenantId: 'native', capabilities: [...CUSTOMER_EDITOR_CAPABILITIES],
      issuedAt: 1700000000, expiresAt: 1700000900, editorOrigin: 'https://studio-customer-preview.xeroflow.io', returnUrl: 'https://app.xeroflow.io/studio/dashboard' },
    env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_MANAGEMENT: binding } }
  return { principal, binding, fetch, cmsAuthoring }
}
describe('native customer adoption status placement', () => {
  it.each(['workspace:create', 'cms:adopt'])('uses fetch for %s without requiring an RPC method', async (capability) => {
    const f = customer()
    if (capability === 'cms:adopt') Object.assign(f.principal, { capability, claims: { ...f.principal.claims, capabilities: ['cms:prepare', 'cms:adopt'] } })
    delete (f.binding as Partial<typeof f.binding>).cmsAuthoring
    expect(await callCmsManagement('adoption', { action: 'status' }, f.principal)).toEqual(value)
    expect(f.fetch).toHaveBeenCalledOnce()
    expect(f.cmsAuthoring).not.toHaveBeenCalled()
  })
  it('captures the fetch receiver and detached claims before hashing', async () => {
    const f = customer(), original = vi.fn(async function (this: unknown, request: Request) {
      expect(this).toBe(f.binding)
      const input = await request.json() as { principal: { claims: { siteId: string } } }
      expect(input.principal.claims.siteId).toBe(id)
      const requestDigest = await collectionDigest(input)
      return Response.json({ ok: true, requestDigest, value }, { headers: { 'x-request-digest': requestDigest } })
    })
    f.binding.fetch = original
    const pending = callCmsManagement('adoption', { action: 'status' }, f.principal)
    f.principal.claims.siteId = '20000000-0000-4000-8000-000000000001'
    f.binding.fetch = vi.fn().mockRejectedValue(new Error('Replaced method'))
    expect(await pending).toEqual(value)
    expect(original).toHaveBeenCalledOnce()
    expect(f.binding.fetch).not.toHaveBeenCalled()
  })
  it.each(['start', 'advance', 'recover', 'shared-staging', 'destination', 'checkpoint-capability'])('retains captured RPC for %s', async (kind) => {
    const f = customer()
    let body: unknown = { action: 'status' }
    if (kind === 'start') body = { action: 'start' }
    if (kind === 'advance') body = { action: 'advance', adoptionId: 'adoption_fixture', expectedProgressDigest: 'a'.repeat(64) }
    if (kind === 'recover') body = { action: 'recover', adoptionId: 'adoption_fixture', recoveryId: 'recovery_fixture', expectedRecoveryId: null }
    if (kind === 'shared-staging') f.principal.env.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'staging'
    if (kind === 'destination') {
      f.principal.env.PAGE_STUDIO_CONTENT_ENVIRONMENT = 'production'
      Object.assign(f.principal.claims, { environment: 'production' })
    }
    if (kind === 'checkpoint-capability') Object.assign(f.principal, { capability: 'workspace:checkpoint' })
    expect(await callCmsManagement('adoption', body, f.principal)).toEqual(value)
    expect(f.cmsAuthoring).toHaveBeenCalledOnce()
    expect(f.fetch).not.toHaveBeenCalled()
  })
  it.each(['missing', 'throw', 'header', 'inner', 'extra', 'oversized', 'redirect'])('rejects %s without RPC fallback or secret disclosure', async (failure) => {
    const f = customer()
    f.binding.fetch = vi.fn(async (request: Request) => {
      if (failure === 'throw') throw new Error('synthetic-private-error')
      const digest = await collectionDigest(await request.json())
      return new Response(failure === 'oversized' ? ' '.repeat(16385) : JSON.stringify({ ok: true,
        requestDigest: failure === 'inner' ? 'b'.repeat(64) : digest, value: failure === 'extra' ? { ...value, private: 'synthetic-private-error' } : value }),
      { status: failure === 'redirect' ? 302 : 200, headers: { 'x-request-digest': failure === 'header' ? 'b'.repeat(64) : digest } })
    })
    if (failure === 'missing') delete (f.binding as Partial<typeof f.binding>).fetch
    const error = await callCmsManagement('adoption', { action: 'status' }, f.principal).catch(error => error)
    expect(error).toMatchObject({ code: 'CMS_MANAGEMENT_UNAVAILABLE', statusCode: 503 })
    expect(String(error)).not.toContain('synthetic-private-error')
    expect(f.cmsAuthoring).not.toHaveBeenCalled()
    if (failure !== 'missing') expect(f.binding.fetch).toHaveBeenCalledOnce()
  })
  it.each([['CMS_AUTHORITY_BUSY', 503], ['CMS_AUTHORITY_DENIED', 403], ['CMS_ADOPTION_CONFLICT', 409]] as const)('retains typed %s responses', async (code, statusCode) => {
    const f = customer()
    f.binding.fetch = vi.fn(async (request: Request) => {
      const requestDigest = await collectionDigest(await request.json())
      return Response.json({ ok: false, requestDigest, error: { code, statusCode, message: 'Safe typed result.' } }, { headers: { 'x-request-digest': requestDigest } })
    })
    await expect(callCmsManagement('adoption', { action: 'status' }, f.principal)).rejects.toMatchObject({ code, statusCode, message: 'Safe typed result.' })
    expect(f.binding.fetch).toHaveBeenCalledOnce()
    expect(f.cmsAuthoring).not.toHaveBeenCalled()
  })
})
