import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizePageStudioProvisioning } from '~~/server/utils/pageStudio/provisioningAuthority'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'
import { dispatchPageStudioProvisioning } from '~~/server/utils/pageStudio/provisioningBinding'

const mocks = vi.hoisted(() => ({ queryOneFresh: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: (...args: unknown[]) => mocks.queryOneFresh(...args) }))
const scope = { businessId: '20000000-0000-4000-8000-000000000201', clientId: '20000000-0000-4000-8000-000000000201', siteId: '50000000-0000-4000-8000-000000000201', tenantId: 'tenant_page_studio_staging', environment: 'staging' as const }
const userId = '30000000-0000-4000-8000-000000000201'
const request = { requestKey: `page-studio-${scope.siteId}-1`, scope }
const plan = createPageStudioSetupProposal({ businessName: 'Synthetic Flowers', starterVersion: 'floristry-v1', setupSource: 'template' })
const row = () => ({ ...scope, userId, revision: 1, status: 'accepted', source: 'template', brief: null, plan, canProvision: true, pagesPerSiteLimit: 10, planMetadata: { allowedModules: plan.modules } })
const job = () => dispatchPageStudioProvisioning({ readProvisioning: async () => null, createProvisioning: async value => value }, { ...request, initiatingUserId: userId, plan, revision: 1, source: 'template', now: '2026-09-09T00:00:00.000Z' })

describe('live provisioning authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryOneFresh.mockResolvedValue(row())
  })

  it('rereads the persisted owner and current proposal before authorizing', async () => {
    const saved = await job()
    const binding = { createProvisioning: vi.fn(), readProvisioning: vi.fn().mockResolvedValue(saved) }
    await expect(authorizePageStudioProvisioning(binding, request)).resolves.toEqual({ job: saved, userId })
    expect(binding.readProvisioning).toHaveBeenCalledWith(request.requestKey, scope)
    expect(binding.createProvisioning).not.toHaveBeenCalled()
    expect(mocks.queryOneFresh.mock.calls[0][1]).toEqual([scope.tenantId, scope.clientId, scope.siteId, userId])
  })

  it('preserves generation version 2 in fresh authority without changing the accepted plan', async () => {
    const saved = { ...await job(), generationVersion: 2 }
    const binding = { createProvisioning: vi.fn(), readProvisioning: vi.fn().mockResolvedValue(saved) }
    await expect(authorizePageStudioProvisioning(binding, request)).resolves.toEqual({ job: saved, userId })
    expect(binding.createProvisioning).not.toHaveBeenCalled()
    mocks.queryOneFresh.mockResolvedValueOnce({ ...row(), canProvision: false })
    await expect(authorizePageStudioProvisioning(binding, request)).rejects.toMatchObject({ code: 'PROVISIONING_AUTHORITY_DENIED' })
  })

  it('rejects unsupported generation versions before database access', async () => {
    const saved = { ...await job(), generationVersion: 3 }
    await expect(authorizePageStudioProvisioning({ createProvisioning: vi.fn(), readProvisioning: async () => saved }, request)).rejects.toMatchObject({ code: 'PROVISIONER_FAILED' })
    expect(mocks.queryOneFresh).not.toHaveBeenCalled()
  })

  it.each([
    null,
    { ...row(), status: 'proposed' },
    { ...row(), revision: 2 },
    { ...row(), canProvision: false },
    { ...row(), pagesPerSiteLimit: 1 },
    { ...row(), planMetadata: { allowedModules: ['business-content'] } },
    { ...row(), planMetadata: { allowedModules: 'all' } },
    { ...row(), plan: { ...plan, businessName: 'Changed business' } },
    { ...row(), plan: { ...plan, pages: ['changed'] } }
  ])('denies absent authority or changed reviewed context: %j', async (current) => {
    const saved = await job()
    mocks.queryOneFresh.mockResolvedValue(current)
    await expect(authorizePageStudioProvisioning({ createProvisioning: vi.fn(), readProvisioning: async () => saved }, request)).rejects.toMatchObject({ code: 'PROVISIONING_AUTHORITY_DENIED', statusCode: 403 })
  })

  it.each([
    ['failed', 'PROVISIONING_AUTHORITY_DENIED', 403],
    ['complete', 'PROVISIONING_AUTHORITY_DENIED', 403],
    ['ownerless', 'PROVISIONING_OWNER_REQUIRED', 409],
    ['foreign', 'PROVISIONER_FAILED', 503],
    ['wrong-id', 'PROVISIONING_AUTHORITY_DENIED', 403]
  ])('rejects a %s stored job before database access', async (mode, code, statusCode) => {
    const saved = await job()
    const changed = mode === 'ownerless' ? { ...saved, actor: undefined } : mode === 'foreign' ? { ...saved, scope: { ...scope, tenantId: 'other' } } : mode === 'wrong-id' ? { ...saved, id: 'unrelated-job' } : { ...saved, phase: mode }
    await expect(authorizePageStudioProvisioning({ createProvisioning: vi.fn(), readProvisioning: async () => changed }, request)).rejects.toMatchObject({ code, statusCode })
    expect(mocks.queryOneFresh).not.toHaveBeenCalled()
  })

  it('does not expose database failures as an authorization result', async () => {
    const saved = await job()
    mocks.queryOneFresh.mockRejectedValueOnce(new Error('private database detail'))
    await expect(authorizePageStudioProvisioning({ createProvisioning: vi.fn(), readProvisioning: async () => saved }, request)).rejects.toMatchObject({ code: 'PROVISIONER_FAILED', statusCode: 503, message: 'Provisioning authority could not be verified' })
  })

  it('does not treat an unavailable coordinator as a missing job', async () => {
    await expect(authorizePageStudioProvisioning(undefined, request)).rejects.toMatchObject({ code: 'PROVISIONER_UNAVAILABLE', statusCode: 503 })
    await expect(authorizePageStudioProvisioning({ createProvisioning: vi.fn(), readProvisioning: async () => null }, request)).rejects.toMatchObject({ code: 'PROVISIONING_NOT_FOUND', statusCode: 404 })
    expect(mocks.queryOneFresh).not.toHaveBeenCalled()
  })

  it('rejects supplied actor data or foreign business identity before service access', async () => {
    const binding = { createProvisioning: vi.fn(), readProvisioning: vi.fn() }
    for (const input of [{ ...request, userId }, { ...request, scope: { ...scope, businessId: 'other' } }]) {
      await expect(authorizePageStudioProvisioning(binding, input)).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(binding.readProvisioning).not.toHaveBeenCalled()
  })
})
