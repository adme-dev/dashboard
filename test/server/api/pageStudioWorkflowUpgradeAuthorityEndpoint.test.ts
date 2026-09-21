import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), authorize: vi.fn(), body: vi.fn(), header: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({ requirePageStudioMachineAuth: mocks.auth }))
vi.mock('~~/server/utils/pageStudio/workflowUpgradeAuthority', () => ({ authorizePageStudioWorkflowUpgrade: mocks.authorize }))
vi.mock('~~/server/utils/pageStudio/http', () => ({ pageStudioInternalHttpError: (_event: unknown, error: unknown) => {
  throw error
} }))
vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.mock('~~/server/utils/pageStudio/businessContentHttp', () => ({ readContentBody: mocks.body }))
vi.stubGlobal('setHeader', mocks.header)
describe('private collection upgrade admission endpoint', () => {
  beforeEach(() => vi.resetAllMocks())
  it('denies before reading an unauthenticated request body', async () => {
    mocks.auth.mockImplementation(() => {
      throw Object.assign(new Error('Denied'), { statusCode: 401 })
    })
    const { default: handler } = await import('~~/server/routes/internal/page-studio/workflow-upgrades/authorize.post')
    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.body).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('uses the deployed environment and prevents caching', async () => {
    const event = { context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_PROVISIONER: { createProvisioning: vi.fn(), readProvisioning: vi.fn() } } } } }
    mocks.body.mockResolvedValue({ intent: 'fixture' })
    mocks.authorize.mockResolvedValue({ retained: true })
    const { default: handler } = await import('~~/server/routes/internal/page-studio/workflow-upgrades/authorize.post')
    expect(await handler(event as never)).toEqual({ retained: true })
    expect(mocks.authorize).toHaveBeenCalledWith({ intent: 'fixture' }, 'staging')
    expect(mocks.header).toHaveBeenCalledWith(event, 'cache-control', 'no-store')
  })
  it('fails closed if environment configuration is missing', async () => {
    const { default: handler } = await import('~~/server/routes/internal/page-studio/workflow-upgrades/authorize.post')
    await expect(handler({ context: {} } as never)).rejects.toThrow()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
})
