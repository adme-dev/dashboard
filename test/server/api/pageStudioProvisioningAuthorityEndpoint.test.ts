import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), authorize: vi.fn(), readBody: vi.fn(), setHeader: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({ requirePageStudioMachineAuth: mocks.auth }))
vi.mock('~~/server/utils/pageStudio/provisioningAuthority', () => ({ authorizePageStudioProvisioning: mocks.authorize }))
vi.mock('~~/server/utils/pageStudio/http', () => ({ pageStudioInternalHttpError: (_event: unknown, error: unknown) => {
  throw error
} }))
vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', mocks.readBody)
vi.stubGlobal('setHeader', mocks.setHeader)

describe('internal provisioning authority endpoint', () => {
  beforeEach(() => vi.resetAllMocks())

  it('authenticates before reading user input or accessing authority', async () => {
    mocks.auth.mockImplementation(() => {
      throw Object.assign(new Error('Denied'), { statusCode: 401 })
    })
    const { default: handler } = await import('~~/server/routes/internal/page-studio/provisioning/authorize.post')
    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.readBody).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it('uses only the trusted binding and prevents caching of the authority result', async () => {
    const binding = { readProvisioning: vi.fn() }
    const body = { requestKey: 'request', scope: {} }
    const event = { context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } } }
    mocks.readBody.mockResolvedValue(body)
    mocks.authorize.mockResolvedValue({ job: {}, userId: 'original-owner' })
    const { default: handler } = await import('~~/server/routes/internal/page-studio/provisioning/authorize.post')
    await expect(handler(event as never)).resolves.toEqual({ job: {}, userId: 'original-owner' })
    expect(mocks.setHeader).toHaveBeenCalledWith(event, 'cache-control', 'no-store')
    expect(mocks.authorize).toHaveBeenCalledWith(binding, body)
  })
})
