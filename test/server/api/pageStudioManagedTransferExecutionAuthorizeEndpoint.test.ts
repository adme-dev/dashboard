import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), authorize: vi.fn(), readBody: vi.fn(), setHeader: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({ requirePageStudioMachineAuth: mocks.auth }))
vi.mock('~~/server/utils/pageStudio/managedTransferExecution', () => ({ authorizeManagedTransferExecution: mocks.authorize }))
vi.mock('~~/server/utils/pageStudio/http', () => ({ pageStudioInternalHttpError: (_event: unknown, error: unknown) => {
  throw error
} }))
vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', mocks.readBody)
vi.stubGlobal('setHeader', mocks.setHeader)

const endpoint = () => import('~~/server/routes/internal/page-studio/managed-transfers/execution/authorize.post')
const event = (environment: unknown = 'production') => ({ context: { cloudflare: { env: {
  PAGE_STUDIO_PROVISIONING_ENVIRONMENT: environment,
  PAGE_STUDIO_PROVISIONER: { readProvisioning: vi.fn(), createProvisioning: vi.fn() }
} } } })

describe('private managed transfer execution authorize endpoint', () => {
  beforeEach(() => vi.resetAllMocks())
  it('requires machine authentication before reading private transfer input', async () => {
    mocks.auth.mockImplementation(() => {
      throw Object.assign(new Error('Denied'), { statusCode: 401 })
    })
    const { default: handler } = await endpoint()
    await expect(handler(event() as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.readBody).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it.each(['staging', 'preview', undefined])('does not admit a production transfer on %s configuration', async (environment) => {
    const current = event(environment)
    if (environment === undefined) delete current.context.cloudflare.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT
    const { default: handler } = await endpoint()
    await expect(handler(current as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.readBody).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('uses distinct retained transfer authority and disables response caching', async () => {
    const current = event(), body = { operationId: '00000000-0000-4000-8000-000000000001', intentDigest: 'a'.repeat(64), successor: { scriptName: `ps-content-${'b'.repeat(32)}` } }
    mocks.readBody.mockResolvedValue(body)
    mocks.authorize.mockResolvedValue({ private: 'retained-execution-request' })
    const { default: handler } = await endpoint()
    await expect(handler(current as never)).resolves.toEqual({ private: 'retained-execution-request' })
    expect(mocks.setHeader).toHaveBeenCalledWith(current, 'cache-control', 'no-store')
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(body)
  })
})
