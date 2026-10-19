import { describe, expect, it, vi } from 'vitest'
import { callCmsManagement } from '~~/server/utils/pageStudio/cmsManagementClient'
import { CmsManagementRequestSchema } from '~~/shared/pageStudio/cmsManagementContract'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'

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
