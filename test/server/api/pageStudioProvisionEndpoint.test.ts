import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'

const savedPlan = (starterVersion = 'limousine-v1') => createPageStudioSetupProposal({
  businessName: 'New business', starterVersion, setupSource: 'chat', setupBrief: 'Customer website'
})

const mocks = vi.hoisted(() => ({ requireClientAuth: vi.fn(), queryOne: vi.fn(), queryOneFresh: vi.fn() }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args) }))
vi.mock('~~/server/utils/db', () => ({ queryOne: (...args: unknown[]) => mocks.queryOne(...args), queryOneFresh: (...args: unknown[]) => mocks.queryOneFresh(...args) }))

const globals = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  getRouterParam: (event: { id?: string }, key: string) => string | undefined
  readBody: (event: { body?: unknown }) => Promise<unknown>
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
globals.eventHandler = handler => handler
globals.getRouterParam = (event, key) => {
  expect(key).toBe('siteId')
  return event.id
}
globals.readBody = async event => event.body
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)

describe('portal Page Studio provisioning handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireClientAuth.mockResolvedValue({ id: 'u1', clientId: 'c1', role: 'manager' })
  })

  it('retains only the accepted row business name, source, brief and revision', async () => {
    mocks.queryOneFresh.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 4, status: 'accepted', source: 'chat', brief: 'Our accepted florist brief', plan: savedPlan('floristry-v1') })
    const binding = { createProvisioning: vi.fn().mockImplementation(job => Promise.resolve(job)) }
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')
    await handler({ id: 'site_one', body: { expectedRevision: 4 }, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never)
    expect(binding.createProvisioning.mock.calls[0]?.[0].setup).toEqual({ businessName: 'New business', proposalRevision: 4, source: 'chat', brief: 'Our accepted florist brief' })
    expect(mocks.queryOneFresh.mock.calls[0]?.[0]).toContain('proposal.brief')
  })

  it('rejects a chat proposal without its retained brief before dispatch', async () => {
    mocks.queryOneFresh.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 1, status: 'accepted', source: 'chat', brief: null, plan: savedPlan() })
    const binding = { createProvisioning: vi.fn() }
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')
    await expect(handler({ id: 'site_one', body: { expectedRevision: 1 }, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never)).rejects.toMatchObject({ statusCode: 422 })
    expect(binding.createProvisioning).not.toHaveBeenCalled()
  })

  it('emits a stable scoped request only for an accepted revision', async () => {
    mocks.queryOneFresh.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 1, status: 'accepted', source: 'chat', brief: 'Customer website', plan: savedPlan() })
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')
    const binding = { createProvisioning: vi.fn().mockImplementation(job => Promise.resolve(job)) }
    await expect(handler({ id: 'site_one', body: { expectedRevision: 1 }, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never)).resolves.toEqual({ provisioning: expect.objectContaining({ requestKey: 'page-studio-site_one-1', scope: expect.objectContaining({ tenantId: 't1', clientId: 'c1', siteId: 'site_one' }), job: expect.objectContaining({ phase: 'requested' }) }) })
    expect(binding.createProvisioning).toHaveBeenCalledOnce()
    expect(binding.createProvisioning.mock.calls[0][0]).toEqual(expect.objectContaining({
      plan: { pages: savedPlan().pages, collections: savedPlan().collections, enabledModules: savedPlan().modules, templateId: 'limousine-v1', scope: { tenantId: 't1', clientId: 'c1', businessId: 'c1', siteId: 'site_one', environment: 'staging' } }
    }))
  })

  it.each(['floristry-v1', 'retail-v1', 'it-goods-v1', 'import-export-v1'])('preserves the reviewed %s template and modules', async (templateId) => {
    const plan = savedPlan(templateId)
    mocks.queryOneFresh.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 1, status: 'accepted', source: 'chat', brief: 'Customer website', plan })
    const binding = { createProvisioning: vi.fn().mockImplementation(job => Promise.resolve(job)) }
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')
    await handler({ id: 'site_one', body: { expectedRevision: 1 }, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never)
    const sent = binding.createProvisioning.mock.calls[0]![0]
    expect(sent.templateId).toBe(templateId)
    expect(sent.plan).toEqual({ templateId, enabledModules: plan.modules, pages: plan.pages, collections: plan.collections, scope: sent.scope })
  })

  it('rejects an unsupported saved template before invoking resource creation', async () => {
    mocks.queryOneFresh.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 1, status: 'accepted', source: 'chat', brief: 'Customer website', plan: savedPlan('unknown-template') })
    const binding = { createProvisioning: vi.fn() }
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')
    await expect(handler({ id: 'site_one', body: { expectedRevision: 1 }, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never)).rejects.toMatchObject({ statusCode: 422 })
    expect(binding.createProvisioning).not.toHaveBeenCalled()
  })

  it.each([
    { canProvision: false, pagesPerSiteLimit: 10 },
    { canProvision: true, pagesPerSiteLimit: 1 }
  ])('denies setup when the subscription or page allowance is insufficient: %j', async (limits) => {
    mocks.queryOneFresh.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 1, status: 'accepted', source: 'chat', brief: 'Customer website', plan: savedPlan(), ...limits })
    const binding = { createProvisioning: vi.fn() }
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')
    await expect(handler({ id: 'site_one', body: { expectedRevision: 1 }, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(binding.createProvisioning).not.toHaveBeenCalled()
  })

  it('rejects a proposal that has not been accepted', async () => {
    mocks.queryOneFresh.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 1, status: 'proposed', source: 'template', plan: {} })
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')
    await expect(handler({ id: 'site_one', body: { expectedRevision: 1 } } as never)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('fails explicitly when the provisioner binding is unavailable', async () => {
    mocks.queryOneFresh.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 1, status: 'accepted', source: 'template', plan: savedPlan('retail-v1') })
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')
    await expect(handler({ id: 'site_one', body: { expectedRevision: 1 }, context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('rejects a mismatched Worker response scope', async () => {
    mocks.queryOneFresh.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 1, status: 'accepted', source: 'template', plan: savedPlan('retail-v1') })
    const binding = { createProvisioning: vi.fn().mockResolvedValue({ requestKey: 'page-studio-site_one-1', scope: { tenantId: 'other', clientId: 'c1', businessId: 'c1', siteId: 'site_one', environment: 'staging' } }) }
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')
    await expect(handler({ id: 'site_one', body: { expectedRevision: 1 }, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never)).rejects.toMatchObject({ statusCode: 503 })
  })

  it.each(['missing', 'changed'])('rejects a %s setup snapshot in the Worker response', async (mode) => {
    mocks.queryOneFresh.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 1, status: 'accepted', source: 'template', plan: savedPlan('retail-v1') })
    const binding = { createProvisioning: vi.fn().mockImplementation(job => Promise.resolve({ ...job, setup: mode === 'missing' ? undefined : { ...job.setup, businessName: 'Another business' } })) }
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')
    await expect(handler({ id: 'site_one', body: { expectedRevision: 1 }, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('requires fresh editor membership before starting resources for a site', async () => {
    const binding = { createProvisioning: vi.fn() }
    mocks.queryOneFresh.mockResolvedValue(null)
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')
    await expect(handler({ id: 'site_one', body: { expectedRevision: 1 }, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never))
      .rejects.toMatchObject({ statusCode: 404 })
    expect(binding.createProvisioning).not.toHaveBeenCalled()
    expect(mocks.queryOne).not.toHaveBeenCalled()
    const [sql, params] = mocks.queryOneFresh.mock.calls[0]!
    expect(sql).toContain('membership.tenant_id = site.tenant_id')
    expect(sql).toContain('membership.client_id = site.client_id')
    expect(sql).toContain('membership.site_id = site.id')
    expect(sql).toContain('membership.user_id = $4')
    expect(sql).toContain('membership.role = \'editor\'')
    expect(params).toEqual(['c1', 'site_one', 1, 'u1'])
  })

  it('reports proposal and resumable provisioning status when the service is available', async () => {
    mocks.queryOne.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 2, status: 'accepted', source: 'chat' })
    const binding = {
      readProvisioning: vi.fn().mockResolvedValue({
        requestKey: 'page-studio-site_one-2',
        scope: { tenantId: 't1', clientId: 'c1', businessId: 'c1', siteId: 'site_one', environment: 'staging' },
        phase: 'resources-created',
        attempts: 1
      })
    }
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.get')
    await expect(handler({ id: 'site_one', context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never)).resolves.toEqual({
      proposal: { revision: 2, status: 'accepted', source: 'chat' },
      requestKey: 'page-studio-site_one-2',
      provisioning: expect.objectContaining({ phase: 'resources-created' }),
      serviceAvailable: true
    })
    expect(binding.readProvisioning).toHaveBeenCalledWith('page-studio-site_one-2', { tenantId: 't1', clientId: 'c1', businessId: 'c1', siteId: 'site_one', environment: 'staging' })
    expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringContaining('membership.user_id = $2'), ['c1', 'u1', 'site_one'])
  })

  it('returns a pending service state when the optional status binding is absent', async () => {
    mocks.queryOne.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 1, status: 'accepted', source: 'template' })
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.get')
    await expect(handler({ id: 'site_one', context: {} } as never)).resolves.toEqual({
      proposal: { revision: 1, status: 'accepted', source: 'template' },
      requestKey: 'page-studio-site_one-1',
      provisioning: null,
      serviceAvailable: false
    })
  })

  it('fails closed when provisioning status returns a foreign scope', async () => {
    mocks.queryOne.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 'site_one', canProvision: true, pagesPerSiteLimit: 20, revision: 1, status: 'accepted', source: 'template' })
    const binding = {
      readProvisioning: vi.fn().mockResolvedValue({
        requestKey: 'page-studio-site_one-1',
        scope: { tenantId: 'foreign', clientId: 'c1', businessId: 'c1', siteId: 'site_one', environment: 'staging' },
        phase: 'requested'
      })
    }
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.get')
    await expect(handler({ id: 'site_one', context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never)).rejects.toMatchObject({ statusCode: 503 })
  })
})
