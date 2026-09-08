import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireClientAuth: vi.fn(), queryOne: vi.fn() }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args) }))
vi.mock('~~/server/utils/db', () => ({ queryOne: (...args: unknown[]) => mocks.queryOne(...args) }))

const globals = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  getRouterParam: (event: { id?: string }) => string | undefined
  readBody: (event: { body?: unknown }) => Promise<unknown>
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
globals.eventHandler = handler => handler
globals.getRouterParam = event => event.id
globals.readBody = async event => event.body
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)

describe('portal Page Studio provisioning handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireClientAuth.mockResolvedValue({ id: 'u1', clientId: 'c1', role: 'manager' })
  })

  it('emits a stable scoped request only for an accepted revision', async () => {
    mocks.queryOne.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 's1', revision: 1, status: 'accepted', source: 'chat', plan: { pages: ['home'], templateId: 'limousine-v1' } })
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[id]/provision.post')
    const binding = { createProvisioning: vi.fn().mockImplementation((job: { requestKey: string, scope: unknown }) => ({ requestKey: job.requestKey, scope: job.scope, phase: 'requested' })) }
    await expect(handler({ id: 's1', body: { expectedRevision: 1 }, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never)).resolves.toEqual({ provisioning: expect.objectContaining({ requestKey: 'page-studio-s1-1', scope: expect.objectContaining({ tenantId: 't1', clientId: 'c1', siteId: 's1' }), job: expect.objectContaining({ phase: 'requested' }) }) })
    expect(binding.createProvisioning).toHaveBeenCalledOnce()
  })

  it('rejects a proposal that has not been accepted', async () => {
    mocks.queryOne.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 's1', revision: 1, status: 'proposed', source: 'template', plan: {} })
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[id]/provision.post')
    await expect(handler({ id: 's1', body: { expectedRevision: 1 } } as never)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('fails explicitly when the provisioner binding is unavailable', async () => {
    mocks.queryOne.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 's1', revision: 1, status: 'accepted', source: 'template', plan: { templateId: 'retail-v1' } })
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[id]/provision.post')
    await expect(handler({ id: 's1', body: { expectedRevision: 1 }, context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('rejects a mismatched Worker response scope', async () => {
    mocks.queryOne.mockResolvedValue({ tenantId: 't1', clientId: 'c1', siteId: 's1', revision: 1, status: 'accepted', source: 'template', plan: { templateId: 'retail-v1' } })
    const binding = { createProvisioning: vi.fn().mockResolvedValue({ requestKey: 'page-studio-s1-1', scope: { tenantId: 'other', clientId: 'c1', businessId: 'c1', siteId: 's1', environment: 'staging' } }) }
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[id]/provision.post')
    await expect(handler({ id: 's1', body: { expectedRevision: 1 }, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } } as never)).rejects.toMatchObject({ statusCode: 503 })
  })
})
