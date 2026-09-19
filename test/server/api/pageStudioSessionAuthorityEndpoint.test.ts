import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ machine: vi.fn(), verify: vi.fn(), authority: vi.fn(), body: vi.fn(), header: vi.fn(), setHeader: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({ requirePageStudioMachineAuth: mocks.machine }))
vi.mock('~~/server/utils/pageStudio/sessionAuthority', () => ({ assertPageStudioSessionAuthority: mocks.authority }))
vi.mock('~~/server/utils/pageStudio/sessions', async importOriginal => ({
  ...await importOriginal<object>(), verifyPageStudioSessionToken: mocks.verify,
  resolvePageStudioSessionEnvironment: () => ({ issuer: 'https://dashboard.test' }),
  resolvePageStudioSessionPublicKey: () => 'public-key'
}))
vi.mock('~~/server/utils/pageStudio/http', () => ({
  pageStudioInternalHttpError: (_event: unknown, error: unknown) => {
    throw error
  }
}))
vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', mocks.body)
vi.stubGlobal('getHeader', mocks.header)
vi.stubGlobal('setHeader', mocks.setHeader)

describe('internal session authority endpoint', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.header.mockReturnValue('signed-token')
    mocks.body.mockResolvedValue({ capability: 'workspace:preview' })
    mocks.verify.mockResolvedValue({ nonce: 'nonce_session_authority' })
  })
  const handler = async () => (await import('~~/server/routes/internal/page-studio/sessions/authorize.post')).default

  it('authenticates the service before reading input', async () => {
    mocks.machine.mockImplementation(() => {
      throw Object.assign(new Error('Denied'), { statusCode: 401 })
    })
    await expect((await handler())({ context: {} } as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.body).not.toHaveBeenCalled()
    expect(mocks.authority).not.toHaveBeenCalled()
  })
  it('verifies the signed identity, checks current authority and prohibits caching', async () => {
    const event = { context: {} }
    await expect((await handler())(event as never)).resolves.toEqual({ authorized: true, sessionId: 'nonce_session_authority', capability: 'workspace:preview' })
    expect(mocks.verify).toHaveBeenCalledWith('signed-token', 'public-key', 'https://dashboard.test')
    expect(mocks.authority).toHaveBeenCalledWith({ nonce: 'nonce_session_authority' }, 'workspace:preview')
    expect(mocks.setHeader).toHaveBeenCalledWith(event, 'cache-control', 'no-store')
  })
  it.each([{ capability: 'shell' }, { capability: 'workspace:preview', tenantId: 'forged' }, {}])('rejects unsupported input without consulting authority', async (body) => {
    mocks.body.mockResolvedValue(body)
    await expect((await handler())({ context: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.authority).not.toHaveBeenCalled()
  })
  it('requires the editor token as well as service credentials', async () => {
    mocks.header.mockReturnValue(undefined)
    await expect((await handler())({ context: {} } as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(mocks.authority).not.toHaveBeenCalled()
  })
  it('does not return authority when the current check denies it', async () => {
    mocks.authority.mockRejectedValue(Object.assign(new Error('Denied'), { statusCode: 403 }))
    await expect((await handler())({ context: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
  })
})
